/**
 * Advisory Recommendations Table Construct
 * 
 * DynamoDB table for Phase 6 advisory outputs.
 * 
 * CRITICAL RULES:
 * - Advisory outputs are READ-ONLY for humans
 * - No automatic execution
 * - Append-only (no updates)
 * - TTL: 90 days
 */

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface AdvisoryTableProps {
  /**
   * Table name
   * @default 'opx-agent-recommendations'
   */
  tableName?: string;

  /**
   * Removal policy
   * @default cdk.RemovalPolicy.RETAIN
   */
  removalPolicy?: cdk.RemovalPolicy;
}

/**
 * Advisory Recommendations Table
 * 
 * Stores Phase 6 intelligence recommendations for human review.
 * 
 * Schema:
 * - PK: INCIDENT#{incidentId}
 * - SK: RECOMMENDATION#{executionId}
 * - Attributes: recommendation, consensus, cost, execution_summary, timestamp
 * - TTL: 90 days
 */
export class AdvisoryTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: AdvisoryTableProps = {}) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'Table', {
      tableName: props.tableName || 'opx-agent-recommendations',
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: props.removalPolicy || cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true, // Enable PITR for production safety
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // ========================================================================
    // OUTPUTS
    // ========================================================================

    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'Advisory recommendations table name',
    });

    new cdk.CfnOutput(this, 'TableArn', {
      value: this.table.tableArn,
      description: 'Advisory recommendations table ARN',
    });
  }
}
