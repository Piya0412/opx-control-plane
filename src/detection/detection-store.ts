import { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { Detection, DetectionSchema } from './detection.schema.js';

/**
 * Detection Store Configuration
 */
export interface DetectionStoreConfig {
  tableName: string;
  dynamoClient: DynamoDBClient;
}

/**
 * Detection Store
 * 
 * Provides durable, idempotent persistence of detections in DynamoDB.
 * 
 * Responsibilities:
 * - Store detections in DynamoDB
 * - Provide idempotent writes (PutItem with condition)
 * - Query detections by signal IDs
 * - Return detection existence status
 * 
 * Does NOT:
 * - Perform detection logic (that's Detection Engine)
 * - Emit events (that's Detection Engine)
 * - Perform correlation (that's Phase 2.2)
 * - Create candidates (that's CP-5)
 * 
 * Invariants:
 * - Idempotent writes (same detection ID → no duplicate)
 * - Fail-fast on errors
 * - All detections validated against schema
 */
export class DetectionStore {
  private tableName: string;
  private dynamoClient: DynamoDBClient;

  constructor(config: DetectionStoreConfig) {
    this.tableName = config.tableName;
    this.dynamoClient = config.dynamoClient;
  }

  /**
   * Store detection (idempotent)
   * 
   * Uses conditional write to prevent duplicates.
   * Safe to retry on failure.
   * 
   * @param detection - Detection to store
   * @returns true if new detection, false if already existed
   * @throws If DynamoDB operation fails (other than ConditionalCheckFailed)
   */
  async putDetection(detection: Detection): Promise<boolean> {
    // Validate detection (fail-closed)
    DetectionSchema.parse(detection);

    // INVARIANT: Detection must contain at least one signalId
    if (!detection.signalIds || detection.signalIds.length === 0) {
      throw new Error('Detection must contain at least one signalId');
    }

    // Extract primary signal ID for GSI
    const primarySignalId = detection.signalIds[0];

    // Build DynamoDB item
    // Add signalId (singular) for GSI querying
    const item = {
      pk: `DETECTION#${detection.detectionId}`,
      sk: 'v1',
      signalId: primarySignalId, // For GSI: signal-detection-index
      ...detection
    };

    try {
      // Conditional write (only if not exists)
      await this.dynamoClient.send(new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(item, { removeUndefinedValues: true }),
        ConditionExpression: 'attribute_not_exists(pk)'
      }));

      // Success - new detection
      return true;
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        // Already exists - idempotent
        return false;
      }
      // Other error - fail-fast
      throw error;
    }
  }

  /**
   * Get detection by ID
   * 
   * @param detectionId - Detection ID
   * @returns Detection or null if not found
   * @throws If DynamoDB operation fails
   */
  async getDetection(detectionId: string): Promise<Detection | null> {
    const result = await this.dynamoClient.send(new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({
        pk: `DETECTION#${detectionId}`,
        sk: 'v1'
      })
    }));

    if (!result.Item) {
      return null;
    }

    const item = unmarshall(result.Item);
    
    // Remove DynamoDB keys
    const { pk, sk, ...detection } = item;
    
    // Validate and return
    return DetectionSchema.parse(detection);
  }

  /**
   * Check if detection exists
   * 
   * @param detectionId - Detection ID
   * @returns true if exists, false otherwise
   * @throws If DynamoDB operation fails
   */
  async exists(detectionId: string): Promise<boolean> {
    const result = await this.dynamoClient.send(new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({
        pk: `DETECTION#${detectionId}`,
        sk: 'v1'
      }),
      ProjectionExpression: 'pk'  // Minimal data transfer
    }));

    return !!result.Item;
  }

  /**
   * Get detections by signal IDs
   * 
   * Queries the signal-detection-index GSI to find all detections
   * that contain any of the specified signal IDs.
   * 
   * Note: GSI is eventually consistent. Recent writes may not be immediately visible.
   * 
   * @param signalIds - Array of signal IDs
   * @returns Array of detections (deduplicated)
   * @throws If DynamoDB operation fails
   */
  async getDetectionsBySignalIds(signalIds: string[]): Promise<Detection[]> {
    if (signalIds.length === 0) {
      return [];
    }

    const detections: Detection[] = [];
    const seenIds = new Set<string>();

    // Query GSI for each signal ID
    // Note: This could be optimized with batch operations for large arrays
    for (const signalId of signalIds) {
      try {
        const result = await this.dynamoClient.send(new QueryCommand({
          TableName: this.tableName,
          IndexName: 'signal-detection-index',
          KeyConditionExpression: 'signalId = :signalId',
          ExpressionAttributeValues: marshall({
            ':signalId': signalId
          })
        }));

        if (result.Items) {
          for (const item of result.Items) {
            const unmarshalled = unmarshall(item);
            const { pk, sk, ...detection } = unmarshalled;
            
            // Deduplicate by detection ID
            // Same detection may appear for multiple signal IDs
            if (!seenIds.has(detection.detectionId)) {
              seenIds.add(detection.detectionId);
              detections.push(DetectionSchema.parse(detection));
            }
          }
        }
      } catch (error: any) {
        // Log error but continue with other signal IDs
        console.error('Failed to query detections for signal', { 
          signalId, 
          error: error.message 
        });
        // Re-throw if it's a critical error (not just empty results)
        if (error.name !== 'ResourceNotFoundException') {
          throw error;
        }
      }
    }

    return detections;
  }
}
