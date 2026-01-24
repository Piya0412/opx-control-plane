/**
 * Phase 2.4: Detection Table
 * 
 * Infrastructure for detection storage with deterministic IDs.
 * 
 * Table Design:
 * - PK: DETECTION#{detectionId}
 * - SK: v1
 * - GSI: signalId / detectedAt (for querying detections by signal)
 * 
 * Access Patterns:
 * 1. Get detection by ID: GetItem(PK, SK)
 * 2. Query by signal ID: Query(GSI, signalId)
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

export interface DetectionTableProps {
  /**
   * Table name
   * @default 'opx-detections'
   */
  tableName?: string;

  /**
   * Enable point-in-time recovery
   * @default true
   */
  pointInTimeRecovery?: boolean;
}

/**
 * Detection Table Construct
 * 
 * Creates DynamoDB table for detection storage with:
 * - Deterministic primary key (detectionId)
 * - GSI for querying by signal ID
 * - No TTL (permanent audit trail)
 * - Point-in-time recovery for data protection
 */
export class DetectionTable extends Construct {
  public readonly table: Table;

  constructor(scope: Construct, id: string, props: DetectionTableProps = {}) {
    super(scope, id);

    const {
      tableName = 'opx-detections',
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

      // No TTL - detections are permanent
    });

    // GSI: Query detections by signal ID
    this.table.addGlobalSecondaryIndex({
      indexName: 'signal-detection-index',
      partitionKey: {
        name: 'signalId',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'detectedAt',
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL,
    });

    // Add tags
    this.table.node.addMetadata('Purpose', 'Detection storage for Phase 2.4');
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
