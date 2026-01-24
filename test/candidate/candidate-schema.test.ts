/**
 * CP-5: Candidate Schema Tests
 */

import { describe, it, expect } from 'vitest';
import {
  IncidentCandidateSchema,
  CandidateConfidenceSchema,
  BlastRadiusSchema,
  computeCandidateId,
  computeCorrelationKey,
  ResolvedKeyFields,
  CANDIDATE_VERSION,
} from '../../src/candidate/candidate.schema.js';

describe('CP-5: Candidate Schema', () => {
  describe('CandidateConfidenceSchema', () => {
    it('should accept valid confidence values', () => {
      expect(CandidateConfidenceSchema.parse('HIGH')).toBe('HIGH');
      expect(CandidateConfidenceSchema.parse('MEDIUM')).toBe('MEDIUM');
      expect(CandidateConfidenceSchema.parse('LOW')).toBe('LOW');
    });

    it('should reject invalid confidence values', () => {
      expect(() => CandidateConfidenceSchema.parse('INVALID')).toThrow();
      expect(() => CandidateConfidenceSchema.parse('')).toThrow();
    });
  });

  describe('BlastRadiusSchema', () => {
    it('should accept valid blast radius', () => {
      const valid = {
        scope: 'SINGLE_SERVICE',
        affectedServices: ['service-a'],
        affectedResources: ['arn:aws:lambda:us-east-1:123:function:test'],
        estimatedImpact: 'LOW',
      };
      expect(BlastRadiusSchema.parse(valid)).toEqual(valid);
    });

    it('should reject unknown fields (strict)', () => {
      const invalid = {
        scope: 'SINGLE_SERVICE',
        affectedServices: [],
        affectedResources: [],
        estimatedImpact: 'LOW',
        extraField: 'not allowed',
      };
      expect(() => BlastRadiusSchema.parse(invalid)).toThrow();
    });

    it('should enforce max 50 affected services', () => {
      const tooMany = {
        scope: 'MULTI_SERVICE',
        affectedServices: Array(51).fill('service'),
        affectedResources: [],
        estimatedImpact: 'HIGH',
      };
      expect(() => BlastRadiusSchema.parse(tooMany)).toThrow();
    });

    it('should enforce max 20 affected resources', () => {
      const tooMany = {
        scope: 'SINGLE_SERVICE',
        affectedServices: [],
        affectedResources: Array(21).fill('resource'),
        estimatedImpact: 'LOW',
      };
      expect(() => BlastRadiusSchema.parse(tooMany)).toThrow();
    });
  });

  describe('IncidentCandidateSchema', () => {
    const validCandidate = {
      candidateId: 'a'.repeat(64),
      candidateVersion: 'v1',
      correlationKey: 'b'.repeat(64),
      correlationRule: 'service-cascade',
      correlationRuleVersion: '1.0.0',
      policyId: 'default',
      policyVersion: '1.0.0',
      evidenceGraphIds: ['graph-1'],
      detectionIds: ['detection-1'],
      primaryDetectionId: 'detection-1',
      suggestedSeverity: 'SEV2',
      suggestedService: 'payment-service',
      suggestedTitle: '[SEV2] lambda-error-rate detected',
      confidence: 'MEDIUM',
      confidenceFactors: [],
      blastRadius: {
        scope: 'SINGLE_SERVICE',
        affectedServices: ['payment-service'],
        affectedResources: [],
        estimatedImpact: 'MEDIUM',
      },
      generationTrace: [],
      windowStart: '2026-01-16T10:00:00.000Z',
      windowEnd: '2026-01-16T11:00:00.000Z',
      createdAt: '2026-01-16T11:05:00.000Z',
    };

    it('should accept valid candidate', () => {
      expect(IncidentCandidateSchema.parse(validCandidate)).toEqual(validCandidate);
    });

    it('should reject invalid candidateId length', () => {
      const invalid = { ...validCandidate, candidateId: 'too-short' };
      expect(() => IncidentCandidateSchema.parse(invalid)).toThrow();
    });

    it('should reject unknown fields (strict)', () => {
      const invalid = { ...validCandidate, extraField: 'not allowed' };
      expect(() => IncidentCandidateSchema.parse(invalid)).toThrow();
    });

    it('should require at least one detection', () => {
      const invalid = { ...validCandidate, detectionIds: [] };
      expect(() => IncidentCandidateSchema.parse(invalid)).toThrow();
    });

    it('should enforce max 100 detections', () => {
      const invalid = { ...validCandidate, detectionIds: Array(101).fill('d') };
      expect(() => IncidentCandidateSchema.parse(invalid)).toThrow();
    });

    it('should enforce max 20 trace steps', () => {
      const invalid = {
        ...validCandidate,
        generationTrace: Array(21).fill({ step: 1, action: 'test', input: '', output: '' }),
      };
      expect(() => IncidentCandidateSchema.parse(invalid)).toThrow();
    });
  });

  describe('computeCandidateId', () => {
    it('should be deterministic', () => {
      const key = 'a'.repeat(64);
      const id1 = computeCandidateId(key, 'v1');
      const id2 = computeCandidateId(key, 'v1');
      expect(id1).toBe(id2);
    });

    it('should produce 64-char hex string', () => {
      const id = computeCandidateId('test-key', 'v1');
      expect(id).toHaveLength(64);
      expect(id).toMatch(/^[a-f0-9]+$/);
    });

    it('should produce different IDs for different inputs', () => {
      const id1 = computeCandidateId('key-1', 'v1');
      const id2 = computeCandidateId('key-2', 'v1');
      expect(id1).not.toBe(id2);
    });

    it('should produce different IDs for different versions', () => {
      const id1 = computeCandidateId('same-key', 'v1');
      const id2 = computeCandidateId('same-key', 'v2');
      expect(id1).not.toBe(id2);
    });
  });

  describe('computeCorrelationKey', () => {
    it('should be deterministic', () => {
      const keyFields: ResolvedKeyFields = {
        service: 'payment',
        windowTruncated: '2026-01-16T10:00:00.000Z',
      };
      const key1 = computeCorrelationKey(['d1', 'd2'], 'rule-1', '1.0.0', keyFields);
      const key2 = computeCorrelationKey(['d1', 'd2'], 'rule-1', '1.0.0', keyFields);
      expect(key1).toBe(key2);
    });

    it('should be order-independent (HARDENING #1)', () => {
      const keyFields: ResolvedKeyFields = {
        windowTruncated: '2026-01-16T10:00:00.000Z',
      };
      const key1 = computeCorrelationKey(['d1', 'd2', 'd3'], 'rule-1', '1.0.0', keyFields);
      const key2 = computeCorrelationKey(['d3', 'd1', 'd2'], 'rule-1', '1.0.0', keyFields);
      expect(key1).toBe(key2);
    });

    it('should produce different keys for different keyFields (FIX-A)', () => {
      const keyFields1: ResolvedKeyFields = {
        service: 'payment',
        windowTruncated: '2026-01-16T10:00:00.000Z',
      };
      const keyFields2: ResolvedKeyFields = {
        service: 'orders',
        windowTruncated: '2026-01-16T10:00:00.000Z',
      };
      const key1 = computeCorrelationKey(['d1'], 'rule-1', '1.0.0', keyFields1);
      const key2 = computeCorrelationKey(['d1'], 'rule-1', '1.0.0', keyFields2);
      expect(key1).not.toBe(key2);
    });

    it('should include all keyFields in computation (FIX-A mandatory test)', () => {
      // Same detections, same window, different keyFields → different candidateIds
      const keyFields1: ResolvedKeyFields = {
        service: 'payment',
        windowTruncated: '2026-01-16T10:00:00.000Z',
      };
      const keyFields2: ResolvedKeyFields = {
        ruleId: 'lambda-error',
        windowTruncated: '2026-01-16T10:00:00.000Z',
      };
      const key1 = computeCorrelationKey(['d1', 'd2'], 'rule-1', '1.0.0', keyFields1);
      const key2 = computeCorrelationKey(['d1', 'd2'], 'rule-1', '1.0.0', keyFields2);
      expect(key1).not.toBe(key2);
    });

    it('should produce different keys for different rules', () => {
      const keyFields: ResolvedKeyFields = {
        windowTruncated: '2026-01-16T10:00:00.000Z',
      };
      const key1 = computeCorrelationKey(['d1'], 'rule-1', '1.0.0', keyFields);
      const key2 = computeCorrelationKey(['d1'], 'rule-2', '1.0.0', keyFields);
      expect(key1).not.toBe(key2);
    });
  });
});
