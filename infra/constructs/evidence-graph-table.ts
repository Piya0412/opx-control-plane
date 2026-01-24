/**
 * Phase 2.4: Evidence Graph Table
 * 
 * Infrastructure for evidence graph storage linking detections to candidates.
 * 
 * Table Design:
 * - PK: GRAPH#{graphId}
 * - SK: v1
 * - GSI: candidateId (for querying graphs by candidate)
 * 
 * Access Patterns:
 * 1. Get graph by ID: GetItem(PK, SK)
 * 2. Query by candidate ID: Query(GSI, candidateId)
 * 3. Check existence: GetItem(PK, SK) with ProjectionExpression
 */

import { Construct } from 'constructs';
import { RemovalPolicy } from 'aws-cdk-lib';
import {
  Table,
  AttributeType,
  BillingMode,
  ProjectionType,
} from 'aws-cdk-lib/aws-dynamodb';

export interface EvidenceGraphTableProps {
  /**
   * Table name
   * @default 'opx-evidence-graphs'
   */
  tableName?: string;

  /**
   * Enable point-in-time recovery
   * @default true
   */
  pointInTimeRecovery?: boolean;
}

/**
 * Evidence Graph Table Construct
 * 
 * Creates DynamoDB table for evidence graph storage with:
 * - Deterministic primary key (graphId)
 * - GSI for querying by candidate ID
 * - No TTL (permanent audit trail)
 * - Point-in-time recovery for data protection
 */
export class EvidenceGraphTable extends Construct {
  public readonly table: Table;

  constructor(scope: Construct, id: string, props: EvidenceGraphTableProps = {}) {
    super(scope, id);

    const {
      tableName = 'opx-evidence-graphs',
      pointInTimeRecovery = true,
    } = props;

    // Create table
    this.table = new Table(this, 'Table', {
      tableName,
      
      // Primary key
      partitionKey: {
        name: 'pk',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: AttributeType.STRING,
      },

      // Billing
      billingMode: BillingMode.PAY_PER_REQUEST,

      // Data protection
      pointInTimeRecovery,
      removalPolicy: RemovalPolicy.RETAIN, // Permanent audit trail

      // No TTL - evidence graphs are permanent
    });

    // GSI: Query graphs by candidate ID
    this.table.addGlobalSecondaryIndex({
      indexName: 'candidate-graph-index',
      partitionKey: {
        name: 'candidateId',
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL,
    });

    // Add tags
    this.table.node.addMetadata('Purpose', 'Evidence graph storage for Phase 2.4');
    this.table.node.addMetadata('Phase', 'Phase 2.4');
  }

  /**
   * Grant read access to a principal
   */
  grantReadData(grantee: any) {
    return this.table.grantReadData(grantee);
  }

  /**
   * Grant write access to a principal
   */
  grantWriteData(grantee: any) {
    return this.table.grantWriteData(grantee);
  }

  /**
   * Grant read/write access to a principal
   */
  grantReadWriteData(grantee: any) {
    return this.table.grantReadWriteData(grantee);
  }
}
