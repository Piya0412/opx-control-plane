/**
 * Advisory Output Store
 * 
 * Persists Phase 6 intelligence recommendations for human review.
 * 
 * CRITICAL RULES:
 * - Advisory outputs are READ-ONLY for humans
 * - No automatic execution
 * - No state mutation
 * - Append-only (no updates)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutItemCommand, GetItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { z } from 'zod';

/**
 * Advisory Recommendation Schema
 * 
 * Output from Phase 6 LangGraph execution.
 */
export const AdvisoryRecommendationSchema = z.object({
  incidentId: z.string().length(64),
  executionId: z.string(),
  recommendation: z.object({
    summary: z.string(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
    proposed_actions: z.array(z.object({
      action_type: z.string(),
      description: z.string(),
      priority: z.number(),
      estimated_impact: z.string(),
    })).optional(),
  }),
  consensus: z.object({
    agreement_score: z.number().min(0).max(1),
    conflicts_resolved: z.number(),
    participating_agents: z.array(z.string()),
  }).optional(),
  cost: z.object({
    total: z.number(),
    by_agent: z.record(z.number()),
    input_tokens: z.number(),
    output_tokens: z.number(),
  }),
  execution_summary: z.object({
    agents_succeeded: z.number(),
    agents_failed: z.number(),
    total_duration_ms: z.number(),
    checkpoints_created: z.number(),
  }),
  timestamp: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type AdvisoryRecommendation = z.infer<typeof AdvisoryRecommendationSchema>;

/**
 * Advisory Store
 * 
 * Manages persistence of Phase 6 advisory outputs.
 */
export class AdvisoryStore {
  constructor(
    private readonly dynamoClient: DynamoDBClient,
    private readonly tableName: string
  ) {}

  /**
   * Store advisory recommendation
   * 
   * CRITICAL: Idempotent by executionId
   * 
   * @param recommendation - Advisory recommendation from Phase 6
   * @returns true if new, false if already exists
   */
  async storeRecommendation(recommendation: AdvisoryRecommendation): Promise<boolean> {
    // Validate schema
    const validated = AdvisoryRecommendationSchema.parse(recommendation);

    // Build DynamoDB item
    const item = {
      pk: `INCIDENT#${validated.incidentId}`,
      sk: `RECOMMENDATION#${validated.executionId}`,
      ...validated,
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60), // 90 days TTL
    };

    try {
      // Idempotent write: only if not exists
      await this.dynamoClient.send(
        new PutItemCommand({
          TableName: this.tableName,
          Item: marshall(item, { removeUndefinedValues: true }),
          ConditionExpression: 'attribute_not_exists(pk)',
        })
      );

      console.log('Advisory recommendation stored', {
        incidentId: validated.incidentId,
        executionId: validated.executionId,
        confidence: validated.recommendation.confidence,
        totalCost: validated.cost.total,
      });

      return true; // New recommendation
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        // Already exists - idempotent
        console.info('Advisory recommendation already exists (idempotent)', {
          incidentId: validated.incidentId,
          executionId: validated.executionId,
        });
        return false;
      }

      // Other error - fail-fast
      throw error;
    }
  }

  /**
   * Get advisory recommendation by execution ID
   * 
   * @param incidentId - Incident ID
   * @param executionId - Execution ID
   * @returns Advisory recommendation or null if not found
   */
  async getRecommendation(
    incidentId: string,
    executionId: string
  ): Promise<AdvisoryRecommendation | null> {
    const result = await this.dynamoClient.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          pk: `INCIDENT#${incidentId}`,
          sk: `RECOMMENDATION#${executionId}`,
        }),
      })
    );

    if (!result.Item) {
      return null;
    }

    const item = unmarshall(result.Item);
    const { pk, sk, ttl, ...recommendation } = item;

    return AdvisoryRecommendationSchema.parse(recommendation);
  }

  /**
   * List advisory recommendations for an incident
   * 
   * @param incidentId - Incident ID
   * @param limit - Maximum number of results
   * @returns Array of advisory recommendations (most recent first)
   */
  async listRecommendations(
    incidentId: string,
    limit: number = 10
  ): Promise<AdvisoryRecommendation[]> {
    const result = await this.dynamoClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk_prefix)',
        ExpressionAttributeValues: marshall({
          ':pk': `INCIDENT#${incidentId}`,
          ':sk_prefix': 'RECOMMENDATION#',
        }),
        Limit: limit,
        ScanIndexForward: false, // Most recent first
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map((item) => {
      const unmarshalled = unmarshall(item);
      const { pk, sk, ttl, ...recommendation } = unmarshalled;
      return AdvisoryRecommendationSchema.parse(recommendation);
    });
  }
}
