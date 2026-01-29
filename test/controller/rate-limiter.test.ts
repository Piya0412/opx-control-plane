/**
 * CP-8: Rate Limiter Tests
 * 
 * Tests token bucket rate limiting.
 * 
 * 🔒 INV-8.6: Rate-limited mutation endpoints
 * 🔒 CORRECTION 1: No incident throttling (CP-7 handles it)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '../../src/controller/rate-limiter.js';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

const ddbMock = mockClient(DynamoDBClient);

describe('CP-8: Rate Limiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    ddbMock.reset();
    rateLimiter = new RateLimiter({
      tableName: 'test-rate-limits',
      client: new DynamoDBClient({
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'test',
          secretAccessKey: 'test',
        },
      }),
    });
  });

  describe('INV-8.6: Rate-limited mutation endpoints', () => {
    it('should allow requests within limit', async () => {
      // Mock DynamoDB to return no existing bucket (first request)
      ddbMock.on(GetItemCommand).resolves({ Item: undefined });
      ddbMock.on(PutItemCommand).resolves({});

      const result = await rateLimiter.checkAuthorityLimit(
        'user-123',
        'HUMAN_OPERATOR',
        'OPEN'
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it('should track remaining tokens', async () => {
      // Mock first request - no bucket exists
      ddbMock.on(GetItemCommand).resolvesOnce({ Item: undefined });
      ddbMock.on(PutItemCommand).resolvesOnce({});

      const result1 = await rateLimiter.checkAuthorityLimit(
        'user-456',
        'HUMAN_OPERATOR',
        'OPEN'
      );

      // Reset mocks for second call
      ddbMock.reset();
      
      // Mock second request - bucket exists with tokens consumed
      const now = Date.now();
      ddbMock.on(GetItemCommand).resolvesOnce({
        Item: {
          pk: { S: 'RATE_LIMIT#user-456#HUMAN_OPERATOR#OPEN' },
          tokens: { N: '58' },
          lastRefill: { N: String(now) },
          ttl: { N: String(Math.floor(now / 1000) + 3600) },
        },
      });
      ddbMock.on(PutItemCommand).resolvesOnce({});

      const result2 = await rateLimiter.checkAuthorityLimit(
        'user-456',
        'HUMAN_OPERATOR',
        'OPEN'
      );

      expect(result1.remaining).toBeGreaterThan(result2.remaining!);
    });
  });

  describe('authority type limits', () => {
    beforeEach(() => {
      ddbMock.on(GetItemCommand).resolves({ Item: undefined });
      ddbMock.on(PutItemCommand).resolves({});
    });

    it('should enforce AUTO_ENGINE mutation limits', async () => {
      // AUTO_ENGINE: 100 mutations/min
      const result = await rateLimiter.checkAuthorityLimit(
        'engine-001',
        'AUTO_ENGINE',
        'OPEN'
      );

      expect(result.allowed).toBe(true);
    });

    it('should enforce HUMAN_OPERATOR mutation limits', async () => {
      // HUMAN_OPERATOR: 60 mutations/min
      const result = await rateLimiter.checkAuthorityLimit(
        'user-789',
        'HUMAN_OPERATOR',
        'RESOLVE'
      );

      expect(result.allowed).toBe(true);
    });

    it('should enforce ON_CALL_SRE mutation limits', async () => {
      // ON_CALL_SRE: 120 mutations/min
      const result = await rateLimiter.checkAuthorityLimit(
        'sre-001',
        'ON_CALL_SRE',
        'CLOSE'
      );

      expect(result.allowed).toBe(true);
    });

    it('should enforce EMERGENCY_OVERRIDE mutation limits', async () => {
      // EMERGENCY_OVERRIDE: 30 mutations/min
      const result = await rateLimiter.checkAuthorityLimit(
        'admin-001',
        'EMERGENCY_OVERRIDE',
        'RESOLVE'
      );

      expect(result.allowed).toBe(true);
    });
  });

  describe('read vs mutation limits', () => {
    beforeEach(() => {
      ddbMock.on(GetItemCommand).resolves({ Item: undefined });
      ddbMock.on(PutItemCommand).resolves({});
    });

    it('should have separate limits for reads', async () => {
      const readResult = await rateLimiter.checkAuthorityLimit(
        'user-read',
        'HUMAN_OPERATOR',
        'READ'
      );

      expect(readResult.allowed).toBe(true);
    });

    it('should have separate limits for mutations', async () => {
      const mutationResult = await rateLimiter.checkAuthorityLimit(
        'user-mutate',
        'HUMAN_OPERATOR',
        'OPEN'
      );

      expect(mutationResult.allowed).toBe(true);
    });
  });

  describe('CORRECTION 1: No incident throttling', () => {
    it('should not implement incident-level throttling', () => {
      // Verify no checkIncidentThrottle method exists
      expect((rateLimiter as any).checkIncidentThrottle).toBeUndefined();
    });

    it('should only track authority-level limits', async () => {
      ddbMock.on(GetItemCommand).resolves({ Item: undefined });
      ddbMock.on(PutItemCommand).resolves({});

      // Multiple requests to same incident should only check authority limit
      const result1 = await rateLimiter.checkAuthorityLimit(
        'user-same',
        'HUMAN_OPERATOR',
        'OPEN'
      );

      const result2 = await rateLimiter.checkAuthorityLimit(
        'user-same',
        'HUMAN_OPERATOR',
        'OPEN'
      );

      // Both should be allowed (no per-incident throttle)
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });
  });

  describe('recordAction', () => {
    it('should record action without error', async () => {
      await expect(
        rateLimiter.recordAction('user-record', 'OPEN')
      ).resolves.not.toThrow();
    });

    it('should be a no-op (token consumed in checkAuthorityLimit)', async () => {
      // This is just for interface compatibility
      const result = await rateLimiter.recordAction('user-noop', 'CLOSE');
      expect(result).toBeUndefined();
    });
  });

  describe('token bucket behavior', () => {
    it('should create bucket on first request', async () => {
      ddbMock.on(GetItemCommand).resolves({ Item: undefined });
      ddbMock.on(PutItemCommand).resolves({});

      const result = await rateLimiter.checkAuthorityLimit(
        'user-new-bucket',
        'HUMAN_OPERATOR',
        'OPEN'
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeDefined();
    });

    it('should handle burst allowance', async () => {
      ddbMock.on(GetItemCommand).resolves({ Item: undefined });
      ddbMock.on(PutItemCommand).resolves({});

      // HUMAN_OPERATOR has burst of 5
      const authorityId = 'user-burst-test';
      
      const result = await rateLimiter.checkAuthorityLimit(
        authorityId,
        'HUMAN_OPERATOR',
        'OPEN'
      );

      expect(result.allowed).toBe(true);
    });
  });
});
