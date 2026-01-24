/**
 * Phase 4 - Step 1: Outcome Store Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutcomeStore } from '../../src/learning/outcome-store';
import type { IncidentOutcome } from '../../src/learning/outcome.schema';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';

describe('OutcomeStore', () => {
  let store: OutcomeStore;
  let mockClient: DynamoDBClient;

  const validOutcome: IncidentOutcome = {
    outcomeId: 'a'.repeat(64),
    incidentId: 'b'.repeat(64),
    service: 'order-service',
    recordedAt: '2026-01-22T10:00:00.000Z',
    validatedAt: '2026-01-22T10:00:05.000Z',
    recordedBy: {
      type: 'ON_CALL_SRE',
      principal: 'arn:aws:iam::123456789012:user/sre',
    },
    classification: {
      truePositive: true,
      falsePositive: false,
      rootCause: 'Database connection pool exhausted',
      resolutionType: 'FIXED',
    },
    timing: {
      detectedAt: '2026-01-22T09:00:00.000Z',
      acknowledgedAt: '2026-01-22T09:05:00.000Z',
      mitigatedAt: '2026-01-22T09:30:00.000Z',
      resolvedAt: '2026-01-22T09:45:00.000Z',
      closedAt: '2026-01-22T10:00:00.000Z',
      ttd: 300000,
      ttr: 2700000,
    },
    humanAssessment: {
      confidenceRating: 0.85,
      severityAccuracy: 'ACCURATE',
      detectionQuality: 'GOOD',
      notes: 'Detection was timely',
    },
    version: '1.0.0',
  };

  beforeEach(() => {
    mockClient = {
      send: vi.fn(),
    } as any;

    store = new OutcomeStore({
      tableName: 'opx-incident-outcomes-test',
      client: mockClient,
    });
  });

  describe('recordOutcome', () => {
    it('should record outcome successfully', async () => {
      vi.mocked(mockClient.send).mockResolvedValue({});

      const result = await store.recordOutcome(validOutcome);

      expect(result).toBe(true);
      expect(mockClient.send).toHaveBeenCalledTimes(1);
    });

    it('should return false for duplicate outcome (idempotent)', async () => {
      const error: any = new Error('ConditionalCheckFailedException');
      error.name = 'ConditionalCheckFailedException';
      vi.mocked(mockClient.send).mockRejectedValue(error);

      const result = await store.recordOutcome(validOutcome);

      expect(result).toBe(false);
    });

    it('should throw on validation error', async () => {
      const invalidOutcome = {
        ...validOutcome,
        outcomeId: 'short', // Invalid: not 64 chars
      };

      await expect(store.recordOutcome(invalidOutcome as any)).rejects.toThrow();
    });

    it('should throw on DynamoDB error', async () => {
      const error = new Error('DynamoDB error');
      vi.mocked(mockClient.send).mockRejectedValue(error);

      await expect(store.recordOutcome(validOutcome)).rejects.toThrow('DynamoDB error');
    });
  });

  describe('getOutcome', () => {
    it('should return outcome if found', async () => {
      vi.mocked(mockClient.send).mockResolvedValue({
        Item: {
          pk: { S: `OUTCOME#${validOutcome.outcomeId}` },
          sk: { S: 'v1' },
          outcomeId: { S: validOutcome.outcomeId },
          incidentId: { S: validOutcome.incidentId },
          service: { S: validOutcome.service },
          recordedAt: { S: validOutcome.recordedAt },
          validatedAt: { S: validOutcome.validatedAt },
          recordedBy: {
            M: {
              type: { S: validOutcome.recordedBy.type },
              principal: { S: validOutcome.recordedBy.principal },
            },
          },
          classification: {
            M: {
              truePositive: { BOOL: validOutcome.classification.truePositive },
              falsePositive: { BOOL: validOutcome.classification.falsePositive },
              rootCause: { S: validOutcome.classification.rootCause },
              resolutionType: { S: validOutcome.classification.resolutionType },
            },
          },
          timing: {
            M: {
              detectedAt: { S: validOutcome.timing.detectedAt },
              acknowledgedAt: { S: validOutcome.timing.acknowledgedAt! },
              mitigatedAt: { S: validOutcome.timing.mitigatedAt! },
              resolvedAt: { S: validOutcome.timing.resolvedAt },
              closedAt: { S: validOutcome.timing.closedAt },
              ttd: { N: validOutcome.timing.ttd.toString() },
              ttr: { N: validOutcome.timing.ttr.toString() },
            },
          },
          humanAssessment: {
            M: {
              confidenceRating: { N: validOutcome.humanAssessment.confidenceRating.toString() },
              severityAccuracy: { S: validOutcome.humanAssessment.severityAccuracy },
              detectionQuality: { S: validOutcome.humanAssessment.detectionQuality },
              notes: { S: validOutcome.humanAssessment.notes! },
            },
          },
          version: { S: validOutcome.version },
        },
      });

      const result = await store.getOutcome(validOutcome.outcomeId);

      expect(result).toBeDefined();
      expect(result?.outcomeId).toBe(validOutcome.outcomeId);
      expect(result?.service).toBe(validOutcome.service);
    });

    it('should return null if not found', async () => {
      vi.mocked(mockClient.send).mockResolvedValue({});

      const result = await store.getOutcome('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getOutcomeByIncident', () => {
    it('should return outcome if found', async () => {
      vi.mocked(mockClient.send).mockResolvedValue({
        Items: [
          {
            pk: { S: `OUTCOME#${validOutcome.outcomeId}` },
            sk: { S: 'v1' },
            outcomeId: { S: validOutcome.outcomeId },
            incidentId: { S: validOutcome.incidentId },
            service: { S: validOutcome.service },
            recordedAt: { S: validOutcome.recordedAt },
            validatedAt: { S: validOutcome.validatedAt },
            recordedBy: {
              M: {
                type: { S: validOutcome.recordedBy.type },
                principal: { S: validOutcome.recordedBy.principal },
              },
            },
            classification: {
              M: {
                truePositive: { BOOL: validOutcome.classification.truePositive },
                falsePositive: { BOOL: validOutcome.classification.falsePositive },
                rootCause: { S: validOutcome.classification.rootCause },
                resolutionType: { S: validOutcome.classification.resolutionType },
              },
            },
            timing: {
              M: {
                detectedAt: { S: validOutcome.timing.detectedAt },
                acknowledgedAt: { S: validOutcome.timing.acknowledgedAt! },
                mitigatedAt: { S: validOutcome.timing.mitigatedAt! },
                resolvedAt: { S: validOutcome.timing.resolvedAt },
                closedAt: { S: validOutcome.timing.closedAt },
                ttd: { N: validOutcome.timing.ttd.toString() },
                ttr: { N: validOutcome.timing.ttr.toString() },
              },
            },
            humanAssessment: {
              M: {
                confidenceRating: { N: validOutcome.humanAssessment.confidenceRating.toString() },
                severityAccuracy: { S: validOutcome.humanAssessment.severityAccuracy },
                detectionQuality: { S: validOutcome.humanAssessment.detectionQuality },
                notes: { S: validOutcome.humanAssessment.notes! },
              },
            },
            version: { S: validOutcome.version },
          },
        ],
      });

      const result = await store.getOutcomeByIncident(validOutcome.incidentId);

      expect(result).toBeDefined();
      expect(result?.incidentId).toBe(validOutcome.incidentId);
    });

    it('should return null if not found', async () => {
      vi.mocked(mockClient.send).mockResolvedValue({ Items: [] });

      const result = await store.getOutcomeByIncident('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('listOutcomes', () => {
    it('should list outcomes with service filter', async () => {
      vi.mocked(mockClient.send).mockResolvedValue({
        Items: [
          {
            pk: { S: `OUTCOME#${validOutcome.outcomeId}` },
            sk: { S: 'v1' },
            outcomeId: { S: validOutcome.outcomeId },
            incidentId: { S: validOutcome.incidentId },
            service: { S: validOutcome.service },
            recordedAt: { S: validOutcome.recordedAt },
            validatedAt: { S: validOutcome.validatedAt },
            recordedBy: {
              M: {
                type: { S: validOutcome.recordedBy.type },
                principal: { S: validOutcome.recordedBy.principal },
              },
            },
            classification: {
              M: {
                truePositive: { BOOL: validOutcome.classification.truePositive },
                falsePositive: { BOOL: validOutcome.classification.falsePositive },
                rootCause: { S: validOutcome.classification.rootCause },
                resolutionType: { S: validOutcome.classification.resolutionType },
              },
            },
            timing: {
              M: {
                detectedAt: { S: validOutcome.timing.detectedAt },
                acknowledgedAt: { S: validOutcome.timing.acknowledgedAt! },
                mitigatedAt: { S: validOutcome.timing.mitigatedAt! },
                resolvedAt: { S: validOutcome.timing.resolvedAt },
                closedAt: { S: validOutcome.timing.closedAt },
                ttd: { N: validOutcome.timing.ttd.toString() },
                ttr: { N: validOutcome.timing.ttr.toString() },
              },
            },
            humanAssessment: {
              M: {
                confidenceRating: { N: validOutcome.humanAssessment.confidenceRating.toString() },
                severityAccuracy: { S: validOutcome.humanAssessment.severityAccuracy },
                detectionQuality: { S: validOutcome.humanAssessment.detectionQuality },
                notes: { S: validOutcome.humanAssessment.notes! },
              },
            },
            version: { S: validOutcome.version },
          },
        ],
      });

      const result = await store.listOutcomes({ service: 'order-service' });

      expect(result).toHaveLength(1);
      expect(result[0].service).toBe('order-service');
    });

    it('should return empty array if no outcomes found', async () => {
      vi.mocked(mockClient.send).mockResolvedValue({ Items: [] });

      const result = await store.listOutcomes({ service: 'nonexistent' });

      expect(result).toEqual([]);
    });
  });
});
