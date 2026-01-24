/**
 * CP-1: Signal Store DynamoDB Table
 * 
 * Infrastructure for signal storage with append-only semantics.
 * 
 * Table Design:
 * - PK: SIGNAL#{signalId}
 * - SK: {timestamp}
 * - GSI1: SOURCE#{source}#TYPE#{signalType} / {timestamp}
 * 
 * Access Patterns:
 * 1. Get signal by ID: GetItem(PK, SK)
 * 2. Query by source/type: Query(GSI1)
 * 3. Query by time range: Query(GSI1, SK BETWEEN start AND end)
 */

import { Construct } from 'constructs';
import { RemovalPolicy } from 'aws-cdk-lib';
import {
  Table,
  AttributeType,
  BillingMode,
  ProjectionType,
  StreamViewType,
} from 'aws-cdk-lib/aws-dynamodb';

export interface SignalStoreTableProps {
  /**
   * Table name
   * @default 'opx-signals'
   */
  tableName?: string;

  /**
   * Enable point-in-time recovery
   * @default true
   */
  pointInTimeRecovery?: boolean;

  /**
   * Enable DynamoDB Streams
   * @default false (not needed for Phase 2)
   */
  enableStreams?: boolean;

  /**
   * TTL for signals (operational data)
   * @default 30 days
   */
  ttlDays?: number;
}

/**
 * Signal Store Table Construct
 * 
 * Creates DynamoDB table for signal storage with:
 * - Deterministic primary key (signalId + timestamp)
 * - GSI for querying by source/type
 * - TTL for operational data cleanup
 * - Point-in-time recovery for data protection
 */
export class SignalStoreTable extends Construct {
  public readonly table: Table;

  constructor(scope: Construct, id: string, props: SignalStoreTableProps = {}) {
    super(scope, id);

    const {
      tableName = 'opx-signals',
      pointInTimeRecovery = true,
      enableStreams = false,
      // ttlDays is defined in props but not used - signals are permanent
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ttlDays: _ttlDays = 30,
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
      billingMode: BillingMode.PAY_PER_REQUEST, // On-demand for Phase 2

      // Data protection
      pointInTimeRecovery,
      removalPolicy: RemovalPolicy.RETAIN, // Protect signal data

      // Streams (optional)
      stream: enableStreams ? StreamViewType.NEW_AND_OLD_IMAGES : undefined,

      // TTL for operational data cleanup
      timeToLiveAttribute: 'ttl',
    });

    // GSI1: Query by source and type
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK',
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL, // Project all attributes
    });

    // Add tags
    this.table.node.addMetadata('Purpose', 'Signal storage for Phase 2 observability');
    this.table.node.addMetadata('Phase', 'Phase 2');
    this.table.node.addMetadata('Checkpoint', 'CP-1');
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
