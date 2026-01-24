/**
 * CP-2: Normalized Signal Store
 * 
 * Append-only storage for normalized signals.
 * 
 * RULES:
 * - Append-only (no updates)
 * - Idempotent writes (conditional expression)
 * - No deletions
 * - No TTL
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { NormalizedSignal } from './normalized-signal.schema.js';

export interface NormalizedSignalStoreConfig {
  tableName: string;
  region?: string;
}

/**
 * Normalized Signal Store
 * 
 * DynamoDB-backed append-only storage.
 */
export class NormalizedSignalStore {
  private readonly client: DynamoDBDocumentClient;
  private readonly tableName: string;
  
  constructor(config: NormalizedSignalStoreConfig) {
    const dynamoClient = new DynamoDBClient({
      region: config.region || process.env.AWS_REGION || 'us-east-1',
    });
    this.client = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = config.tableName;
  }
  
  /**
   * Store normalized signal
   * 
   * Append-only with idempotent writes.
   * 
   * @param signal - Normalized signal
   * @returns Success indicator
   */
  async store(signal: NormalizedSignal): Promise<{ success: boolean; error?: string }> {
    try {
      const item = {
        // Primary key
        PK: `NORMALIZED_SIGNAL#${signal.normalizedSignalId}`,
        SK: signal.timestamp,
        
        // Entity metadata
        entityType: 'NORMALIZED_SIGNAL',
        normalizationVersion: signal.normalizationVersion,
        
        // Payload
        payload: signal,
      };
      
      // Append-only: condition prevents overwrites
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
        // Already exists (idempotent)
        return { success: true };
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to store normalized signal', {
        normalizedSignalId: signal.normalizedSignalId,
        error: errorMessage,
      });
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
  
  /**
   * Get normalized signal by ID
   * 
   * @param normalizedSignalId - Normalized signal ID
   * @param timestamp - Signal timestamp
   * @returns Normalized signal or null
   */
  async get(
    normalizedSignalId: string,
    timestamp: string
  ): Promise<NormalizedSignal | null> {
    try {
      const result = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            PK: `NORMALIZED_SIGNAL#${normalizedSignalId}`,
            SK: timestamp,
          },
        })
      );
      
      if (!result.Item) {
        return null;
      }
      
      return result.Item.payload as NormalizedSignal;
      
    } catch (error) {
      console.error('Failed to get normalized signal', {
        normalizedSignalId,
        timestamp,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
