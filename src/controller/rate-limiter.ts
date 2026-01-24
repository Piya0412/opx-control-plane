/**
 * CP-8: Rate Limiter
 * 
 * Enforces per-authority rate limits using token bucket algorithm.
 * 
 * 🔒 INV-8.6: Rate-limited mutation endpoints
 * 🔒 CORRECTION 1: No incident throttling (CP-7 handles it)
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { AuthorityContext, IncidentAction } from './request-validator';

// Rate limit configuration (FROZEN)
const RATE_LIMITS: Record<
  AuthorityContext['authorityType'],
  { mutationsPerMin: number; readsPerMin: number; burst: number }
> = {
  AUTO_ENGINE: { mutationsPerMin: 100, readsPerMin: 1000, burst: 10 },
  HUMAN_OPERATOR: { mutationsPerMin: 60, readsPerMin: 300, burst: 5 },
  ON_CALL_SRE: { mutationsPerMin: 120, readsPerMin: 500, burst: 10 },
  EMERGENCY_OVERRIDE: { mutationsPerMin: 30, readsPerMin: 100, burst: 3 },
};

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number; // seconds
  remaining?: number;
}

export interface RateLimiterConfig {
  tableName: string;
  client?: DynamoDBClient;
}

export class RateLimiter {
  private readonly tableName: string;
  private readonly client: DynamoDBClient;

  constructor(config: RateLimiterConfig) {
    this.tableName = config.tableName;
    this.client = config.client || new DynamoDBClient({});
  }

  /**
   * Check rate limit for authority
   * 
   * 🔒 INV-8.6: Rate-limited mutation endpoints
   * 🔒 CORRECTION 1: Only authority limits, no incident throttling
   */
  async checkAuthorityLimit(
    authorityId: string,
    authorityType: AuthorityContext['authorityType'],
    action: IncidentAction
  ): Promise<RateLimitResult> {
    const isMutation = action !== 'READ';
    const limits = RATE_LIMITS[authorityType];
    const maxTokens = isMutation ? limits.mutationsPerMin : limits.readsPerMin;
    const refillRate = maxTokens / 60; // tokens per second
    const burstAllowance = limits.burst;

    const now = Date.now() / 1000; // seconds

    // Get current token bucket state
    const bucket = await this.getTokenBucket(authorityId, action);

    if (!bucket) {
      // First request, create bucket with full tokens
      await this.createTokenBucket(authorityId, action, maxTokens - 1, now);
      return { allowed: true, remaining: maxTokens - 1 };
    }

    // Calculate tokens to add based on time elapsed
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = elapsed * refillRate;
    const currentTokens = Math.min(
      maxTokens + burstAllowance,
      bucket.tokens + tokensToAdd
    );

    if (currentTokens < 1) {
      // Rate limit exceeded
      const timeToNextToken = (1 - currentTokens) / refillRate;
      return {
        allowed: false,
        retryAfter: Math.ceil(timeToNextToken),
        remaining: 0,
      };
    }

    // Consume one token
    await this.updateTokenBucket(authorityId, action, currentTokens - 1, now);

    return {
      allowed: true,
      remaining: Math.floor(currentTokens - 1),
    };
  }

  /**
   * Record action (consume token)
   * 
   * Note: Token consumption happens in checkAuthorityLimit
   * This method is for post-action recording if needed
   */
  async recordAction(
    authorityId: string,
    action: IncidentAction
  ): Promise<void> {
    // Token already consumed in checkAuthorityLimit
    // This is a no-op but kept for interface compatibility
  }

  /**
   * Get token bucket state
   */
  private async getTokenBucket(
    authorityId: string,
    action: IncidentAction
  ): Promise<{ tokens: number; lastRefill: number } | null> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          PK: `RATE_LIMIT#${authorityId}`,
          SK: action,
        }),
      })
    );

    if (!result.Item) {
      return null;
    }

    const item = unmarshall(result.Item);
    return {
      tokens: item.tokens,
      lastRefill: item.lastRefill,
    };
  }

  /**
   * Create token bucket
   */
  private async createTokenBucket(
    authorityId: string,
    action: IncidentAction,
    tokens: number,
    timestamp: number
  ): Promise<void> {
    const ttl = Math.floor(timestamp) + 3600; // 1 hour TTL

    await this.client.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall({
          PK: `RATE_LIMIT#${authorityId}`,
          SK: action,
          tokens,
          lastRefill: timestamp,
          TTL: ttl,
        }),
      })
    );
  }

  /**
   * Update token bucket
   */
  private async updateTokenBucket(
    authorityId: string,
    action: IncidentAction,
    tokens: number,
    timestamp: number
  ): Promise<void> {
    const ttl = Math.floor(timestamp) + 3600; // 1 hour TTL

    await this.client.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({
          PK: `RATE_LIMIT#${authorityId}`,
          SK: action,
        }),
        UpdateExpression: 'SET tokens = :tokens, lastRefill = :refill, #ttl = :ttl',
        ExpressionAttributeNames: {
          '#ttl': 'TTL',
        },
        ExpressionAttributeValues: marshall({
          ':tokens': tokens,
          ':refill': timestamp,
          ':ttl': ttl,
        }),
      })
    );
  }
}
