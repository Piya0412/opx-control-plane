/**
 * Phase 4 - Step 1: Outcome Schema Tests
 */

import { describe, it, expect } from 'vitest';
import {
  IncidentOutcomeSchema,
  OutcomeClassificationSchema,
  OutcomeTimingSchema,
  HumanAssessmentSchema,
  OutcomeRequestSchema,
} from '../../src/learning/outcome.schema';

describe('Outcome Schema', () => {
  describe('OutcomeClassificationSchema', () => {
    it('should validate valid classification', () => {
      const classification = {
        truePositive: true,
        falsePositive: false,
        rootCause: 'Database connection pool exhausted',
        resolutionType: 'FIXED' as const,
      };

      const result = OutcomeClassificationSchema.safeParse(classification);
      expect(result.success).toBe(true);
    });

    it('should reject both truePositive and falsePositive', () => {
      const classification = {
        truePositive: true,
        falsePositive: true,
        rootCause: 'Test',
        resolutionType: 'FIXED' as const,
      };

      const result = OutcomeClassificationSchema.safeParse(classification);
      expect(result.success).toBe(false);
    });

    it('should reject invalid resolutionType', () => {
      const classification = {
        truePositive: true,
        falsePositive: false,
        rootCause: 'Test',
        resolutionType: 'INVALID',
      };

      const result = OutcomeClassificationSchema.safeParse(classification);
      expect(result.success).toBe(false);
    });

    it('should reject empty rootCause', () => {
      const classification = {
        truePositive: true,
        falsePositive: false,
        rootCause: '',
        resolutionType: 'FIXED' as const,
      };

      const result = OutcomeClassificationSchema.safeParse(classification);
      expect(result.success).toBe(false);
    });

    it('should reject rootCause > 500 characters', () => {
      const classification = {
        truePositive: true,
        falsePositive: false,
        rootCause: 'a'.repeat(501),
        resolutionType: 'FIXED' as const,
      };

      const result = OutcomeClassificationSchema.safeParse(classification);
      expect(result.success).toBe(false);
    });
  });

  describe('OutcomeTimingSchema', () => {
    it('should validate valid timing', () => {
      const timing = {
        detectedAt: '2026-01-22T09:00:00.000Z',
        acknowledgedAt: '2026-01-22T09:05:00.000Z',
        mitigatedAt: '2026-01-22T09:30:00.000Z',
        resolvedAt: '2026-01-22T09:45:00.000Z',
        closedAt: '2026-01-22T10:00:00.000Z',
        ttd: 300000,
        ttr: 2700000,
      };

      const result = OutcomeTimingSchema.safeParse(timing);
      expect(result.success).toBe(true);
    });

    it('should reject negative TTD', () => {
      const timing = {
        detectedAt: '2026-01-22T09:00:00.000Z',
        resolvedAt: '2026-01-22T09:45:00.000Z',
        closedAt: '2026-01-22T10:00:00.000Z',
        ttd: -100,
        ttr: 2700000,
      };

      const result = OutcomeTimingSchema.safeParse(timing);
      expect(result.success).toBe(false);
    });

    it('should reject negative TTR', () => {
      const timing = {
        detectedAt: '2026-01-22T09:00:00.000Z',
        resolvedAt: '2026-01-22T09:45:00.000Z',
        closedAt: '2026-01-22T10:00:00.000Z',
        ttd: 300000,
        ttr: -100,
      };

      const result = OutcomeTimingSchema.safeParse(timing);
      expect(result.success).toBe(false);
    });

    it('should reject invalid timestamp format', () => {
      const timing = {
        detectedAt: 'invalid-date',
        resolvedAt: '2026-01-22T09:45:00.000Z',
        closedAt: '2026-01-22T10:00:00.000Z',
        ttd: 300000,
        ttr: 2700000,
      };

      const result = OutcomeTimingSchema.safeParse(timing);
      expect(result.success).toBe(false);
    });
  });

  describe('HumanAssessmentSchema', () => {
    it('should validate valid assessment', () => {
      const assessment = {
        confidenceRating: 0.85,
        severityAccuracy: 'ACCURATE' as const,
        detectionQuality: 'GOOD' as const,
        notes: 'Detection was timely',
      };

      const result = HumanAssessmentSchema.safeParse(assessment);
      expect(result.success).toBe(true);
    });

    it('should reject confidenceRating > 1', () => {
      const assessment = {
        confidenceRating: 1.5,
        severityAccuracy: 'ACCURATE' as const,
        detectionQuality: 'GOOD' as const,
      };

      const result = HumanAssessmentSchema.safeParse(assessment);
      expect(result.success).toBe(false);
    });

    it('should reject confidenceRating < 0', () => {
      const assessment = {
        confidenceRating: -0.1,
        severityAccuracy: 'ACCURATE' as const,
        detectionQuality: 'GOOD' as const,
      };

      const result = HumanAssessmentSchema.safeParse(assessment);
      expect(result.success).toBe(false);
    });

    it('should reject notes > 2000 characters', () => {
      const assessment = {
        confidenceRating: 0.85,
        severityAccuracy: 'ACCURATE' as const,
        detectionQuality: 'GOOD' as const,
        notes: 'a'.repeat(2001),
      };

      const result = HumanAssessmentSchema.safeParse(assessment);
      expect(result.success).toBe(false);
    });

    it('should accept notes <= 2000 characters', () => {
      const assessment = {
        confidenceRating: 0.85,
        severityAccuracy: 'ACCURATE' as const,
        detectionQuality: 'GOOD' as const,
        notes: 'a'.repeat(2000),
      };

      const result = HumanAssessmentSchema.safeParse(assessment);
      expect(result.success).toBe(true);
    });
  });

  describe('IncidentOutcomeSchema', () => {
    const validOutcome = {
      outcomeId: 'a'.repeat(64),
      incidentId: 'b'.repeat(64),
      service: 'order-service',
      recordedAt: '2026-01-22T10:00:00.000Z',
      validatedAt: '2026-01-22T10:00:05.000Z',
      recordedBy: {
        type: 'ON_CALL_SRE' as const,
        principal: 'arn:aws:iam::123456789012:user/sre',
      },
      classification: {
        truePositive: true,
        falsePositive: false,
        rootCause: 'Database connection pool exhausted',
        resolutionType: 'FIXED' as const,
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
        severityAccuracy: 'ACCURATE' as const,
        detectionQuality: 'GOOD' as const,
      },
      version: '1.0.0',
    };

    it('should validate valid outcome', () => {
      const result = IncidentOutcomeSchema.safeParse(validOutcome);
      expect(result.success).toBe(true);
    });

    it('should reject outcomeId not 64 characters', () => {
      const outcome = { ...validOutcome, outcomeId: 'short' };
      const result = IncidentOutcomeSchema.safeParse(outcome);
      expect(result.success).toBe(false);
    });

    it('should reject incidentId not 64 characters', () => {
      const outcome = { ...validOutcome, incidentId: 'short' };
      const result = IncidentOutcomeSchema.safeParse(outcome);
      expect(result.success).toBe(false);
    });

    it('should reject missing service', () => {
      const { service, ...outcome } = validOutcome;
      const result = IncidentOutcomeSchema.safeParse(outcome);
      expect(result.success).toBe(false);
    });

    it('should reject validatedAt < recordedAt', () => {
      const outcome = {
        ...validOutcome,
        recordedAt: '2026-01-22T10:00:00.000Z',
        validatedAt: '2026-01-22T09:59:59.000Z', // Before recordedAt
      };

      const result = IncidentOutcomeSchema.safeParse(outcome);
      expect(result.success).toBe(false);
    });

    it('should accept validatedAt = recordedAt', () => {
      const outcome = {
        ...validOutcome,
        recordedAt: '2026-01-22T10:00:00.000Z',
        validatedAt: '2026-01-22T10:00:00.000Z', // Same time
      };

      const result = IncidentOutcomeSchema.safeParse(outcome);
      expect(result.success).toBe(true);
    });

    it('should accept validatedAt > recordedAt', () => {
      const outcome = {
        ...validOutcome,
        recordedAt: '2026-01-22T10:00:00.000Z',
        validatedAt: '2026-01-22T10:00:05.000Z', // After recordedAt
      };

      const result = IncidentOutcomeSchema.safeParse(outcome);
      expect(result.success).toBe(true);
    });
  });

  describe('OutcomeRequestSchema', () => {
    it('should validate valid request', () => {
      const request = {
        classification: {
          truePositive: true,
          falsePositive: false,
          rootCause: 'Database connection pool exhausted',
          resolutionType: 'FIXED' as const,
        },
        humanAssessment: {
          confidenceRating: 0.85,
          severityAccuracy: 'ACCURATE' as const,
          detectionQuality: 'GOOD' as const,
        },
      };

      const result = OutcomeRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should reject missing classification', () => {
      const request = {
        humanAssessment: {
          confidenceRating: 0.85,
          severityAccuracy: 'ACCURATE' as const,
          detectionQuality: 'GOOD' as const,
        },
      };

      const result = OutcomeRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject missing humanAssessment', () => {
      const request = {
        classification: {
          truePositive: true,
          falsePositive: false,
          rootCause: 'Test',
          resolutionType: 'FIXED' as const,
        },
      };

      const result = OutcomeRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });
});
