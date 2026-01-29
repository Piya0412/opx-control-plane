import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface LLMTracesTableProps {
  readonly tableName: string;
  readonly ttlDays?: number;
}

/**
 * DynamoDB table for LLM trace storage (Phase 8.1)
 * 
 * GOVERNANCE RULES (LOCKED):
 * - ✅ incidentId allowed in DynamoDB (for querying)
 * - ❌ incidentId NEVER as CloudWatch metric dimension
 * - ❌ incidentId NEVER as GSI key alone
 * - TTL = 90 days (automatic cleanup)
 * - Non-authoritative (observability only)
 */
export class LLMTracesTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: LLMTracesTableProps) {
    super(scope, id);

    const ttlDays = props.ttlDays ?? 90;

    // DynamoDB table for LLM traces
    this.table = new dynamodb.Table(this, 'Table', {
      tableName: props.tableName,
      partitionKey: {
        name: 'traceId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'ttl', // 90-day TTL for automatic cleanup
    });

    // GSI: Query traces by agent and time
    // NOTE: incidentId is NOT used as GSI key (cardinality protection)
    this.table.addGlobalSecondaryIndex({
      indexName: 'agentId-timestamp-index',
      partitionKey: {
        name: 'agentId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Tags for cost tracking
    cdk.Tags.of(this.table).add('Phase', '8.1');
    cdk.Tags.of(this.table).add('Component', 'LLMObservability');
    cdk.Tags.of(this.table).add('TTL', `${ttlDays}days`);

    // Outputs
    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'LLM traces table name (Phase 8.1)',
    });

    new cdk.CfnOutput(this, 'TableArn', {
      value: this.table.tableArn,
      description: 'LLM traces table ARN (Phase 8.1)',
    });
  }

  /**
   * Grant read access to traces table
   */
  public grantReadData(grantee: cdk.aws_iam.IGrantable): cdk.aws_iam.Grant {
    return this.table.grantReadData(grantee);
  }

  /**
   * Grant write access to traces table
   */
  public grantWriteData(grantee: cdk.aws_iam.IGrantable): cdk.aws_iam.Grant {
    return this.table.grantWriteData(grantee);
  }

  /**
   * Grant read/write access to traces table
   */
  public grantReadWriteData(grantee: cdk.aws_iam.IGrantable): cdk.aws_iam.Grant {
    return this.table.grantReadWriteData(grantee);
  }
}
