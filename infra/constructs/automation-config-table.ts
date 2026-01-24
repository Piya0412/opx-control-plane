/**
 * Phase 5 - Step 7: Automation Config Table
 * 
 * DynamoDB table for automation configuration (kill switch, rate limiting).
 */

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface AutomationConfigTableProps {
  /**
   * Table name
   */
  tableName?: string;

  /**
   * Removal policy
   */
  removalPolicy?: cdk.RemovalPolicy;
}

/**
 * Automation config table construct
 */
export class AutomationConfigTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: AutomationConfigTableProps = {}) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'Table', {
      tableName: props.tableName || 'opx-automation-config',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: props.removalPolicy || cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: 'expiresAt',
    });

    // Output table name
    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'Automation config table name',
    });

    new cdk.CfnOutput(this, 'TableArn', {
      value: this.table.tableArn,
      description: 'Automation config table ARN',
    });
  }
}
