import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class GuardrailViolationsTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'Table', {
      tableName: 'opx-guardrail-violations',
      partitionKey: {
        name: 'violationId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Permanent records
      
      // No TTL - violations are permanent records for compliance
    });

    // GSI: Query by agent ID and time range
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

    // GSI: Query by violation type and time range
    this.table.addGlobalSecondaryIndex({
      indexName: 'type-timestamp-index',
      partitionKey: {
        name: 'violationType',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Output
    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'Guardrail Violations Table Name',
      exportName: 'OPX-GuardrailViolationsTable',
    });

    new cdk.CfnOutput(this, 'TableArn', {
      value: this.table.tableArn,
      description: 'Guardrail Violations Table ARN',
    });
  }
}
