/**
 * Phase 3.3: Promotion Store
 * 
 * DynamoDB storage for promotion decisions.
 * 
 * CRITICAL: Incident-scoped identity (not candidate-scoped)
 * 
 * OPERATIONS:
 * - recordDecision: Idempotent write (by incidentId)
 * - getDecision: Retrieve by incident ID
 * - listPromotions: Query by decision type
 * 
 * GUARANTEES:
 * - Idempotent writes (by incidentId)
 * - Fail-closed on errors
 * - Multiple candidates → same incident
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutItemCommand, GetItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { PromotionResult } from './promotion.schema.js';
import { PromotionResultSchema } from './promotion.schema.js';

/**
 * Promotion Store
 * 
 * Manages promotion decision persistence in DynamoDB.
 * 
 * CRITICAL: Keyed by incidentId (not candidateId)
 */
export class PromotionStore {
  constructor(
    private readonly dynamoClient: DynamoDBClient,
    private readonly tableName: string
  ) {}
  
  /**
   * Record promotion decision
   * 
   * CRITICAL: Idempotent by incidentId (not candidateId)
   * 
   * For PROMOTE decisions: incidentId is the identity
   * For REJECT decisions: Use candidateId as fallback identity
   * 
   * @param result - Promotion result to store
   * @returns true if new, false if already exists
   * @throws If DynamoDB operation fails
   */
  async recordDecision(result: PromotionResult): Promise<boolean> {
    // Validate result (fail-closed)
    PromotionResultSchema.parse(result);
    
    // Determine primary key
    // For PROMOTE: use incidentId
    // For REJECT: use candidateId (no incident created)
    const primaryKey = result.decision === 'PROMOTE' && result.incidentId
      ? `INCIDENT#${result.incidentId}`
      : `CANDIDATE#${result.candidateId}`;
    
    // Build DynamoDB item
    const item = {
      pk: primaryKey,
      sk: 'v1',
      ...result,
    };
    
    try {
      // Idempotent write: only if not exists
      await this.dynamoClient.send(new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(item, { removeUndefinedValues: true }),
        ConditionExpression: 'attribute_not_exists(pk)',
      }));
      
      // Success - new decision
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
   * Get promotion decision by incident ID
   * 
   * @param incidentId - Incident ID
   * @returns Promotion result or null if not found
   * @throws If DynamoDB operation fails
   */
  async getDecisionByIncidentId(incidentId: string): Promise<PromotionResult | null> {
    const result = await this.dynamoClient.send(new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({
        pk: `INCIDENT#${incidentId}`,
        sk: 'v1',
      }),
    }));
    
    if (!result.Item) {
      return null;
    }
    
    const item = unmarshall(result.Item);
    
    // Remove DynamoDB keys
    const { pk, sk, ...decision } = item;
    
    // Validate and return
    return PromotionResultSchema.parse(decision);
  }
  
  /**
   * Get promotion decision by candidate ID
   * 
   * @param candidateId - Candidate ID
   * @returns Promotion result or null if not found
   * @throws If DynamoDB operation fails
   */
  async getDecisionByCandidateId(candidateId: string): Promise<PromotionResult | null> {
    const result = await this.dynamoClient.send(new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({
        pk: `CANDIDATE#${candidateId}`,
        sk: 'v1',
      }),
    }));
    
    if (!result.Item) {
      return null;
    }
    
    const item = unmarshall(result.Item);
    
    // Remove DynamoDB keys
    const { pk, sk, ...decision } = item;
    
    // Validate and return
    return PromotionResultSchema.parse(decision);
  }
  
  /**
   * List promotion decisions by decision type
   * 
   * @param decision - Decision type (PROMOTE or REJECT)
   * @param limit - Maximum number of results
   * @returns Array of promotion results
   * @throws If DynamoDB operation fails
   */
  async listPromotions(
    decision?: 'PROMOTE' | 'REJECT',
    limit: number = 100
  ): Promise<PromotionResult[]> {
    if (!decision) {
      // No GSI query - would need to scan (not implemented)
      throw new Error('listPromotions requires decision parameter');
    }
    
    const result = await this.dynamoClient.send(new QueryCommand({
      TableName: this.tableName,
      IndexName: 'DecisionIndex',
      KeyConditionExpression: 'decision = :decision',
      ExpressionAttributeValues: marshall({
        ':decision': decision,
      }),
      Limit: limit,
      ScanIndexForward: false, // Most recent first
    }));
    
    if (!result.Items || result.Items.length === 0) {
      return [];
    }
    
    return result.Items.map(item => {
      const unmarshalled = unmarshall(item);
      const { pk, sk, ...decision } = unmarshalled;
      return PromotionResultSchema.parse(decision);
    });
  }
}
