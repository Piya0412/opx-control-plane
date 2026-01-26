/**
 * Phase 6 Week 5: LangGraph Checkpoint Table
 * 
 * DynamoDB table for persisting LangGraph execution state.
 * Enables resume-from-checkpoint and deterministic replay.
 * 
 * CRITICAL RULES:
 * 1. Partition key: session_id (unique per execution)
 * 2. Sort key: checkpoint_id (format: node_id#attempt)
 * 3. TTL: 30 days (automatic cleanup)
 * 4. Point-in-time recovery enabled
 * 5. On-demand billing (unpredictable load)
 */

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface LangGraphCheckpointTableProps {
  /**
   * Environment name (e.g., 'dev', 'prod')
   */
  readonly environment?: string;
}

export class LangGraphCheckpointTable extends Construct {
  /**
   * DynamoDB table for LangGraph checkpoints
   */
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: LangGraphCheckpointTableProps) {
    super(scope, id);

    const environment = props?.environment || 'dev';

    // ========================================================================
    // DYNAMODB TABLE
    // ========================================================================

    this.table = new dynamodb.Table(this, 'CheckpointTable', {
      tableName: `opx-langgraph-checkpoints-${environment}`,
      
      // Partition key: session_id (unique per graph execution)
      partitionKey: {
        name: 'session_id',
        type: dynamodb.AttributeType.STRING,
      },
      
      // Sort key: checkpoint_id (format: node_id#attempt)
      sortKey: {
        name: 'checkpoint_id',
        type: dynamodb.AttributeType.STRING,
      },
      
      // On-demand billing (unpredictable load)
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      
      // Point-in-time recovery (disaster recovery)
      pointInTimeRecovery: true,
      
      // Encryption at rest (AWS managed key)
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      
      // TTL attribute (automatic cleanup after 30 days)
      timeToLiveAttribute: 'ttl',
      
      // Removal policy (RETAIN in production, DESTROY in dev)
      removalPolicy: environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // ========================================================================
    // GLOBAL SECONDARY INDEX (Optional - for querying by incident_id)
    // ========================================================================

    this.table.addGlobalSecondaryIndex({
      indexName: 'incident-id-index',
      partitionKey: {
        name: 'incident_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ========================================================================
    // CLOUDFORMATION OUTPUTS
    // ========================================================================

    new cdk.CfnOutput(this, 'CheckpointTableName', {
      value: this.table.tableName,
      description: 'LangGraph checkpoint table name',
      exportName: `opx-phase6-checkpoint-table-name-${environment}`,
    });

    new cdk.CfnOutput(this, 'CheckpointTableArn', {
      value: this.table.tableArn,
      description: 'LangGraph checkpoint table ARN',
      exportName: `opx-phase6-checkpoint-table-arn-${environment}`,
    });

    // ========================================================================
    // TAGS
    // ========================================================================

    cdk.Tags.of(this.table).add('Project', 'OpX');
    cdk.Tags.of(this.table).add('Phase', 'Phase6');
    cdk.Tags.of(this.table).add('Week', 'Week5');
    cdk.Tags.of(this.table).add('Component', 'LangGraphCheckpointing');
    cdk.Tags.of(this.table).add('Environment', environment);
  }
}
