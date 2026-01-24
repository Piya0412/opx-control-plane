/**
 * CP-6: Promotion Schema Tests
 */

import { describe, it, expect } from 'vitest';
import {
  PromotionRequestSchema,
  PromotionRequestWithValidationSchema,
  PromotionDecisionSchema,
  PromotionAuditRecordSchema,
  computeDecisionId,
  computeDecisionHash,
  PROMOTION_VERSION,
} from '../../src/promotion/promotion.schema.js';

describe('CP-6: Promotion Schemas', () => {
  describe('PromotionRequest', () => {
    const validRequest = {
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      candidateId: 'a'.repeat(64),
      policyId: 'default',
      policyVersion: '1.0.0',
      authorityType: 'HUMAN_OPERATOR' as const,
      authorityId: 'user:jane@example.com',
      requestContextHash: 'b'.repeat(64),
      requestedAt: '2026-01-16T10:30:00.000Z',
    };

    it('should accept valid request', () => {
      const result = PromotionRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID for requestId', () => {
      const request = { ...validRequest, requestId: 'not-a-uuid' };
      const result = PromotionRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject invalid candidateId length', () => {
      const request = { ...validRequest, candidateId: 'too-short' };
      const result = PromotionRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject invalid authority type', () => {
      const request = { ...validRequest, authorityType: 'INVALID' };
      const result = PromotionRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject invalid requestContextHash length', () => {
      const request = { ...validRequest, requestContextHash: 'too-short' };
      const result = PromotionRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should accept optional justification', () => {
      const request = { ...validRequest, justification: 'Emergency situation requires immediate action' };
      const result = PromotionRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should accept optional sessionId', () => {
      const request = { ...validRequest, sessionId: 'session-123' };
      const result = PromotionRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });
  });

  describe('PromotionRequestWithValidation', () => {
    it('should require justification for EMERGENCY_OVERRIDE', () => {
      const request = {
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        candidateId: 'a'.repeat(64),
        policyId: 'emergency',
        policyVersion: '1.0.0',
        authorityType: 'EMERGENCY_OVERRIDE' as const,
        authorityId: 'user:admin@example.com',
        requestContextHash: 'b'.repeat(64),
        requestedAt: '2026-01-16T10:30:00.000Z',
      };

      const result = PromotionRequestWithValidationSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should accept EMERGENCY_OVERRIDE with justification', () => {
      const request = {
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        candidateId: 'a'.repeat(64),
        policyId: 'emergency',
        policyVersion: '1.0.0',
        authorityType: 'EMERGENCY_OVERRIDE' as const,
        authorityId: 'user:admin@example.com',
        justification: 'Critical production outage affecting all customers',
        requestContextHash: 'b'.repeat(64),
        requestedAt: '2026-01-16T10:30:00.000Z',
      };

      const result = PromotionRequestWithValidationSchema.safeParse(request);
      expect(result.success).toBe(true);
    });
  });

  describe('PromotionDecision', () => {
    const validDecision = {
      decisionId: 'c'.repeat(64),
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      candidateId: 'a'.repeat(64),
      decision: 'PROMOTE' as const,
      reason: 'All policy conditions satisfied',
      policyId: 'default',
      policyVersion: '1.0.0',
      authorityType: 'HUMAN_OPERATOR' as const,
      authorityId: 'user:jane@example.com',
      decisionHash: 'd'.repeat(64),
      decidedAt: '2026-01-16T10:30:01.000Z',
    };

    it('should accept valid decision', () => {
      const result = PromotionDecisionSchema.safeParse(validDecision);
      expect(result.success).toBe(true);
    });

    it('should reject invalid decision type', () => {
      const decision = { ...validDecision, decision: 'INVALID' };
      const result = PromotionDecisionSchema.safeParse(decision);
      expect(result.success).toBe(false);
    });

    it('should reject invalid decisionId length', () => {
      const decision = { ...validDecision, decisionId: 'too-short' };
      const result = PromotionDecisionSchema.safeParse(decision);
      expect(result.success).toBe(false);
    });

    it('should accept optional justification', () => {
      const decision = { ...validDecision, justification: 'Emergency override' };
      const result = PromotionDecisionSchema.safeParse(decision);
      expect(result.success).toBe(true);
    });

    it('should accept optional sessionId', () => {
      const decision = { ...validDecision, sessionId: 'session-123' };
      const result = PromotionDecisionSchema.safeParse(decision);
      expect(result.success).toBe(true);
    });
  });

  describe('PromotionAuditRecord', () => {
    const validAuditRecord = {
      auditId: '550e8400-e29b-41d4-a716-446655440001',
      decisionId: 'c'.repeat(64),
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      candidateId: 'a'.repeat(64),
      decision: 'PROMOTE' as const,
      reason: 'All policy conditions satisfied',
      policySnapshot: '{"id":"default","version":"1.0.0"}',
      inputSnapshot: '{"candidateId":"test","severity":"SEV2"}',
      authorityContext: {
        authorityType: 'HUMAN_OPERATOR' as const,
        authorityId: 'user:jane@example.com',
        timestamp: '2026-01-16T10:30:00.000Z',
      },
      createdAt: '2026-01-16T10:30:02.000Z',
    };

    it('should accept valid audit record', () => {
      const result = PromotionAuditRecordSchema.safeParse(validAuditRecord);
      expect(result.success).toBe(true);
    });

    it('should reject invalid auditId', () => {
      const record = { ...validAuditRecord, auditId: 'not-a-uuid' };
      const result = PromotionAuditRecordSchema.safeParse(record);
      expect(result.success).toBe(false);
    });

    it('should require policySnapshot', () => {
      const record = { ...validAuditRecord, policySnapshot: '' };
      const result = PromotionAuditRecordSchema.safeParse(record);
      expect(result.success).toBe(false);
    });

    it('should require inputSnapshot', () => {
      const record = { ...validAuditRecord, inputSnapshot: '' };
      const result = PromotionAuditRecordSchema.safeParse(record);
      expect(result.success).toBe(false);
    });
  });

  describe('computeDecisionId', () => {
    it('should produce deterministic 64-character hash', () => {
      const candidateId = 'a'.repeat(64);
      const policyId = 'default';
      const policyVersion = '1.0.0';
      const requestContextHash = 'b'.repeat(64);

      const decisionId1 = computeDecisionId(candidateId, policyId, policyVersion, requestContextHash);
      const decisionId2 = computeDecisionId(candidateId, policyId, policyVersion, requestContextHash);

      expect(decisionId1).toBe(decisionId2);
      expect(decisionId1).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/.test(decisionId1)).toBe(true);
    });

    it('should produce different hashes for different inputs', () => {
      const candidateId = 'a'.repeat(64);
      const policyId = 'default';
      const policyVersion = '1.0.0';
      const requestContextHash1 = 'b'.repeat(64);
      const requestContextHash2 = 'c'.repeat(64);

      const decisionId1 = computeDecisionId(candidateId, policyId, policyVersion, requestContextHash1);
      const decisionId2 = computeDecisionId(candidateId, policyId, policyVersion, requestContextHash2);

      expect(decisionId1).not.toBe(decisionId2);
    });

    it('should not include authorityId in hash (CORRECTION 1)', () => {
      // Same inputs should produce same hash regardless of who requests it
      const candidateId = 'a'.repeat(64);
      const policyId = 'default';
      const policyVersion = '1.0.0';
      const requestContextHash = 'b'.repeat(64);

      const decisionId1 = computeDecisionId(candidateId, policyId, policyVersion, requestContextHash);
      const decisionId2 = computeDecisionId(candidateId, policyId, policyVersion, requestContextHash);

      // Different authorities should produce same decisionId
      expect(decisionId1).toBe(decisionId2);
    });
  });

  describe('computeDecisionHash', () => {
    it('should produce deterministic 64-character hash', () => {
      const decision = 'PROMOTE';
      const reason = 'All conditions met';
      const policyVersion = '1.0.0';
      const candidateId = 'a'.repeat(64);

      const hash1 = computeDecisionHash(decision, reason, policyVersion, candidateId);
      const hash2 = computeDecisionHash(decision, reason, policyVersion, candidateId);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/.test(hash1)).toBe(true);
    });

    it('should produce different hashes for different decisions', () => {
      const reason = 'Test reason';
      const policyVersion = '1.0.0';
      const candidateId = 'a'.repeat(64);

      const promoteHash = computeDecisionHash('PROMOTE', reason, policyVersion, candidateId);
      const rejectHash = computeDecisionHash('REJECT', reason, policyVersion, candidateId);

      expect(promoteHash).not.toBe(rejectHash);
    });
  });

  describe('PROMOTION_VERSION', () => {
    it('should be defined', () => {
      expect(PROMOTION_VERSION).toBeDefined();
      expect(typeof PROMOTION_VERSION).toBe('string');
    });
  });
});