/**
 * Phase 6 Step 1: Agent Executions Table
 * 
 * Stores agent execution logs for observability.
 */

import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class AgentExecutionsTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'AgentExecutions', {
      tableName: 'opx-agent-executions',
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
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Observability only
    });

    // GSI for querying by incident
    this.table.addGlobalSecondaryIndex({
      indexName: 'IncidentIndex',
      partitionKey: {
        name: 'incidentId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'executedAt',
        type: dynamodb.AttributeType.STRING,
      },
    });
  }
}
