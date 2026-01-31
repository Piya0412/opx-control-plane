/**
 * Phase 8.7: Agent Recommendations Table
 * 
 * PURPOSE:
 * - Store advisory outputs from agent executions
 * - Enable CLI inspection and audit
 * - Completely decoupled from incident state
 * 
 * SAFETY:
 * - Advisory only (not authoritative)
 * - Fail-open persistence (non-blocking)
 * - TTL enabled (90 days)
 * - No foreign keys to incident tables
 */

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface AgentRecommendationsTableProps {
  readonly environment?: string;
  readonly ttlDays?: number;
}

export class AgentRecommendationsTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: AgentRecommendationsTableProps) {
    super(scope, id);

    const environment = props?.environment || 'dev';
    const ttlDays = props?.ttlDays || 90;

    // Create recommendations table
    this.table = new dynamodb.Table(this, 'Table', {
      tableName: `opx-agent-recommendations-${environment}`,
      partitionKey: {
        name: 'recommendationId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: 'ttl',
    });

    // GSI 1: Query by incident ID (most common pattern)
    this.table.addGlobalSecondaryIndex({
      indexName: 'incidentId-timestamp-index',
      partitionKey: {
        name: 'incidentId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI 2: Query by agent type
    this.table.addGlobalSecondaryIndex({
      indexName: 'agentType-timestamp-index',
      partitionKey: {
        name: 'agentType',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI 3: Query by execution ID
    this.table.addGlobalSecondaryIndex({
      indexName: 'executionId-timestamp-index',
      partitionKey: {
        name: 'executionId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Tags
    cdk.Tags.of(this.table).add('Phase', '8.7');
    cdk.Tags.of(this.table).add('Component', 'AgentRecommendations');
    cdk.Tags.of(this.table).add('Purpose', 'Advisory');
  }
}
