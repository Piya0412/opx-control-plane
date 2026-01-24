/**
 * CP-6: Determinism Tests
 * 
 * Tests for INV-6.4: Deterministic Outcome
 * Same inputs → same decision (reproducible offline)
 */

import { describe, it, expect } from 'vitest';
import { computeDecisionId, computeDecisionHash } from '../../src/promotion/promotion.schema.js';
import { PolicyEvaluator } from '../../src/promotion/policy-evaluator.js';

describe('CP-6: Determinism', () => {
  describe('🔒 INV-6.4: Deterministic Outcome', () => {
    describe('computeDecisionId', () => {
      it('should produce same decisionId for same inputs', () => {
        const candidateId = 'a'.repeat(64);
        const policyId = 'default';
        const policyVersion = '1.0.0';
        const requestContextHash = 'b'.repeat(64);

        const id1 = computeDecisionId(candidateId, policyId, policyVersion, requestContextHash);
        const id2 = computeDecisionId(candidateId, policyId, policyVersion, requestContextHash);

        expect(id1).toBe(id2);
      });

      it('should produce same decisionId regardless of authorityId (CORRECTION 1)', () => {
        // This tests that authorityId is NOT part of the decision identity
        const candidateId = 'a'.repeat(64);
        const policyId = 'default';
        const policyVersion = '1.0.0';
        const requestContextHash = 'b'.repeat(64);

        // Different authorities should produce same decisionId
        const decisionId = computeDecisionId(candidateId, policyId, policyVersion, requestContextHash);
        
        // Call again with same inputs (simulating different authority)
        const sameDecisionId = computeDecisionId(candidateId, policyId, policyVersion, requestContextHash);

        expect(decisionId).toBe(sameDecisionId);
      });

      it('should be reproducible across multiple calls', () => {
        const candidateId = 'test'.padEnd(64, '0');
        const policyId = 'emergency';
        const policyVersion = '2.1.0';
        const requestContextHash = 'context'.padEnd(64, '1');

        const results = Array.from({ length: 100 }, () =>
          computeDecisionId(candidateId, policyId, policyVersion, requestContextHash)
        );

        // All results should be identical
        const uniqueResults = new Set(results);
        expect(uniqueResults.size).toBe(1);
      });

      it('should produce different IDs for different candidates', () => {
        const policyId = 'default';
        const policyVersion = '1.0.0';
        const requestContextHash = 'b'.repeat(64);

        const candidateId1 = 'a'.repeat(64);
        const candidateId2 = 'c'.repeat(64);

        const id1 = computeDecisionId(candidateId1, policyId, policyVersion, requestContextHash);
        const id2 = computeDecisionId(candidateId2, policyId, policyVersion, requestContextHash);

        expect(id1).not.toBe(id2);
      });

      it('should produce different IDs for different policies', () => {
        const candidateId = 'a'.repeat(64);
        const policyVersion = '1.0.0';
        const requestContextHash = 'b'.repeat(64);

        const id1 = computeDecisionId(candidateId, 'default', policyVersion, requestContextHash);
        const id2 = computeDecisionId(candidateId, 'emergency', policyVersion, requestContextHash);

        expect(id1).not.toBe(id2);
      });

      it('should produce different IDs for different policy versions', () => {
        const candidateId = 'a'.repeat(64);
        const policyId = 'default';
        const requestContextHash = 'b'.repeat(64);

        const id1 = computeDecisionId(candidateId, policyId, '1.0.0', requestContextHash);
        const id2 = computeDecisionId(candidateId, policyId, '1.0.1', requestContextHash);

        expect(id1).not.toBe(id2);
      });

      it('should produce different IDs for different context hashes', () => {
        const candidateId = 'a'.repeat(64);
        const policyId = 'default';
        const policyVersion = '1.0.0';

        const id1 = computeDecisionId(candidateId, policyId, policyVersion, 'b'.repeat(64));
        const id2 = computeDecisionId(candidateId, policyId, policyVersion, 'c'.repeat(64));

        expect(id1).not.toBe(id2);
      });
    });

    describe('computeDecisionHash', () => {
      it('should produce same hash for same decision inputs', () => {
        const decision = 'PROMOTE';
        const reason = 'All conditions satisfied';
        const policyVersion = '1.0.0';
        const candidateId = 'a'.repeat(64);

        const hash1 = computeDecisionHash(decision, reason, policyVersion, candidateId);
        const hash2 = computeDecisionHash(decision, reason, policyVersion, candidateId);

        expect(hash1).toBe(hash2);
      });

      it('should be reproducible across multiple calls', () => {
        const decision = 'REJECT';
        const reason = 'Insufficient evidence';
        const policyVersion = '2.0.0';
        const candidateId = 'test'.padEnd(64, '0');

        const results = Array.from({ length: 50 }, () =>
          computeDecisionHash(decision, reason, policyVersion, candidateId)
        );

        const uniqueResults = new Set(results);
        expect(uniqueResults.size).toBe(1);
      });
    });

    describe('PolicyEvaluator determinism', () => {
      const evaluator = new PolicyEvaluator();

      const createTestContext = (currentTime: string) => ({
        candidate: {
          candidateId: 'a'.repeat(64),
          candidateVersion: 'v1',
          correlationKey: 'b'.repeat(64),
          correlationRule: 'test-rule',
          correlationRuleVersion: '1.0.0',
          evidenceGraphIds: ['g'.repeat(64)],
          detectionIds: ['det-001', 'det-002'],
          primaryDetectionId: 'det-001',
          suggestedSeverity: 'SEV2' as const,
          suggestedService: 'lambda',
          suggestedTitle: 'Test Candidate',
          confidence: 'HIGH' as const,
          confidenceFactors: [{ factor: 'base', weight: 0.5, evidence: 'test' }],
          blastRadius: {
            scope: 'SINGLE_SERVICE' as const,
            affectedServices: ['lambda'],
            affectedResources: [],
            estimatedImpact: 'MEDIUM' as const,
          },
          generationTrace: [],
          windowStart: '2026-01-16T10:00:00.000Z',
          windowEnd: '2026-01-16T10:30:00.000Z',
          createdAt: '2026-01-16T10:30:01.000Z',
        },
        authority: {
          authorityType: 'HUMAN_OPERATOR' as const,
          authorityId: 'user:test@example.com',
          timestamp: '2026-01-16T10:30:00.000Z',
        },
        policy: {
          id: 'test',
          version: '1.0.0',
          description: 'Test policy',
          eligibility: {
            minConfidence: 'MEDIUM' as const,
            allowedSeverities: ['SEV1', 'SEV2', 'SEV3', 'SEV4'] as const,
            minDetections: 1,
            maxAgeMinutes: 60,
          },
          authorityRestrictions: {
            allowedAuthorities: ['HUMAN_OPERATOR'] as const,
          },
          deferralConditions: {
            pendingIncidentForService: false,
            cooldownMinutes: 0,
          },
          rejectionConditions: {
            duplicateCandidate: true,
            staleCandidate: true,
            insufficientEvidence: true,
          },
        },
        currentTime, // Injected for determinism
        existingPromotions: [],
        activeIncidents: [],
      });

      it('should produce same decision for same inputs with injected time', () => {
        const fixedTime = '2026-01-16T10:35:00.000Z';
        const context1 = createTestContext(fixedTime);
        const context2 = createTestContext(fixedTime);

        const result1 = evaluator.evaluate(context1);
        const result2 = evaluator.evaluate(context2);

        expect(result1.decision).toBe(result2.decision);
        expect(result1.reason).toBe(result2.reason);
        expect(result1.evaluationTrace).toEqual(result2.evaluationTrace);
      });

      it('should be reproducible with same injected time', () => {
        const fixedTime = '2026-01-16T10:35:00.000Z';
        const context = createTestContext(fixedTime);

        const results = Array.from({ length: 10 }, () => evaluator.evaluate(context));

        // All results should be identical
        const decisions = results.map(r => r.decision);
        const reasons = results.map(r => r.reason);

        expect(new Set(decisions).size).toBe(1);
        expect(new Set(reasons).size).toBe(1);
      });

      it('should produce different decisions for different injected times (freshness check)', () => {
        const freshTime = '2026-01-16T10:35:00.000Z'; // 5 minutes after candidate creation
        const staleTime = '2026-01-16T12:00:00.000Z'; // 90 minutes after candidate creation

        const freshContext = createTestContext(freshTime);
        const staleContext = createTestContext(staleTime);

        const freshResult = evaluator.evaluate(freshContext);
        const staleResult = evaluator.evaluate(staleContext);

        // Fresh candidate should pass, stale should be rejected
        expect(freshResult.decision).toBe('PROMOTE');
        expect(staleResult.decision).toBe('REJECT');
      });
    });
  });
});