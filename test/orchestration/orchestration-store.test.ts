/**
 * Phase 2.3: Orchestration Store Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  OrchestrationStore,
  type OrchestrationAttempt,
} from '../../src/orchestration/orchestration-store';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('OrchestrationStore', () => {
  let store: OrchestrationStore;

  beforeEach(() => {
    ddbMock.reset();
    store = new OrchestrationStore({
      tableName: 'test-orchestration-log',
    });
  });

  describe('logAttempt', () => {
    it('logs successful PROMOTE attempt', async () => {
      ddbMock.on(PutCommand).resolves({});

      const attempt: OrchestrationAttempt = {
        candidateId: 'a'.repeat(64),
        attemptId: 'attempt-123',
        authorityType: 'AUTO_ENGINE',
        authorityId: 'opx-candidate-processor',
        policyId: 'default',
        policyVersion: '1.0.0',
        decision: 'PROMOTE',
        decisionId: 'b'.repeat(64),
        incidentId: 'c'.repeat(64),
        reason: 'Policy evaluation: PROMOTE',
        startedAt: '2026-01-19T00:00:00Z',
        completedAt: '2026-01-19T00:00:01Z',
        durationMs: 1000,
        status: 'success',
        ttl: 0, // Will be overwritten
      };

      await store.logAttempt(attempt);

      expect(ddbMock.calls()).toHaveLength(1);
      const call = ddbMock.call(0);
      expect(call.args[0].input).toMatchObject({
        TableName: 'test-orchestration-log',
        Item: expect.objectContaining({
          pk: `CANDIDATE#${'a'.repeat(64)}`,
          sk: 'ATTEMPT#2026-01-19T00:00:00Z',
          candidateId: 'a'.repeat(64),
          decision: 'PROMOTE',
          incidentId: 'c'.repeat(64),
        }),
      });
    });

    it('logs DEFER attempt without incidentId', async () => {
      ddbMock.on(PutCommand).resolves({});

      const attempt: OrchestrationAttempt = {
        candidateId: 'a'.repeat(64),
        attemptId: 'attempt-456',
        authorityType: 'AUTO_ENGINE',
        authorityId: 'opx-candidate-processor',
        policyId: 'default',
        policyVersion: '1.0.0',
        decision: 'DEFER',
        decisionId: 'b'.repeat(64),
        reason: 'Active incident exists',
        startedAt: '2026-01-19T00:00:00Z',
        completedAt: '2026-01-19T00:00:01Z',
        durationMs: 500,
        status: 'success',
        ttl: 0,
      };

      await store.logAttempt(attempt);

      expect(ddbMock.calls()).toHaveLength(1);
      const call = ddbMock.call(0);
      expect(call.args[0].input.Item).not.toHaveProperty('incidentId');
    });

    it('logs SUPPRESS attempt', async () => {
      ddbMock.on(PutCommand).resolves({});

      const attempt: OrchestrationAttempt = {
        candidateId: 'a'.repeat(64),
        attemptId: 'attempt-789',
        authorityType: 'AUTO_ENGINE',
        authorityId: 'opx-candidate-processor',
        policyId: 'default',
        policyVersion: '1.0.0',
        decision: 'SUPPRESS',
        decisionId: 'b'.repeat(64),
        reason: 'Maintenance window active',
        startedAt: '2026-01-19T00:00:00Z',
        completedAt: '2026-01-19T00:00:01Z',
        durationMs: 300,
        status: 'success',
        ttl: 0,
      };

      await store.logAttempt(attempt);

      expect(ddbMock.calls()).toHaveLength(1);
    });

    it('sets 90-day TTL', async () => {
      ddbMock.on(PutCommand).resolves({});

      const attempt: OrchestrationAttempt = {
        candidateId: 'a'.repeat(64),
        attemptId: 'attempt-123',
        authorityType: 'AUTO_ENGINE',
        authorityId: 'opx-candidate-processor',
        policyId: 'default',
        policyVersion: '1.0.0',
        decision: 'PROMOTE',
        decisionId: 'b'.repeat(64),
        incidentId: 'c'.repeat(64),
        reason: 'Policy evaluation: PROMOTE',
        startedAt: '2026-01-19T00:00:00Z',
        completedAt: '2026-01-19T00:00:01Z',
        durationMs: 1000,
        status: 'success',
        ttl: 0,
      };

      await store.logAttempt(attempt);

      const call = ddbMock.call(0);
      const ttl = call.args[0].input.Item.ttl;
      const now = Math.floor(Date.now() / 1000);
      const expectedTtl = now + (90 * 24 * 60 * 60);
      
      // Allow 5 second tolerance for test execution time
      expect(ttl).toBeGreaterThanOrEqual(expectedTtl - 5);
      expect(ttl).toBeLessThanOrEqual(expectedTtl + 5);
    });

    it('does not throw on DynamoDB error', async () => {
      ddbMock.on(PutCommand).rejects(new Error('DynamoDB error'));

      const attempt: OrchestrationAttempt = {
        candidateId: 'a'.repeat(64),
        attemptId: 'attempt-123',
        authorityType: 'AUTO_ENGINE',
        authorityId: 'opx-candidate-processor',
        policyId: 'default',
        policyVersion: '1.0.0',
        decision: 'PROMOTE',
        decisionId: 'b'.repeat(64),
        incidentId: 'c'.repeat(64),
        reason: 'Policy evaluation: PROMOTE',
        startedAt: '2026-01-19T00:00:00Z',
        completedAt: '2026-01-19T00:00:01Z',
        durationMs: 1000,
        status: 'success',
        ttl: 0,
      };

      // Should not throw
      await expect(store.logAttempt(attempt)).resolves.toBeUndefined();
    });
  });

  describe('getAttempts', () => {
    it('retrieves attempts for candidate', async () => {
      const mockAttempts = [
        {
          pk: 'CANDIDATE#' + 'a'.repeat(64),
          sk: 'ATTEMPT#2026-01-19T00:00:02Z',
          candidateId: 'a'.repeat(64),
          attemptId: 'attempt-2',
          decision: 'PROMOTE',
          decisionId: 'b'.repeat(64),
        },
        {
          pk: 'CANDIDATE#' + 'a'.repeat(64),
          sk: 'ATTEMPT#2026-01-19T00:00:01Z',
          candidateId: 'a'.repeat(64),
          attemptId: 'attempt-1',
          decision: 'DEFER',
          decisionId: 'c'.repeat(64),
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockAttempts,
      });

      const attempts = await store.getAttempts('a'.repeat(64));

      expect(attempts).toHaveLength(2);
      expect(attempts[0].attemptId).toBe('attempt-2');
      expect(attempts[1].attemptId).toBe('attempt-1');
    });

    it('returns empty array on DynamoDB error', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('DynamoDB error'));

      const attempts = await store.getAttempts('a'.repeat(64));

      expect(attempts).toEqual([]);
    });

    it('respects limit parameter', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await store.getAttempts('a'.repeat(64), 50);

      const call = ddbMock.call(0);
      expect(call.args[0].input.Limit).toBe(50);
    });

    it('uses default limit of 100', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await store.getAttempts('a'.repeat(64));

      const call = ddbMock.call(0);
      expect(call.args[0].input.Limit).toBe(100);
    });

    it('queries with correct key condition', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await store.getAttempts('a'.repeat(64));

      const call = ddbMock.call(0);
      expect(call.args[0].input).toMatchObject({
        TableName: 'test-orchestration-log',
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': 'CANDIDATE#' + 'a'.repeat(64),
        },
        ScanIndexForward: false, // Most recent first
      });
    });
  });
});
