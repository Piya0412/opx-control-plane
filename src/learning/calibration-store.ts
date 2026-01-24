/**
 * Phase 4 - Step 5: Calibration Store
 * 
 * Append-only, idempotent storage for confidence calibrations.
 * 
 * CRITICAL RULES:
 * - Append-only (conditional write on calibrationId)
 * - Idempotent (returns boolean)
 * - No update methods
 * - No delete methods
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { ConfidenceCalibration } from './calibration.schema';
import { ConfidenceCalibrationSchema } from './calibration.schema';

export class CalibrationStore {
  private readonly docClient: DynamoDBDocumentClient;
  
  constructor(
    dynamoClient: DynamoDBClient,
    private readonly tableName: string
  ) {
    this.docClient = DynamoDBDocumentClient.from(dynamoClient);
  }
  
  /**
   * Store calibration (append-only, idempotent)
   * 
   * Uses conditional write on calibrationId.
   * 
   * @returns true if created, false if duplicate
   */
  async storeCalibration(calibration: ConfidenceCalibration): Promise<boolean> {
    // Validate schema
    const validated = ConfidenceCalibrationSchema.parse(calibration);
    
    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: `CALIBRATION#${validated.calibrationId}`,
            SK: `CALIBRATION#${validated.calibrationId}`,
            ...validated,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );
      
      return true; // Created
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        return false; // Duplicate
      }
      throw error;
    }
  }
  
  /**
   * Get calibration by ID
   * 
   * @returns Calibration or null if not found
   */
  async getCalibration(calibrationId: string): Promise<ConfidenceCalibration | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `CALIBRATION#${calibrationId}`,
          SK: `CALIBRATION#${calibrationId}`,
        },
      })
    );
    
    if (!result.Item) {
      return null;
    }
    
    // Remove DynamoDB keys
    const { PK, SK, ...calibration } = result.Item;
    
    return ConfidenceCalibrationSchema.parse(calibration);
  }
  
  /**
   * List calibrations
   * 
   * @param startDate - Start date (optional)
   * @param endDate - End date (optional)
   * @returns Array of calibrations
   */
  async listCalibrations(
    startDate?: string,
    endDate?: string
  ): Promise<ConfidenceCalibration[]> {
    // For now, scan all calibrations and filter
    // In production, use GSI: GeneratedIndex (PK: CALIBRATION, SK: GENERATED#{generatedAt})
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'begins_with(PK, :prefix)',
        ExpressionAttributeValues: {
          ':prefix': 'CALIBRATION#',
        },
      })
    );
    
    if (!result.Items) {
      return [];
    }
    
    // Parse and filter
    const calibrations = result.Items.map(item => {
      const { PK, SK, ...calibration } = item;
      return ConfidenceCalibrationSchema.parse(calibration);
    });
    
    // Filter by date range
    let filtered = calibrations;
    if (startDate) {
      filtered = filtered.filter(c => c.generatedAt >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(c => c.generatedAt <= endDate);
    }
    
    return filtered;
  }
}
