/**
 * Phase 4: Learning Snapshot Table
 * 
 * Storage for learning system snapshots.
 */

import { Construct } from 'constructs';
import { RemovalPolicy } from 'aws-cdk-lib';
import {
  Table,
  AttributeType,
  BillingMode,
  ProjectionType,
  TableEncryption,
} from 'aws-cdk-lib/aws-dynamodb';

export interface SnapshotTableProps {
  /**
   * Table name
   * @default 'opx-learning-snapshots'
   */
  tableName?: string;

  /**
   * Enable point-in-time recovery
   * @default true
   */
  pointInTimeRecovery?: boolean;
}

/**
 * Snapshot Table Construct
 * 
 * Creates DynamoDB table for learning snapshot storage with:
 * - Deterministic primary key (snapshotId)
 * - GSI for querying by snapshotType + capturedAt
 * - No TTL (permanent learning data)
 * - Point-in-time recovery for data protection
 */
export class SnapshotTable extends Construct {
  public readonly table: Table;

  constructor(scope: Construct, id: string, props: SnapshotTableProps = {}) {
    super(scope, id);

    const {
      tableName = 'opx-learning-snapshots',
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
      removalPolicy: RemovalPolicy.RETAIN, // Permanent learning data
      encryption: TableEncryption.AWS_MANAGED,

      // No TTL - snapshots are permanent learning data
    });

    // GSI: Query snapshots by type + capturedAt
    this.table.addGlobalSecondaryIndex({
      indexName: 'TypeIndex',
      partitionKey: {
        name: 'snapshotType',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'capturedAt',
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL,
    });

    // Add tags
    this.table.node.addMetadata('Purpose', 'Learning snapshot storage for Phase 4');
    this.table.node.addMetadata('Phase', 'Phase 4');
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
