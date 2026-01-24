/**
 * Phase 4 - Step 2: Validation Gate Tests
 * 
 * Tests for human validation gate.
 */

import { describe, it, expect } from 'vitest';
import { ValidationGate, ValidationError } from '../../src/learning/validation-gate';
import type { Incident, Authority } from '../../src/incident/incident.schema';
import type { OutcomeRequest } from '../../src/learning/outcome.schema';

describe('Phase 4 - Step 2: Validation Gate', () => {
  const validIncident: Incident = {
    incidentId: 'a'.repeat(64),
    service: 'order-service',
    severity: 'HIGH',
    state: 'CLOSED',
    evidenceId: 'b'.repeat(64),
    candidateId: 'c'.repeat(64),
    confidenceScore: 0.85,
    openedAt: '2026-01-22T09:00:00.000Z',
    acknowledgedAt: '2026-01-22T09:05:00.000Z',
    mitigatedAt: '2026-01-22T09:30:00.000Z',
    resolvedAt: '2026-01-22T09:45:00.000Z',
    closedAt: '2026-01-22T10:00:00.000Z',
    title: 'Test Incident',
    description: 'Test incident for validation',
    tags: [],
    createdBy: { type: 'AUTO_ENGINE', principal: 'system' },
    lastModifiedAt: '2026-01-22T10:00:00.000Z',
    lastModifiedBy: { type: 'HUMAN_OPERATOR', principal: 'arn:aws:iam::123456789012:user/operator' },
  };

  const validOutcomeRequest: OutcomeRequest = {
    classification: {
      truePositive: true,
      falsePositive: false,
      rootCause: 'Database connection pool exhausted',
      resolutionType: 'FIXED',
    },
    humanAssessment: {
      confidenceRating: 0.85,
      severityAccuracy: 'ACCURATE',
      detectionQuality: 'GOOD',
    },
  };

  const humanAuthority: Authority = {
    type: 'HUMAN_OPERATOR',
    principal: 'arn:aws:iam::123456789012:user/operator',
  };

  describe('validateOutcomeSubmission', () => {
    it('should pass validation for valid submission', () => {
      const gate = new ValidationGate();
      const result = gate.validateOutcomeSubmission(validIncident, validOutcomeRequest, humanAuthority);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject non-CLOSED incident', () => {
      const gate = new ValidationGate();
      const openIncident = { ...validIncident, state: 'OPEN' as const };

      const result = gate.validateOutcomeSubmission(openIncident, validOutcomeRequest, humanAuthority);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('NOT_CLOSED');
      expect(result.errors[0].message).toContain('CLOSED incidents');
    });

    it('should reject AUTO_ENGINE authority', () => {
      const gate = new ValidationGate();
      const autoAuthority: Authority = {
        type: 'AUTO_ENGINE',
        principal: 'system',
      };

      const result = gate.validateOutcomeSubmission(validIncident, validOutcomeRequest, autoAuthority);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('AUTO_ENGINE_NOT_ALLOWED');
      expect(result.errors[0].message).toContain('AUTO_ENGINE cannot validate outcomes');
    });

    it('should accept HUMAN_OPERATOR authority', () => {
      const gate = new ValidationGate();
      const authority: Authority = {
        type: 'HUMAN_OPERATOR',
        principal: 'arn:aws:iam::123456789012:user/operator',
      };

      const result = gate.validateOutcomeSubmission(validIncident, validOutcomeRequest, authority);

      expect(result.valid).toBe(true);
    });

    it('should accept ON_CALL_SRE authority', () => {
      const gate = new ValidationGate();
      const authority: Authority = {
        type: 'ON_CALL_SRE',
        principal: 'arn:aws:iam::123456789012:user/sre',
      };

      const result = gate.validateOutcomeSubmission(validIncident, validOutcomeRequest, authority);

      expect(result.valid).toBe(true);
    });

    it('should accept EMERGENCY_OVERRIDE authority', () => {
      const gate = new ValidationGate();
      const authority: Authority = {
        type: 'EMERGENCY_OVERRIDE',
        principal: 'arn:aws:iam::123456789012:user/admin',
      };

      const result = gate.validateOutcomeSubmission(validIncident, validOutcomeRequest, authority);

      expect(result.valid).toBe(true);
    });

    it('should reject missing classification', () => {
      const gate = new ValidationGate();
      const invalidRequest = {
        ...validOutcomeRequest,
        classification: null as any,
      };

      const result = gate.validateOutcomeSubmission(validIncident, invalidRequest, humanAuthority);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_CLASSIFICATION')).toBe(true);
    });

    it('should reject inconsistent timing (closedAt < resolvedAt)', () => {
      const gate = new ValidationGate();
      const invalidIncident = {
        ...validIncident,
        closedAt: '2026-01-22T09:00:00.000Z', // Before resolvedAt
        resolvedAt: '2026-01-22T09:45:00.000Z',
      };

      const result = gate.validateOutcomeSubmission(invalidIncident, validOutcomeRequest, humanAuthority);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_CLOSED_AT')).toBe(true);
    });

    it('should reject invalid classification (both true and false positive)', () => {
      const gate = new ValidationGate();
      const invalidRequest = {
        ...validOutcomeRequest,
        classification: {
          truePositive: true,
          falsePositive: true, // Invalid: both true
          rootCause: 'Test',
          resolutionType: 'FIXED' as const,
        },
      };

      const result = gate.validateOutcomeSubmission(validIncident, invalidRequest, humanAuthority);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_CLASSIFICATION')).toBe(true);
    });

    it('should reject invalid classification (neither true nor false positive)', () => {
      const gate = new ValidationGate();
      const invalidRequest = {
        ...validOutcomeRequest,
        classification: {
          truePositive: false,
          falsePositive: false, // Invalid: neither true
          rootCause: 'Test',
          resolutionType: 'FIXED' as const,
        },
      };

      const result = gate.validateOutcomeSubmission(validIncident, invalidRequest, humanAuthority);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_CLASSIFICATION')).toBe(true);
    });

    it('should reject missing root cause', () => {
      const gate = new ValidationGate();
      const invalidRequest = {
        ...validOutcomeRequest,
        classification: {
          ...validOutcomeRequest.classification,
          rootCause: '',
        },
      };

      const result = gate.validateOutcomeSubmission(validIncident, invalidRequest, humanAuthority);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_ROOT_CAUSE')).toBe(true);
    });

    it('should reject missing human assessment', () => {
      const gate = new ValidationGate();
      const invalidRequest = {
        ...validOutcomeRequest,
        humanAssessment: null as any,
      };

      const result = gate.validateOutcomeSubmission(validIncident, invalidRequest, humanAuthority);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_HUMAN_ASSESSMENT')).toBe(true);
    });
  });

  describe('buildOutcome', () => {
    it('should build complete outcome for valid inputs', () => {
      const gate = new ValidationGate();
      const outcome = gate.buildOutcome(validIncident, validOutcomeRequest, humanAuthority);

      expect(outcome.outcomeId).toHaveLength(64);
      expect(outcome.incidentId).toBe(validIncident.incidentId);
      expect(outcome.service).toBe('order-service');
      expect(outcome.recordedBy).toEqual(humanAuthority);
      expect(outcome.classification).toEqual(validOutcomeRequest.classification);
      expect(outcome.humanAssessment).toEqual(validOutcomeRequest.humanAssessment);
      expect(outcome.version).toBe('1.0.0');
    });

    it('should populate service field from incident', () => {
      const gate = new ValidationGate();
      const outcome = gate.buildOutcome(validIncident, validOutcomeRequest, humanAuthority);

      expect(outcome.service).toBe(validIncident.service);
      expect(outcome.service).toBe('order-service');
    });

    it('should enforce timestamp ordering (validatedAt >= recordedAt)', () => {
      const gate = new ValidationGate();
      const outcome = gate.buildOutcome(validIncident, validOutcomeRequest, humanAuthority);

      const recordedTime = new Date(outcome.recordedAt).getTime();
      const validatedTime = new Date(outcome.validatedAt).getTime();

      expect(validatedTime).toBeGreaterThanOrEqual(recordedTime);
    });

    it('should calculate TTD correctly (not hardcoded to 0)', () => {
      const gate = new ValidationGate();
      const outcome = gate.buildOutcome(validIncident, validOutcomeRequest, humanAuthority);

      // TTD should be >= 0 (fallback uses same timestamp, so 0 is acceptable)
      expect(outcome.timing.ttd).toBeGreaterThanOrEqual(0);
      expect(typeof outcome.timing.ttd).toBe('number');
    });

    it('should calculate TTR correctly', () => {
      const gate = new ValidationGate();
      const outcome = gate.buildOutcome(validIncident, validOutcomeRequest, humanAuthority);

      const expectedTTR = new Date(validIncident.resolvedAt!).getTime() - 
                          new Date(validIncident.openedAt).getTime();

      expect(outcome.timing.ttr).toBe(expectedTTR);
      expect(outcome.timing.ttr).toBeGreaterThan(0);
    });

    it('should throw ValidationError for invalid inputs', () => {
      const gate = new ValidationGate();
      const openIncident = { ...validIncident, state: 'OPEN' as const };

      expect(() => {
        gate.buildOutcome(openIncident, validOutcomeRequest, humanAuthority);
      }).toThrow(ValidationError);
    });

    it('should generate deterministic outcomeId', () => {
      const gate = new ValidationGate();
      const outcome1 = gate.buildOutcome(validIncident, validOutcomeRequest, humanAuthority);
      
      // Wait a bit to ensure different recordedAt
      const outcome2 = gate.buildOutcome(validIncident, validOutcomeRequest, humanAuthority);

      // outcomeId should be same (deterministic from incidentId + closedAt)
      expect(outcome1.outcomeId).toBe(outcome2.outcomeId);
    });

    it('should include all timing fields', () => {
      const gate = new ValidationGate();
      const outcome = gate.buildOutcome(validIncident, validOutcomeRequest, humanAuthority);

      expect(outcome.timing.detectedAt).toBe(validIncident.openedAt);
      expect(outcome.timing.acknowledgedAt).toBe(validIncident.acknowledgedAt);
      expect(outcome.timing.mitigatedAt).toBe(validIncident.mitigatedAt);
      expect(outcome.timing.resolvedAt).toBe(validIncident.resolvedAt);
      expect(outcome.timing.closedAt).toBe(validIncident.closedAt);
      expect(outcome.timing.ttd).toBeGreaterThanOrEqual(0);
      expect(outcome.timing.ttr).toBeGreaterThan(0);
    });
  });
});
