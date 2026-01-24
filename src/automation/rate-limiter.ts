/**
 * Phase 5 - Step 5: Rate Limiter
 * 
 * Per-principal rate limiting for manual triggers.
 * 
 * FIX 5.2: Manual triggers must be rate-limited to prevent human-induced DoS.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { OperationType } from './automation-audit.schema';

// FIX 5.2: Rate limits per operation type
const RATE_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  PATTERN_EXTRACTION: { maxRequests: 5, windowMs: 3600000 }, // 5/hour
  CALIBRATION: { maxRequests: 3, windowMs: 3600000 },        // 3/hour
  SNAPSHOT: { maxRequests: 10, windowMs: 3600000 },          // 10/hour
};

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number; // Milliseconds until next allowed request
  currentCount?: number;
  limit?: number;
}

/**
 * Rate limiter
 */
export class RateLimiter {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(dynamoClient: DynamoDBClient, tableName: string) {
    this.docClient = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = tableName;
  }

  /**
   * Check if request is allowed under rate limit
   */
  async checkRateLimit(
    principalId: string,
    operationType: OperationType
  ): Promise<RateLimitResult> {
    const config = RATE_LIMITS[operationType];
    if (!config) {
      // No rate limit configured for this operation type
      return { allowed: true };
    }

    const now = Date.now();
    const windowStart = now - config.windowMs;
    const key = `RATELIMIT#${principalId}#${operationType}`;

    try {
      // Query recent requests within the time window
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk AND SK > :windowStart',
          ExpressionAttributeValues: {
            ':pk': key,
            ':windowStart': windowStart.toString(),
          },
          Select: 'COUNT',
        })
      );

      const currentCount = result.Count || 0;

      if (currentCount >= config.maxRequests) {
        // Rate limit exceeded
        // Find oldest request to calculate retry-after
        const oldestResult = await this.docClient.send(
          new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: 'PK = :pk AND SK > :windowStart',
            ExpressionAttributeValues: {
              ':pk': key,
              ':windowStart': windowStart.toString(),
            },
            Limit: 1,
            ScanIndexForward: true, // Oldest first
          })
        );

        let retryAfter = config.windowMs; // Default to full window
        if (oldestResult.Items && oldestResult.Items.length > 0) {
          const oldestTimestamp = parseInt(oldestResult.Items[0].SK, 10);
          retryAfter = oldestTimestamp + config.windowMs - now;
        }

        return {
          allowed: false,
          retryAfter: Math.max(0, retryAfter),
          currentCount,
          limit: config.maxRequests,
        };
      }

      // Record this request
      await this.recordRequest(key, now);

      return {
        allowed: true,
        currentCount: currentCount + 1,
        limit: config.maxRequests,
      };
    } catch (error) {
      console.error('Rate limit check failed:', error);
      // Fail open - allow request if rate limit check fails
      return { allowed: true };
    }
  }

  /**
   * Record a request for rate limiting
   */
  private async recordRequest(key: string, timestamp: number): Promise<void> {
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: key,
          SK: timestamp.toString(),
          timestamp,
          expiresAt: Math.floor((timestamp + 7200000) / 1000), // TTL: 2 hours
        },
      })
    );
  }

  /**
   * Get rate limit configuration for operation type
   */
  static getRateLimitConfig(operationType: OperationType): {
    maxRequests: number;
    windowMs: number;
  } | undefined {
    return RATE_LIMITS[operationType];
  }
}
