/**
 * Phase 4 - Step 6: Snapshot Store
 * 
 * Append-only storage for learning snapshots.
 * 
 * CRITICAL RULES:
 * - Append-only (conditional write on snapshotId)
 * - No update methods
 * - No delete methods
 */

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { LearningSnapshot, SnapshotType } from './snapshot.schema';

/**
 * Snapshot Store
 * 
 * APPEND-ONLY: Stores snapshots with idempotent writes.
 */
export class SnapshotStore {
  constructor(
    private readonly dynamoClient: DynamoDBClient,
    private readonly tableName: string
  ) {}
  
  /**
   * Store snapshot (append-only, idempotent)
   * 
   * @param snapshot - Learning snapshot
   * @returns true if created, false if duplicate
   */
  async storeSnapshot(snapshot: LearningSnapshot): Promise<boolean> {
    const item = {
      PK: `SNAPSHOT#${snapshot.snapshotId}`,
      SK: `SNAPSHOT#${snapshot.snapshotId}`,
      Type: 'SNAPSHOT',
      TypeValue: snapshot.snapshotType,
      GeneratedAt: snapshot.generatedAt,
      ...snapshot,
    };
    
    try {
      await this.dynamoClient.send(
        new PutItemCommand({
          TableName: this.tableName,
          Item: marshall(item, { removeUndefinedValues: true }),
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        return false; // Duplicate
      }
      throw error;
    }
  }
  
  /**
   * Get snapshot by ID
   * 
   * @param snapshotId - Snapshot ID
   * @returns Snapshot or null if not found
   */
  async getSnapshot(snapshotId: string): Promise<LearningSnapshot | null> {
    const result = await this.dynamoClient.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          PK: `SNAPSHOT#${snapshotId}`,
          SK: `SNAPSHOT#${snapshotId}`,
        }),
      })
    );
    
    if (!result.Item) {
      return null;
    }
    
    const item = unmarshall(result.Item);
    
    return {
      snapshotId: item.snapshotId,
      snapshotType: item.snapshotType,
      startDate: item.startDate,
      endDate: item.endDate,
      generatedAt: item.generatedAt,
      data: item.data,
      outcomeIds: item.outcomeIds,
      summaryIds: item.summaryIds,
      calibrationIds: item.calibrationIds,
      version: item.version,
    };
  }
  
  /**
   * List snapshots
   * 
   * @param snapshotType - Type filter (optional)
   * @param startDate - Start date (optional)
   * @param endDate - End date (optional)
   * @returns Array of snapshots
   */
  async listSnapshots(
    snapshotType?: SnapshotType,
    startDate?: string,
    endDate?: string
  ): Promise<LearningSnapshot[]> {
    if (snapshotType) {
      // Query by type using GSI
      return this.listSnapshotsByType(snapshotType, startDate, endDate);
    }
    
    // Scan all snapshots (for testing/admin only)
    // In production, should always filter by type or date
    const snapshots: LearningSnapshot[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;
    
    do {
      const result = await this.dynamoClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'begins_with(PK, :prefix)',
          ExpressionAttributeValues: marshall({
            ':prefix': 'SNAPSHOT#',
          }),
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );
      
      if (result.Items) {
        for (const item of result.Items) {
          const snapshot = this.unmarshallSnapshot(unmarshall(item));
          
          // Apply date filters
          if (startDate && snapshot.startDate < startDate) continue;
          if (endDate && snapshot.endDate > endDate) continue;
          
          snapshots.push(snapshot);
        }
      }
      
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    
    return snapshots;
  }
  
  /**
   * List snapshots by type
   */
  private async listSnapshotsByType(
    snapshotType: SnapshotType,
    startDate?: string,
    endDate?: string
  ): Promise<LearningSnapshot[]> {
    const snapshots: LearningSnapshot[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;
    
    do {
      const result = await this.dynamoClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'TypeIndex',
          KeyConditionExpression: 'TypeValue = :type',
          ExpressionAttributeValues: marshall({
            ':type': snapshotType,
          }),
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );
      
      if (result.Items) {
        for (const item of result.Items) {
          const snapshot = this.unmarshallSnapshot(unmarshall(item));
          
          // Apply date filters
          if (startDate && snapshot.startDate < startDate) continue;
          if (endDate && snapshot.endDate > endDate) continue;
          
          snapshots.push(snapshot);
        }
      }
      
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    
    return snapshots;
  }
  
  /**
   * Unmarshall snapshot from DynamoDB item
   */
  private unmarshallSnapshot(item: any): LearningSnapshot {
    return {
      snapshotId: item.snapshotId,
      snapshotType: item.snapshotType,
      startDate: item.startDate,
      endDate: item.endDate,
      generatedAt: item.generatedAt,
      data: item.data,
      outcomeIds: item.outcomeIds,
      summaryIds: item.summaryIds,
      calibrationIds: item.calibrationIds,
      version: item.version,
    };
  }
}
