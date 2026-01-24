/**
 * Phase 4: Resolution Summary Table
 * 
 * Storage for pattern extraction summaries.
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

export interface ResolutionSummaryTableProps {
  /**
   * Table name
   * @default 'opx-resolution-summaries'
   */
  tableName?: string;

  /**
   * Enable point-in-time recovery
   * @default true
   */
  pointInTimeRecovery?: boolean;
}

/**
 * Resolution Summary Table Construct
 * 
 * Creates DynamoDB table for resolution summary storage with:
 * - Deterministic primary key (summaryId)
 * - GSI for querying by service + generatedAt
 * - No TTL (permanent learning data)
 * - Point-in-time recovery for data protection
 */
export class ResolutionSummaryTable extends Construct {
  public readonly table: Table;

  constructor(scope: Construct, id: string, props: ResolutionSummaryTableProps = {}) {
    super(scope, id);

    const {
      tableName = 'opx-resolution-summaries',
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

      // No TTL - summaries are permanent learning data
    });

    // GSI: Query summaries by service + generatedAt
    this.table.addGlobalSecondaryIndex({
      indexName: 'ServiceIndex',
      partitionKey: {
        name: 'service',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'generatedAt',
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL,
    });

    // Add tags
    this.table.node.addMetadata('Purpose', 'Resolution summary storage for Phase 4');
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
