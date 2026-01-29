import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { BedrockKnowledgeBase } from '../../constructs/bedrock-knowledge-base.js';

/**
 * Phase 7.3 Knowledge Base Stack
 * 
 * Deploys:
 * - Bedrock Knowledge Base with OpenSearch Serverless (Phase 7.3)
 * 
 * References (does NOT own):
 * - S3 bucket for knowledge corpus (created in Phase 7.1 / main stack)
 * - DynamoDB table for document metadata (created in Phase 7.1 / main stack)
 * 
 * Isolated from Phase 1-6 infrastructure.
 */
export class Phase7KnowledgeBaseStack extends cdk.Stack {
  public readonly corpusBucket: s3.IBucket;
  public readonly documentsTable: dynamodb.ITable;
  public readonly knowledgeBase: BedrockKnowledgeBase;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // Phase 7.1: Reference Existing Resources
    // ========================================
    // These were created in the main OpxControlPlaneStack (Phase 7.1)
    // We reference them here but do NOT own them

    // S3 Bucket: Knowledge Corpus (existing)
    this.corpusBucket = s3.Bucket.fromBucketName(
      this,
      'KnowledgeCorpusBucket',
      'opx-knowledge-corpus'
    );

    // DynamoDB Table: Knowledge Documents (existing)
    this.documentsTable = dynamodb.Table.fromTableName(
      this,
      'KnowledgeDocumentsTable',
      'opx-knowledge-documents'
    );

    // ========================================
    // Phase 7.3: Bedrock Knowledge Base
    // ========================================
    // DEPLOYMENT STRATEGY: Two-phase deployment
    // 
    // Phase 1 (this deployment): Deploy OpenSearch collection only
    //   - Set skipKnowledgeBase: true
    //   - Deploy stack
    //   - Run: ./scripts/init-opensearch-index.sh
    // 
    // Phase 2 (after manual index creation): Deploy Knowledge Base
    //   - Set skipKnowledgeBase: false
    //   - Deploy stack again
    //
    // Why: Bedrock Knowledge Base requires the vector index to exist,
    // but the index can only be created after the collection is active.

    // PHASE 2: Deploy Knowledge Base (index now exists)
    const collectionName = 'opx-knowledge';
    const vectorIndexName = 'opx-knowledge-index';

    this.knowledgeBase = new BedrockKnowledgeBase(this, 'BedrockKnowledgeBase', {
      corpusBucket: this.corpusBucket,
      knowledgeBaseName: 'opx-knowledge-base',
      collectionName: collectionName,
      vectorIndexName: vectorIndexName,
      skipKnowledgeBase: false, // PHASE 2: Create Knowledge Base now
      adminPrincipalArn: 'arn:aws:iam::998461587244:user/Dev-Shubh', // Keep for now, remove later
    });

    // ========================================
    // Outputs
    // ========================================

    new cdk.CfnOutput(this, 'KnowledgeCorpusBucketName', {
      value: this.corpusBucket.bucketName,
      description: 'S3 bucket for knowledge corpus (Phase 7.1 - referenced)',
      exportName: 'OpxPhase7-KnowledgeCorpusBucketName',
    });

    new cdk.CfnOutput(this, 'KnowledgeDocumentsTableName', {
      value: this.documentsTable.tableName,
      description: 'DynamoDB table for document metadata (Phase 7.1 - referenced)',
      exportName: 'OpxPhase7-KnowledgeDocumentsTableName',
    });

    // Always output collection details (available in Phase 1)
    new cdk.CfnOutput(this, 'OpenSearchCollectionEndpoint', {
      value: this.knowledgeBase.collection.attrCollectionEndpoint,
      description: 'OpenSearch Serverless collection endpoint (Phase 7.3)',
      exportName: 'OpxPhase7-OpenSearchCollectionEndpoint',
    });

    new cdk.CfnOutput(this, 'OpenSearchCollectionArn', {
      value: this.knowledgeBase.collection.attrArn,
      description: 'OpenSearch Serverless collection ARN (Phase 7.3)',
      exportName: 'OpxPhase7-OpenSearchCollectionArn',
    });

    // Always output IAM roles (available in Phase 1)
    new cdk.CfnOutput(this, 'KnowledgeBaseIngestionRoleArn', {
      value: this.knowledgeBase.ingestionRole.roleArn,
      description: 'Bedrock Knowledge Base ingestion role ARN (Phase 7.3)',
      exportName: 'OpxPhase7-KnowledgeBaseIngestionRoleArn',
    });

    new cdk.CfnOutput(this, 'KnowledgeBaseRuntimeRoleArn', {
      value: this.knowledgeBase.runtimeRole.roleArn,
      description: 'Bedrock Knowledge Base runtime role ARN (Phase 7.3)',
      exportName: 'OpxPhase7-KnowledgeBaseRuntimeRoleArn',
    });

    // Only output Knowledge Base details if it was created (Phase 2)
    if (this.knowledgeBase.knowledgeBase) {
      new cdk.CfnOutput(this, 'KnowledgeBaseId', {
        value: this.knowledgeBase.knowledgeBaseId,
        description: 'Bedrock Knowledge Base ID (Phase 7.3)',
        exportName: 'OpxPhase7-KnowledgeBaseId',
      });

      new cdk.CfnOutput(this, 'KnowledgeBaseArn', {
        value: this.knowledgeBase.knowledgeBase.attrKnowledgeBaseArn,
        description: 'Bedrock Knowledge Base ARN (Phase 7.3)',
        exportName: 'OpxPhase7-KnowledgeBaseArn',
      });

      new cdk.CfnOutput(this, 'KnowledgeBaseDataSourceId', {
        value: this.knowledgeBase.dataSource!.attrDataSourceId,
        description: 'Bedrock Knowledge Base data source ID (Phase 7.3)',
        exportName: 'OpxPhase7-KnowledgeBaseDataSourceId',
      });
    }
  }
}
