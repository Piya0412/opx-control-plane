/**
 * Phase 4: Confidence Calibration Table
 * 
 * Storage for confidence calibration data.
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

export interface CalibrationTableProps {
  /**
   * Table name
   * @default 'opx-confidence-calibrations'
   */
  tableName?: string;

  /**
   * Enable point-in-time recovery
   * @default true
   */
  pointInTimeRecovery?: boolean;
}

/**
 * Calibration Table Construct
 * 
 * Creates DynamoDB table for calibration data storage with:
 * - Deterministic primary key (calibrationId)
 * - GSI for querying by service + calibratedAt
 * - No TTL (permanent learning data)
 * - Point-in-time recovery for data protection
 */
export class CalibrationTable extends Construct {
  public readonly table: Table;

  constructor(scope: Construct, id: string, props: CalibrationTableProps = {}) {
    super(scope, id);

    const {
      tableName = 'opx-confidence-calibrations',
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

      // No TTL - calibrations are permanent learning data
    });

    // GSI: Query calibrations by service + calibratedAt
    this.table.addGlobalSecondaryIndex({
      indexName: 'ServiceIndex',
      partitionKey: {
        name: 'service',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'calibratedAt',
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL,
    });

    // Add tags
    this.table.node.addMetadata('Purpose', 'Calibration data storage for Phase 4');
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
