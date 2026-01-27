import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as opensearchserverless from 'aws-cdk-lib/aws-opensearchserverless';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { Construct } from 'constructs';

export interface BedrockKnowledgeBaseProps {
  /**
   * S3 bucket containing chunked documents
   */
  corpusBucket: s3.IBucket;

  /**
   * Knowledge Base name
   */
  knowledgeBaseName: string;

  /**
   * OpenSearch collection name
   */
  collectionName: string;

  /**
   * Vector index name
   */
  vectorIndexName: string;

  /**
   * Embedding model ARN (default: Titan Embed Text v1)
   */
  embeddingModelArn?: string;

  /**
   * Skip Knowledge Base creation (for two-phase deployment)
   * Set to true for initial deployment, false after index is created
   */
  skipKnowledgeBase?: boolean;

  /**
   * Admin principal ARN for index creation (temporary)
   * Add your user ARN here to create the index manually
   */
  adminPrincipalArn?: string;
}

/**
 * Bedrock Knowledge Base with OpenSearch Serverless.
 * 
 * Phase 7.3 Implementation:
 * - Split IAM roles (ingestion vs runtime)
 * - S3 bucket: opx-knowledge-corpus (renamed from opx-knowledge-base)
 * - Vector-only search (no hybrid, for determinism)
 * - Manual ingestion only
 * - Read-only agent access
 */
export class BedrockKnowledgeBase extends Construct {
  public readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  public readonly dataSource: bedrock.CfnDataSource;
  public readonly collection: opensearchserverless.CfnCollection;
  public readonly ingestionRole: iam.Role;
  public readonly runtimeRole: iam.Role;
  public readonly knowledgeBaseId: string;

