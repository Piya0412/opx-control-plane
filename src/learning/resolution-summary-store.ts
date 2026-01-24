/**
 * Phase 4 - Step 4: Resolution Summary Store
 * 
 * Append-only, idempotent storage for resolution summaries.
 * 
 * CRITICAL RULES:
 * - Append-only (conditional write on summaryId)
 * - Idempotent (returns boolean)
 * - No update methods
 * - No delete methods
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { ResolutionSummary } from './resolution-summary.schema';
import { ResolutionSummarySchema } from './resolution-summary.schema';

export class ResolutionSummaryStore {
  private readonly docClient: DynamoDBDocumentClient;
  
  constructor(
    dynamoClient: DynamoDBClient,
    private readonly tableName: string
  ) {
    this.docClient = DynamoDBDocumentClient.from(dynamoClient);
  }
  
  /**
   * Store summary (append-only, idempotent)
   * 
   * Uses conditional write on summaryId.
   * 
   * @returns true if created, false if duplicate
   */
  async storeSummary(summary: ResolutionSummary): Promise<boolean> {
    // Validate schema
    const validated = ResolutionSummarySchema.parse(summary);
    
    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: `SUMMARY#${validated.summaryId}`,
            SK: `SUMMARY#${validated.summaryId}`,
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
   * Get summary by ID
   * 
   * @returns Summary or null if not found
   */
  async getSummary(summaryId: string): Promise<ResolutionSummary | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `SUMMARY#${summaryId}`,
          SK: `SUMMARY#${summaryId}`,
        },
      })
    );
    
    if (!result.Item) {
      return null;
    }
    
    // Remove DynamoDB keys
    const { PK, SK, ...summary } = result.Item;
    
    return ResolutionSummarySchema.parse(summary);
  }
  
  /**
   * List summaries for service
   * 
   * @param service - Service name (optional, undefined = all)
   * @param startDate - Start date (optional)
   * @param endDate - End date (optional)
   * @returns Array of summaries
   */
  async listSummaries(
    service?: string,
    startDate?: string,
    endDate?: string
  ): Promise<ResolutionSummary[]> {
    // For now, scan all summaries and filter
    // In production, use GSI: ServiceIndex (PK: SERVICE#{service}, SK: GENERATED#{generatedAt})
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'begins_with(PK, :prefix)',
        ExpressionAttributeValues: {
          ':prefix': 'SUMMARY#',
        },
      })
    );
    
    if (!result.Items) {
      return [];
    }
    
    // Parse and filter
    const summaries = result.Items.map(item => {
      const { PK, SK, ...summary } = item;
      return ResolutionSummarySchema.parse(summary);
    });
    
    // Filter by service
    let filtered = summaries;
    if (service !== undefined) {
      filtered = filtered.filter(s => s.service === service);
    }
    
    // Filter by date range
    if (startDate) {
      filtered = filtered.filter(s => s.generatedAt >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(s => s.generatedAt <= endDate);
    }
    
    return filtered;
  }
}
