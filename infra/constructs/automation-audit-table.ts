/**
 * Phase 5 - Step 1: Automation Audit Table
 * 
 * Infrastructure for automation audit storage.
 * 
 * Table Design:
 * - PK: AUDIT#{auditId}
 * - SK: METADATA
 * - GSI1: operationType / startTime (for querying by operation type)
 * - GSI2: status / startTime (for querying by status)
 * 
 * Access Patterns:
 * 1. Get audit by ID: GetItem(PK, SK)
 * 2. Query by operation type: Query(GSI1, operationType)
 * 3. Query by status: Query(GSI2, status)
 * 4. Update status: UpdateItem(PK, SK)
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

export interface AutomationAuditTableProps {
  /**
   * Table name
   * @default 'opx-automation-audit'
   */
  tableName?: string;

  /**
   * Enable point-in-time recovery
   * @default true
   */
  pointInTimeRecovery?: boolean;
}

/**
 * Automation Audit Table Construct
 * 
 * Creates DynamoDB table for automation audit storage with:
 * - Deterministic primary key (auditId)
 * - GSI for querying by operation type
 * - GSI for querying by status
 * - No TTL (permanent audit trail)
 * - Point-in-time recovery for data protection
 * - Deletion protection enabled
 */
export class AutomationAuditTable extends Construct {
  public readonly table: Table;

  constructor(scope: Construct, id: string, props: AutomationAuditTableProps = {}) {
    super(scope, id);

    const {
      tableName = 'opx-automation-audit',
      pointInTimeRecovery = true,
    } = props;

    // Create table
    this.table = new Table(this, 'Table', {
      tableName,
      
      // Primary key
      partitionKey: {
        name: 'PK',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: AttributeType.STRING,
      },

      // Billing
      billingMode: BillingMode.PAY_PER_REQUEST,

      // Data protection
      pointInTimeRecovery,
      removalPolicy: RemovalPolicy.RETAIN, // Permanent audit trail
      deletionProtection: true, // Extra protection for audit data
      encryption: TableEncryption.AWS_MANAGED,

      // No TTL - audits are permanent
    });

    // GSI: Query audits by operation type
    this.table.addGlobalSecondaryIndex({
      indexName: 'OperationTypeIndex',
      partitionKey: {
        name: 'operationType',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'startTime',
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL,
    });

    // GSI: Query audits by status
    this.table.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: {
        name: 'status',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'startTime',
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL,
    });

    // Add tags
    this.table.node.addMetadata('Purpose', 'Automation audit storage for Phase 5');
    this.table.node.addMetadata('Phase', 'Phase 5');
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
