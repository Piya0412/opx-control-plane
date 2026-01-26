import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface KnowledgeDocumentsTableProps {
  /**
   * Table name (optional, auto-generated if not provided)
   */
  tableName?: string;

  /**
   * Enable point-in-time recovery (default: true)
   */
  pointInTimeRecovery?: boolean;
}

/**
 * DynamoDB table for knowledge document metadata.
 * 
 * Schema:
 * - PK: documentId (SHA256 hash)
 * - SK: version (semantic version)
 * - Attributes: title, type, createdAt, lastUpdated, author, tags, s3Key, status
 * 
 * GSIs:
 * - type-createdAt-index: Query by type, sort by creation date
 * - status-index: Query by status (ACTIVE, DEPRECATED, ARCHIVED)
 * 
 * Features:
 * - Point-in-time recovery (audit trail)
 * - On-demand billing (cost-effective for low volume)
 * - Encryption at rest (AWS managed)
 */
export class KnowledgeDocumentsTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: KnowledgeDocumentsTableProps = {}) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'Table', {
      tableName: props.tableName,
      partitionKey: {
        name: 'documentId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: props.pointInTimeRecovery !== false, // Default: true
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Never delete metadata
    });

    // GSI: Query by type, sort by creation date
    this.table.addGlobalSecondaryIndex({
      indexName: 'type-createdAt-index',
      partitionKey: {
        name: 'type',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI: Query by status
    this.table.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Output table name
    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'Knowledge documents DynamoDB table name',
      exportName: 'KnowledgeDocumentsTableName',
    });

    // Output table ARN
    new cdk.CfnOutput(this, 'TableArn', {
      value: this.table.tableArn,
      description: 'Knowledge documents DynamoDB table ARN',
      exportName: 'KnowledgeDocumentsTableArn',
    });
  }
}
