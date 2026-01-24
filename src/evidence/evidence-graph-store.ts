import { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { EvidenceGraph, EvidenceGraphSchema } from './evidence-graph.schema';

/**
 * Evidence Graph Store Configuration
 */
export interface EvidenceGraphStoreConfig {
  tableName: string;
  dynamoClient: DynamoDBClient;
}

/**
 * Evidence Graph Store
 * 
 * Provides durable, idempotent persistence of evidence graphs in DynamoDB.
 * 
 * Responsibilities:
 * - Store evidence graphs in DynamoDB
 * - Provide idempotent writes (PutItem with condition)
 * - Query graphs by candidate ID
 * - Return graph existence status
 * 
 * Does NOT:
 * - Build graphs (that's Evidence Graph Builder)
 * - Perform correlation (that's Phase 2.2)
 * - Create candidates (that's CP-5)
 * 
 * Invariants:
 * - Idempotent writes (same graph ID → no duplicate)
 * - Fail-fast on errors
 * - All graphs validated against schema
 */
export class EvidenceGraphStore {
  private tableName: string;
  private dynamoClient: DynamoDBClient;

  constructor(config: EvidenceGraphStoreConfig) {
    this.tableName = config.tableName;
    this.dynamoClient = config.dynamoClient;
  }

  /**
   * Store evidence graph (idempotent)
   * 
   * Uses conditional write to prevent duplicates.
   * Safe to retry on failure.
   * 
   * @param graph - Evidence graph to store
   * @returns true if new graph, false if already existed
   * @throws If DynamoDB operation fails (other than ConditionalCheckFailed)
   */
  async putGraph(graph: EvidenceGraph): Promise<boolean> {
    // Validate graph (fail-closed)
    EvidenceGraphSchema.parse(graph);

    // Build DynamoDB item
    const item = {
      pk: `GRAPH#${graph.graphId}`,
      sk: 'v1',
      ...graph
    };

    try {
      // Conditional write (only if not exists)
      await this.dynamoClient.send(new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(item, { removeUndefinedValues: true }),
        ConditionExpression: 'attribute_not_exists(pk)'
      }));

      // Success - new graph
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
   * Get evidence graph by ID
   * 
   * @param graphId - Graph ID
   * @returns Evidence graph or null if not found
   * @throws If DynamoDB operation fails
   */
  async getGraph(graphId: string): Promise<EvidenceGraph | null> {
    const result = await this.dynamoClient.send(new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({
        pk: `GRAPH#${graphId}`,
        sk: 'v1'
      })
    }));

    if (!result.Item) {
      return null;
    }

    const item = unmarshall(result.Item);
    
    // Remove DynamoDB keys
    const { pk, sk, ...graph } = item;
    
    // Validate and return
    return EvidenceGraphSchema.parse(graph);
  }

  /**
   * Get evidence graph by candidate ID
   * 
   * Queries the candidate-graph-index GSI.
   * 
   * Note: GSI is eventually consistent. Recent writes may not be immediately visible.
   * 
   * @param candidateId - Candidate ID
   * @returns Evidence graph or null if not found
   * @throws If DynamoDB operation fails
   */
  async getGraphByCandidateId(candidateId: string): Promise<EvidenceGraph | null> {
    try {
      const result = await this.dynamoClient.send(new QueryCommand({
        TableName: this.tableName,
        IndexName: 'candidate-graph-index',
        KeyConditionExpression: 'candidateId = :candidateId',
        ExpressionAttributeValues: marshall({
          ':candidateId': candidateId
        }),
        Limit: 1  // Should only be one graph per candidate
      }));

      if (!result.Items || result.Items.length === 0) {
        return null;
      }

      const item = unmarshall(result.Items[0]);
      const { pk, sk, ...graph } = item;
      
      // Validate and return
      return EvidenceGraphSchema.parse(graph);
    } catch (error: any) {
      // Log error but handle gracefully
      if (error.name === 'ResourceNotFoundException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check if evidence graph exists
   * 
   * @param graphId - Graph ID
   * @returns true if exists, false otherwise
   * @throws If DynamoDB operation fails
   */
  async exists(graphId: string): Promise<boolean> {
    const result = await this.dynamoClient.send(new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({
        pk: `GRAPH#${graphId}`,
        sk: 'v1'
      }),
      ProjectionExpression: 'pk'  // Minimal data transfer
    }));

    return !!result.Item;
  }
}