  constructor(scope: Construct, id: string, props: BedrockKnowledgeBaseProps) {
    super(scope, id);

    const region = cdk.Stack.of(this).region;

    // Default embedding model: Titan Embed Text v1
    const embeddingModelArn = props.embeddingModelArn || 
      `arn:aws:bedrock:${region}::foundation-model/amazon.titan-embed-text-v1`;

    // ========================================
    // 1. IAM Roles (Split: Ingestion vs Runtime)
    // ========================================

    // Ingestion Role (Write Access)
    this.ingestionRole = new iam.Role(this, 'IngestionRole', {
      roleName: 'BedrockKnowledgeBaseIngestionRole',
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      description: 'Bedrock Knowledge Base ingestion role (write access to OpenSearch)',
    });

    // Runtime Role (Read-Only Access)
    this.runtimeRole = new iam.Role(this, 'RuntimeRole', {
      roleName: 'BedrockKnowledgeBaseRuntimeRole',
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      description: 'Bedrock Knowledge Base runtime role (read-only access to OpenSearch)',
    });

    // Grant S3 read access to ingestion role
    props.corpusBucket.grantRead(this.ingestionRole);

    // Grant Bedrock model invocation to both roles
    this.ingestionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: [embeddingModelArn],
    }));

    this.runtimeRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: [embeddingModelArn],
    }));

    // Grant OpenSearch Serverless API access to both roles
    // This is required in addition to the data access policy
    this.ingestionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['aoss:APIAccessAll'],
      resources: ['*'], // Will be scoped by data access policy
    }));

    this.runtimeRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['aoss:APIAccessAll'],
      resources: ['*'], // Will be scoped by data access policy
    }));

    // ========================================
    // 2. OpenSearch Serverless Collection
    // ========================================

    // Encryption policy
    const encryptionPolicy = new opensearchserverless.CfnSecurityPolicy(this, 'EncryptionPolicy', {
      name: `${props.collectionName}-encryption`,
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [
          {
            ResourceType: 'collection',
            Resource: [`collection/${props.collectionName}`],
          },
        ],
        AWSOwnedKey: true,
      }),
    });

    // Network policy (VPC access)
    const networkPolicy = new opensearchserverless.CfnSecurityPolicy(this, 'NetworkPolicy', {
      name: `${props.collectionName}-network`,
      type: 'network',
      policy: JSON.stringify([
        {
          Rules: [
            {
              ResourceType: 'collection',
              Resource: [`collection/${props.collectionName}`],
            },
            {
              ResourceType: 'dashboard',
              Resource: [`collection/${props.collectionName}`],
            },
          ],
          AllowFromPublic: true, // Required by OpenSearch Serverless (access still controlled by IAM)
        },
      ]),
    });

    // Data access policy - SPLIT (Ingestion vs Runtime)
    // Note: Collection and Index must be in separate policy entries
    const policyRules: any[] = [
      // Ingestion role - Full access to indexes
      {
        Rules: [
          {
            ResourceType: 'index',
            Resource: [`index/${props.collectionName}/*`],
            Permission: ['aoss:*'], // Full index access for ingestion
          },
        ],
        Principal: [this.ingestionRole.roleArn],
      },
      // Runtime role - Read-only access to indexes
      {
        Rules: [
          {
            ResourceType: 'index',
            Resource: [`index/${props.collectionName}/*`],
            Permission: ['aoss:ReadDocument', 'aoss:DescribeIndex'], // Read-only for runtime
          },
        ],
        Principal: [this.runtimeRole.roleArn],
      },
    ];

    // Add admin principal if provided (for manual index creation)
    if (props.adminPrincipalArn) {
      policyRules.push({
        Rules: [
          {
            ResourceType: 'index',
            Resource: [`index/${props.collectionName}/*`],
            Permission: ['aoss:*'], // Full access for admin
          },
        ],
        Principal: [props.adminPrincipalArn],
      });
    }

    const dataAccessPolicy = new opensearchserverless.CfnAccessPolicy(this, 'DataAccessPolicy', {
      name: `${props.collectionName}-access`,
      type: 'data',
      policy: JSON.stringify(policyRules),
    });

    // OpenSearch Serverless collection
    this.collection = new opensearchserverless.CfnCollection(this, 'Collection', {
      name: props.collectionName,
      type: 'VECTORSEARCH',
      description: 'Vector search collection for knowledge base',
      standbyReplicas: 'DISABLED', // Cost optimization
    });

    this.collection.addDependency(encryptionPolicy);
    this.collection.addDependency(networkPolicy);
    this.collection.addDependency(dataAccessPolicy);

    // ========================================
    // 3. Bedrock Knowledge Base (Optional - Two-Phase Deployment)
    // ========================================
    // Skip Knowledge Base creation if skipKnowledgeBase is true
    // This allows deploying the collection first, creating the index manually,
    // then deploying the Knowledge Base in a second deployment

    if (!props.skipKnowledgeBase) {
      this.knowledgeBase = new bedrock.CfnKnowledgeBase(this, 'KnowledgeBase', {
        name: props.knowledgeBaseName,
        description: 'Runbooks and postmortems for incident resolution',
        roleArn: this.ingestionRole.roleArn, // Use ingestion role (has S3 and OpenSearch write access)
        knowledgeBaseConfiguration: {
          type: 'VECTOR',
          vectorKnowledgeBaseConfiguration: {
            embeddingModelArn: embeddingModelArn,
          },
        },
        storageConfiguration: {
          type: 'OPENSEARCH_SERVERLESS',
          opensearchServerlessConfiguration: {
            collectionArn: this.collection.attrArn,
            vectorIndexName: props.vectorIndexName,
            fieldMapping: {
              vectorField: 'embedding',
              textField: 'content',
              metadataField: 'metadata',
            },
          },
        },
      });

      this.knowledgeBase.addDependency(this.collection);
      this.knowledgeBase.addDependency(dataAccessPolicy);
      this.knowledgeBase.addDependency(encryptionPolicy);
      this.knowledgeBase.addDependency(networkPolicy);
      this.knowledgeBaseId = this.knowledgeBase.attrKnowledgeBaseId;

      // ========================================
      // 4. Data Source (S3)
      // ========================================

      this.dataSource = new bedrock.CfnDataSource(this, 'DataSource', {
        name: `${props.knowledgeBaseName}-s3-source`,
        knowledgeBaseId: this.knowledgeBaseId,
        dataSourceConfiguration: {
          type: 'S3',
          s3Configuration: {
            bucketArn: props.corpusBucket.bucketArn,
            inclusionPrefixes: ['documents/'], // Raw documents directory
          },
        },
        vectorIngestionConfiguration: {
          chunkingConfiguration: {
            chunkingStrategy: 'FIXED_SIZE', // Let Bedrock chunk the documents
            fixedSizeChunkingConfiguration: {
              maxTokens: 300,
              overlapPercentage: 20,
            },
          },
        },
      });

      this.dataSource.node.addDependency(this.knowledgeBase);
    } else {
      // Skip Knowledge Base creation - just deploy collection
      // User must create index manually before second deployment
      this.knowledgeBaseId = 'NOT_CREATED_YET';
    }

    // ========================================
    // 5. Outputs
    // ========================================

    // Always output collection endpoint (available in both phases)
    new cdk.CfnOutput(this, 'CollectionEndpoint', {
      value: this.collection.attrCollectionEndpoint,
      description: 'OpenSearch Serverless collection endpoint',
      exportName: 'OpenSearchCollectionEndpoint',
    });

    new cdk.CfnOutput(this, 'CollectionArn', {
      value: this.collection.attrArn,
      description: 'OpenSearch Serverless collection ARN',
      exportName: 'OpenSearchCollectionArn',
    });

    // Only output Knowledge Base details if it was created
    if (!props.skipKnowledgeBase && this.knowledgeBase) {
      new cdk.CfnOutput(this, 'KnowledgeBaseId', {
        value: this.knowledgeBaseId,
        description: 'Bedrock Knowledge Base ID',
        exportName: 'BedrockKnowledgeBaseId',
      });

      new cdk.CfnOutput(this, 'KnowledgeBaseArn', {
        value: this.knowledgeBase.attrKnowledgeBaseArn,
        description: 'Bedrock Knowledge Base ARN',
        exportName: 'BedrockKnowledgeBaseArn',
      });

      new cdk.CfnOutput(this, 'DataSourceId', {
        value: this.dataSource!.attrDataSourceId,
        description: 'Bedrock Data Source ID',
        exportName: 'BedrockDataSourceId',
      });
    }

    new cdk.CfnOutput(this, 'IngestionRoleArn', {
      value: this.ingestionRole.roleArn,
      description: 'Bedrock Knowledge Base ingestion role ARN',
      exportName: 'BedrockIngestionRoleArn',
    });

    new cdk.CfnOutput(this, 'RuntimeRoleArn', {
      value: this.runtimeRole.roleArn,
      description: 'Bedrock Knowledge Base runtime role ARN',
      exportName: 'BedrockRuntimeRoleArn',
    });
  }

  /**
   * Grant read-only access to Knowledge Base for agents.
   * 
   * Agents can:
   * - Retrieve from Knowledge Base
   * 
   * Agents CANNOT:
   * - Create/update/delete data sources
   * - Start ingestion jobs
   * - Mutate Knowledge Base
   */
  public grantRetrieve(grantee: iam.IGrantable): iam.Grant {
    return iam.Grant.addToPrincipal({
      grantee,
      actions: ['bedrock:Retrieve'],
      resourceArns: [this.knowledgeBase.attrKnowledgeBaseArn],
    });
  }

  /**
   * Explicitly deny ingestion permissions for agents.
   * 
   * This is a fail-closed security boundary.
   */
  public denyIngestion(grantee: iam.IGrantable): void {
    const principal = grantee.grantPrincipal;
    if (principal instanceof iam.Role || principal instanceof iam.User) {
      principal.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: [
          'bedrock:CreateDataSource',
          'bedrock:UpdateDataSource',
          'bedrock:DeleteDataSource',
          'bedrock:StartIngestionJob',
        ],
        resources: ['*'],
      }));
    }
  }
}
