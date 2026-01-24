/**
 * Phase 3.1: Evidence Bundle Table
 * 
 * Infrastructure for evidence bundle storage.
 * 
 * Table Design:
 * - PK: EVIDENCE#{evidenceId}
 * - SK: v1
 * - GSI: service / windowStart (for querying by service and time)
 * 
 * Access Patterns:
 * 1. Get evidence by ID: GetItem(PK, SK)
 * 2. Query by service and time: Query(GSI, service, windowStart)
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

export interface EvidenceBundleTableProps {
  /**
   * Table name
   * @default 'opx-evidence-bundles'
   */
  tableName?: string;

  /**
   * Enable point-in-time recovery
   * @default true
   */
  pointInTimeRecovery?: boolean;
}

/**
 * Evidence Bundle Table Construct
 * 
 * Creates DynamoDB table for evidence bundle storage with:
 * - Deterministic primary key (evidenceId)
 * - GSI for querying by service and time
 * - No TTL (permanent audit trail)
 * - Point-in-time recovery for data protection
 */
export class EvidenceBundleTable extends Construct {
  public readonly table: Table;

  constructor(scope: Construct, id: string, props: EvidenceBundleTableProps = {}) {
    super(scope, id);

    const {
      tableName = 'opx-evidence-bundles',
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

      // No TTL - evidence is permanent
    });

    // GSI: Query evidence by service and time
    this.table.addGlobalSecondaryIndex({
      indexName: 'ServiceWindowIndex',
      partitionKey: {
        name: 'service',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'windowStart',
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL,
    });

    // Add tags
    this.table.node.addMetadata('Purpose', 'Evidence bundle storage for Phase 3.1');
    this.table.node.addMetadata('Phase', 'Phase 3.1');
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
