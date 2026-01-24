/**
 * Phase 4: Incident Outcome Table
 * 
 * Append-only storage for incident outcomes (learning data).
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

export interface OutcomeTableProps {
  /**
   * Table name
   * @default 'opx-incident-outcomes'
   */
  tableName?: string;

  /**
   * Enable point-in-time recovery
   * @default true
   */
  pointInTimeRecovery?: boolean;
}

/**
 * Outcome Table Construct
 * 
 * Creates DynamoDB table for incident outcome storage with:
 * - Deterministic primary key (outcomeId)
 * - GSI for querying by incident ID
 * - GSI for querying by service + recordedAt
 * - No TTL (permanent learning data)
 * - Point-in-time recovery for data protection
 */
export class OutcomeTable extends Construct {
  public readonly table: Table;

  constructor(scope: Construct, id: string, props: OutcomeTableProps = {}) {
    super(scope, id);

    const {
      tableName = 'opx-incident-outcomes',
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

      // No TTL - outcomes are permanent learning data
    });

    // GSI: Query outcomes by incident ID
    this.table.addGlobalSecondaryIndex({
      indexName: 'IncidentIndex',
      partitionKey: {
        name: 'incidentId',
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL,
    });

    // GSI: Query outcomes by service + recordedAt
    this.table.addGlobalSecondaryIndex({
      indexName: 'ServiceIndex',
      partitionKey: {
        name: 'service',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'recordedAt',
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL,
    });

    // Add tags
    this.table.node.addMetadata('Purpose', 'Incident outcome storage for Phase 4');
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
