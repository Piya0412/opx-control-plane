/**
 * Phase 7.5: Knowledge Retrieval Metrics Table
 * 
 * DynamoDB table for detailed query analytics.
 * 
 * CRITICAL: This table is NOT AUTHORITATIVE
 * - NOT replayed
 * - NOT used for decisions
 * - NOT part of incident lifecycle
 * - Pure analytics exhaust
 */

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface KnowledgeRetrievalMetricsTableProps {
  /**
   * Table name
   */
  readonly tableName?: string;

  /**
   * TTL in days (default: 90)
   */
  readonly ttlDays?: number;
}

export class KnowledgeRetrievalMetricsTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: KnowledgeRetrievalMetricsTableProps = {}) {
    super(scope, id);

    const tableName = props.tableName || 'opx-knowledge-retrieval-metrics';
    const ttlDays = props.ttlDays || 90;

    // ========================================================================
    // DYNAMODB TABLE
    // ========================================================================

    this.table = new dynamodb.Table(this, 'Table', {
      tableName,
      partitionKey: {
        name: 'date_query_hash',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: false, // Analytics data, not critical
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Retain for audit
    });

    // ========================================================================
    // GLOBAL SECONDARY INDEX
    // ========================================================================

    this.table.addGlobalSecondaryIndex({
      indexName: 'query_text-timestamp-index',
      partitionKey: {
        name: 'query_text_hash',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ========================================================================
    // OUTPUTS
    // ========================================================================

    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'Knowledge Retrieval Metrics Table Name',
      exportName: 'OpxKnowledgeRetrievalMetricsTableName',
    });

    new cdk.CfnOutput(this, 'TableArn', {
      value: this.table.tableArn,
      description: 'Knowledge Retrieval Metrics Table ARN',
      exportName: 'OpxKnowledgeRetrievalMetricsTableArn',
    });
  }
}
