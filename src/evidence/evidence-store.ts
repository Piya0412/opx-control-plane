/**
 * Phase 3.1: Evidence Store
 * 
 * DynamoDB storage for evidence bundles.
 * 
 * OPERATIONS:
 * - putEvidence: Idempotent write (conditional)
 * - getEvidence: Retrieve by ID
 * - evidenceExists: Check existence
 * 
 * GUARANTEES:
 * - Idempotent writes
 * - Fail-closed on errors
 * - No data loss
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { EvidenceBundle } from './evidence-bundle.schema.js';
import { EvidenceBundleSchema } from './evidence-bundle.schema.js';

/**
 * Evidence Store
 * 
 * Manages evidence bundle persistence in DynamoDB.
 */
export class EvidenceStore {
  constructor(
    private readonly dynamoClient: DynamoDBClient,
    private readonly tableName: string
  ) {}
  
  /**
   * Store evidence bundle
   * 
   * Idempotent: Returns false if bundle already exists.
   * 
   * @param bundle - Evidence bundle to store
   * @returns true if new, false if already exists
   * @throws If DynamoDB operation fails (other than ConditionalCheckFailed)
   */
  async putEvidence(bundle: EvidenceBundle): Promise<boolean> {
    // Validate bundle (fail-closed)
    EvidenceBundleSchema.parse(bundle);
    
    // Build DynamoDB item
    const item = {
      pk: `EVIDENCE#${bundle.evidenceId}`,
      sk: 'v1',
      ...bundle,
    };
    
    try {
      // Conditional write: only if not exists
      await this.dynamoClient.send(new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(item, { removeUndefinedValues: true }),
        ConditionExpression: 'attribute_not_exists(pk)',
      }));
      
      // Success - new evidence
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
   * Get evidence bundle by ID
   * 
   * @param evidenceId - Evidence ID
   * @returns Evidence bundle or null if not found
   * @throws If DynamoDB operation fails
   */
  async getEvidence(evidenceId: string): Promise<EvidenceBundle | null> {
    const result = await this.dynamoClient.send(new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({
        pk: `EVIDENCE#${evidenceId}`,
        sk: 'v1',
      }),
    }));
    
    if (!result.Item) {
      return null;
    }
    
    const item = unmarshall(result.Item);
    
    // Remove DynamoDB keys
    const { pk, sk, ...bundle } = item;
    
    // Validate and return
    return EvidenceBundleSchema.parse(bundle);
  }
  
  /**
   * Check if evidence exists
   * 
   * @param evidenceId - Evidence ID
   * @returns true if exists, false otherwise
   * @throws If DynamoDB operation fails
   */
  async evidenceExists(evidenceId: string): Promise<boolean> {
    const result = await this.dynamoClient.send(new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({
        pk: `EVIDENCE#${evidenceId}`,
        sk: 'v1',
      }),
      ProjectionExpression: 'pk',
    }));
    
    return !!result.Item;
  }
}
