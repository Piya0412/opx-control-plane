/**
 * CP-1: Signal Storage Layer
 * 
 * Stores ingested signals in DynamoDB with append-only semantics.
 * Signals are immutable once stored.
 * 
 * INVARIANTS:
 * - Signals are append-only (no updates)
 * - Signal IDs are deterministic
 * - Raw data is preserved
 * - Checksums enable integrity verification
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { Signal } from './signal-types.js';

export interface SignalStoreConfig {
  tableName: string;
  region?: string;
}

export interface SignalQueryOptions {
  source?: string;
  signalType?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
}

export interface SignalQueryResult {
  signals: Signal[];
  lastEvaluatedKey?: Record<string, any>;
}

/**
 * Signal Store
 * DynamoDB-backed storage for signals
 * 
 * Table Schema:
 * - PK: signalId (deterministic hash)
 * - SK: timestamp (ISO 8601)
 * - GSI1: source#signalType (for queries by source/type)
 * - GSI1SK: timestamp (for time-range queries)
 */
export class SignalStore {
  private readonly client: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(config: SignalStoreConfig) {
    const dynamoClient = new DynamoDBClient({
      region: config.region || process.env.AWS_REGION || 'us-east-1',
    });
    this.client = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = config.tableName;
  }

  /**
   * Store signal
   * Append-only - no updates allowed
   * 
   * @param signal - Signal to store
   * @returns Success indicator
   */
  async storeSignal(signal: Signal): Promise<{ success: boolean; error?: string }> {
    try {
      // Prepare item
      const item = {
        // Primary key
        PK: `SIGNAL#${signal.signalId}`,
        SK: signal.timestamp,
        
        // GSI for queries
        GSI1PK: `SOURCE#${signal.source}#TYPE#${signal.signalType}`,
        GSI1SK: signal.timestamp,
        
        // Signal data
        signalId: signal.signalId,
        signalType: signal.signalType,
        source: signal.source,
        timestamp: signal.timestamp,
        ingestedAt: signal.ingestedAt,
        severity: signal.severity,
        confidence: signal.confidence,
        title: signal.title,
        description: signal.description,
        evidence: signal.evidence,
        raw: signal.raw,
        rawChecksum: signal.rawChecksum,
        dimensions: signal.dimensions,
        tags: signal.tags,
        
        // Metadata
        entityType: 'SIGNAL',
        version: 1,
      };

      // Put item (condition: must not exist)
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      return { success: true };
    } catch (error) {
      if ((error as any).name === 'ConditionalCheckFailedException') {
        // Signal already exists (idempotent)
        return { success: true };
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to store signal', {
        signalId: signal.signalId,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get signal by ID (without timestamp)
   * 
   * Queries by signalId and returns the first match.
   * 
   * @param signalId - Signal ID
   * @returns Signal or null
   */
  async get(signalId: string): Promise<Signal | null> {
    try {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: {
            ':pk': `SIGNAL#${signalId}`,
          },
          Limit: 1,
        })
      );

      if (!result.Items || result.Items.length === 0) {
        return null;
      }

      return this.itemToSignal(result.Items[0]);
    } catch (error) {
      console.error('Failed to get signal', {
        signalId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get signal by ID and timestamp
   * 
   * @param signalId - Signal ID
   * @param timestamp - Signal timestamp
   * @returns Signal or null
   */
  async getSignal(signalId: string, timestamp: string): Promise<Signal | null> {
    try {
      const result = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            PK: `SIGNAL#${signalId}`,
            SK: timestamp,
          },
        })
      );

      if (!result.Item) {
        return null;
      }

      return this.itemToSignal(result.Item);
    } catch (error) {
      console.error('Failed to get signal', {
        signalId,
        timestamp,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Query signals by source and type
   * 
   * @param options - Query options
   * @returns Query result with signals
   */
  async querySignals(options: SignalQueryOptions): Promise<SignalQueryResult> {
    try {
      // Build GSI query
      let keyConditionExpression = 'GSI1PK = :gsi1pk';
      const expressionAttributeValues: Record<string, any> = {
        ':gsi1pk': `SOURCE#${options.source || 'ALL'}#TYPE#${options.signalType || 'ALL'}`,
      };

      // Add time range if specified
      if (options.startTime && options.endTime) {
        keyConditionExpression += ' AND GSI1SK BETWEEN :startTime AND :endTime';
        expressionAttributeValues[':startTime'] = options.startTime;
        expressionAttributeValues[':endTime'] = options.endTime;
      } else if (options.startTime) {
        keyConditionExpression += ' AND GSI1SK >= :startTime';
        expressionAttributeValues[':startTime'] = options.startTime;
      } else if (options.endTime) {
        keyConditionExpression += ' AND GSI1SK <= :endTime';
        expressionAttributeValues[':endTime'] = options.endTime;
      }

      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'GSI1',
          KeyConditionExpression: keyConditionExpression,
          ExpressionAttributeValues: expressionAttributeValues,
          Limit: options.limit || 100,
          ScanIndexForward: false, // Most recent first
        })
      );

      const signals = (result.Items || []).map(item => this.itemToSignal(item));

      return {
        signals,
        lastEvaluatedKey: result.LastEvaluatedKey,
      };
    } catch (error) {
      console.error('Failed to query signals', {
        options,
        error: error instanceof Error ? error.message : String(error),
      });
      return { signals: [] };
    }
  }

  /**
   * Verify signal integrity
   * Recompute checksum and compare
   * 
   * @param signal - Signal to verify
   * @returns True if integrity is valid
   */
  verifySignalIntegrity(signal: Signal): boolean {
    try {
      // Recompute checksum
      const json = JSON.stringify(signal.raw, Object.keys(signal.raw).sort());
      const computedChecksum = require('crypto')
        .createHash('sha256')
        .update(json)
        .digest('hex');

      return computedChecksum === signal.rawChecksum;
    } catch (error) {
      console.error('Failed to verify signal integrity', {
        signalId: signal.signalId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Convert DynamoDB item to Signal
   */
  private itemToSignal(item: Record<string, any>): Signal {
    return {
      signalId: item.signalId,
      signalType: item.signalType,
      source: item.source,
      timestamp: item.timestamp,
      ingestedAt: item.ingestedAt,
      severity: item.severity,
      confidence: item.confidence,
      title: item.title,
      description: item.description,
      evidence: item.evidence,
      raw: item.raw,
      rawChecksum: item.rawChecksum,
      dimensions: item.dimensions,
      tags: item.tags,
    };
  }
}
