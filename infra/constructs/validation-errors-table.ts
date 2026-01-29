import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface ValidationErrorsTableProps {
  readonly tableName?: string;
}

export class ValidationErrorsTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: ValidationErrorsTableProps) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'Table', {
      tableName: props?.tableName || 'opx-validation-errors',
      partitionKey: {
        name: 'errorId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI for querying by agent and timestamp
    this.table.addGlobalSecondaryIndex({
      indexName: 'agent-timestamp-index',
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

    // GSI for querying by validation layer
    this.table.addGlobalSecondaryIndex({
      indexName: 'layer-timestamp-index',
      partitionKey: {
        name: 'validationLayer',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Tags
    cdk.Tags.of(this.table).add('Phase', '8.3');
    cdk.Tags.of(this.table).add('Component', 'Validation');
  }
}
