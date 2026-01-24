/**
 * CP-6: Promotion Engine Tests
 * 
 * Tests for promotion orchestration with all invariants.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromotionEngine } from '../../src/promotion/promotion-engine.js';
import { PromotionRequest, computeRequestContextHash } from '../../src/promotion/promotion.schema.js';
import { IncidentCandidate, CANDIDATE_VERSION } from '../../src/candidate/candidate.schema.js';
import { CandidateStore } from '../../src/candidate/candidate-store.js';
import { PolicyLoader } from '../../src/promotion/policy-loader.js';
import { PromotionStore } from '../../src/promotion/promotion-store.js';
import { AuditEmitter } from '../../src/promotion/audit-emitter.js';
import { DEFAULT_POLICY } from '../../src/promotion/policy.schema.js';

describe('CP-6: Promotion Engine', () => {
  let mockCandidateStore: Partial<CandidateStore>;
  let mockPolicyLoader: Partial<PolicyLoader>;
  let mockPromotionStore: Partial<PromotionStore>;
  let mockAuditEmitter: Partial<AuditEmitter>;
  let engine: PromotionEngine;

  const createCandidate = (overrides: Partial<IncidentCandidate> = {}): IncidentCandidate => ({
    candidateId: 'c'.repeat(64),
    candidateVersion: CANDIDATE_VERSION,
    correlationKey: 'k'.repeat(64),
    correlationRule: 'service-cascade',
    correlationRuleVersion: '1.0.0',
    evidenceGraphIds: ['g'.repeat(64)],
    detectionIds: ['det-001'],
    primaryDetectionId: 'det-001',
    suggestedSeverity: 'SEV2',
    suggestedService: 'lambda',
    suggestedTitle: 'Test Candidate',
    confidence: 'HIGH',
    confidenceFactors: [{ factor: 'base', weight: 0.5, evidence: 'rule match' }],
    blastRadius: {
      scope: 'SINGLE_SERVICE',
      affectedServices: ['lambda'],
      affectedResources: [],
      estimatedImpact: 'MEDIUM',
    },
    generationTrace: [],
    windowStart: '2026-01-16T10:00:00.000Z',
    windowEnd: '2026-01-16T10:30:00.000Z',
    createdAt: '2026-01-16T10:30:00.000Z',
    ...overrides,
  });

  const createRequest = (overrides: Partial<PromotionRequest> = {}): PromotionRequest => {
    const candidateId = overrides.candidateId || 'c'.repeat(64);
    const policyId = overrides.policyId || 'default';
    const policyVersion = overrides.policyVersion || '1.0.0';
    const requestContextHash = overrides.requestContextHash || 
      computeRequestContextHash(candidateId, policyId, policyVersion);
    
    return {
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      candidateId,
      policyId,
      policyVersion,
      authorityType: 'HUMAN_OPERATOR',
      authorityId: 'user:test@example.com',
      requestContextHash,
      requestedAt: '2026-01-16T10:35:00.000Z',
      ...overrides,
    };
  };

  beforeEach(() => {
    mockCandidateStore = {
      get: vi.fn(),
    };
    mockPolicyLoader = {
      loadPolicy: vi.fn(),
    };
    mockPromotionStore = {
      storeDecision: vi.fn(),
      isAlreadyPromoted: vi.fn(),
      getRecentPromotions: vi.fn(),
    };
    mockAuditEmitter = {
      emitDecisionAudit: vi.fn(),
    };

    engine = new PromotionEngine({
      candidateStore: mockCandidateStore as CandidateStore,
      policyLoader: mockPolicyLoader as PolicyLoader,
      promotionStore: mockPromotionStore as PromotionStore,
      auditEmitter: mockAuditEmitter as AuditEmitter,
    });
  });


  describe('successful promotion', () => {
    it('should PROMOTE eligible candidate', async () => {
      const candidate = createCandidate();
      const request = createRequest({ candidateId: candidate.candidateId });

      (mockCandidateStore.get as any).mockResolvedValue(candidate);
      (mockPolicyLoader.loadPolicy as any).mockReturnValue(DEFAULT_POLICY);
      (mockPromotionStore.isAlreadyPromoted as any).mockResolvedValue(false);
      (mockPromotionStore.getRecentPromotions as any).mockResolvedValue([]);
      (mockPromotionStore.storeDecision as any).mockResolvedValue({ success: true });
      (mockAuditEmitter.emitDecisionAudit as any).mockResolvedValue({ emitted: true });

      const decision = await engine.processPromotionRequest(
        request,
        '2026-01-16T10:35:00.000Z'
      );

      expect(decision.decision).toBe('PROMOTE');
      expect(decision.candidateId).toBe(candidate.candidateId);
    });

    it('should store decision', async () => {
      const candidate = createCandidate();
      const request = createRequest({ candidateId: candidate.candidateId });

      (mockCandidateStore.get as any).mockResolvedValue(candidate);
      (mockPolicyLoader.loadPolicy as any).mockReturnValue(DEFAULT_POLICY);
      (mockPromotionStore.isAlreadyPromoted as any).mockResolvedValue(false);
      (mockPromotionStore.getRecentPromotions as any).mockResolvedValue([]);
      (mockPromotionStore.storeDecision as any).mockResolvedValue({ success: true });
      (mockAuditEmitter.emitDecisionAudit as any).mockResolvedValue({ emitted: true });

      await engine.processPromotionRequest(request, '2026-01-16T10:35:00.000Z');

      expect(mockPromotionStore.storeDecision).toHaveBeenCalled();
    });

    it('should emit audit', async () => {
      const candidate = createCandidate();
      const request = createRequest({ candidateId: candidate.candidateId });

      (mockCandidateStore.get as any).mockResolvedValue(candidate);
      (mockPolicyLoader.loadPolicy as any).mockReturnValue(DEFAULT_POLICY);
      (mockPromotionStore.isAlreadyPromoted as any).mockResolvedValue(false);
      (mockPromotionStore.getRecentPromotions as any).mockResolvedValue([]);
      (mockPromotionStore.storeDecision as any).mockResolvedValue({ success: true });
      (mockAuditEmitter.emitDecisionAudit as any).mockResolvedValue({ emitted: true });

      await engine.processPromotionRequest(request, '2026-01-16T10:35:00.000Z');

      expect(mockAuditEmitter.emitDecisionAudit).toHaveBeenCalled();
    });
  });

  describe('gate validation', () => {
    it('should REJECT invalid request', async () => {
      const request = { ...createRequest(), authorityType: 'INVALID' as any };

      await expect(
        engine.processPromotionRequest(request, '2026-01-16T10:35:00.000Z')
      ).rejects.toThrow('Gate validation failed');
    });
  });

  describe('candidate not found', () => {
    it('should REJECT when candidate not found', async () => {
      const request = createRequest();

      (mockCandidateStore.get as any).mockResolvedValue(null);

      await expect(
        engine.processPromotionRequest(request, '2026-01-16T10:35:00.000Z')
      ).rejects.toThrow('Candidate not found');
    });
  });

  describe('policy not found', () => {
    it('should REJECT when policy not found', async () => {
      const candidate = createCandidate();
      const request = createRequest({ candidateId: candidate.candidateId });

      (mockCandidateStore.get as any).mockResolvedValue(candidate);
      (mockPolicyLoader.loadPolicy as any).mockImplementation(() => {
        throw new Error('Policy not found');
      });

      await expect(
        engine.processPromotionRequest(request, '2026-01-16T10:35:00.000Z')
      ).rejects.toThrow('Policy not found');
    });
  });

  describe('🔒 INV-6.6: Audit failure must not block decision', () => {
    it('should persist decision even when audit fails', async () => {
      const candidate = createCandidate();
      const request = createRequest({ candidateId: candidate.candidateId });

      (mockCandidateStore.get as any).mockResolvedValue(candidate);
      (mockPolicyLoader.loadPolicy as any).mockReturnValue(DEFAULT_POLICY);
      (mockPromotionStore.isAlreadyPromoted as any).mockResolvedValue(false);
      (mockPromotionStore.getRecentPromotions as any).mockResolvedValue([]);
      (mockPromotionStore.storeDecision as any).mockResolvedValue({ success: true });
      (mockAuditEmitter.emitDecisionAudit as any).mockResolvedValue({ emitted: false, error: 'Audit failed' });

      const decision = await engine.processPromotionRequest(
        request,
        '2026-01-16T10:35:00.000Z'
      );

      // Decision should still succeed
      expect(decision.decision).toBe('PROMOTE');
      expect(mockPromotionStore.storeDecision).toHaveBeenCalled();
    });
  });

  describe('🔒 CORRECTION 1: decisionId excludes authorityId', () => {
    it('should produce same decisionId for different authorities', async () => {
      const candidate = createCandidate();
      const request1 = createRequest({
        candidateId: candidate.candidateId,
        authorityId: 'user:alice@example.com',
      });
      const request2 = createRequest({
        candidateId: candidate.candidateId,
        authorityId: 'user:bob@example.com',
      });

      (mockCandidateStore.get as any).mockResolvedValue(candidate);
      (mockPolicyLoader.loadPolicy as any).mockReturnValue(DEFAULT_POLICY);
      (mockPromotionStore.isAlreadyPromoted as any).mockResolvedValue(false);
      (mockPromotionStore.getRecentPromotions as any).mockResolvedValue([]);
      (mockPromotionStore.storeDecision as any).mockResolvedValue({ success: true });
      (mockAuditEmitter.emitDecisionAudit as any).mockResolvedValue({ emitted: true });

      const decision1 = await engine.processPromotionRequest(
        request1,
        '2026-01-16T10:35:00.000Z'
      );
      const decision2 = await engine.processPromotionRequest(
        request2,
        '2026-01-16T10:35:00.000Z'
      );

      // Same decisionId despite different authorityId
      expect(decision1.decisionId).toBe(decision2.decisionId);
    });
  });

  describe('🔒 INV-6.4: Deterministic outcome', () => {
    it('should produce same decision for same inputs', async () => {
      const candidate = createCandidate();
      const request = createRequest({ candidateId: candidate.candidateId });
      const currentTime = '2026-01-16T10:35:00.000Z';

      (mockCandidateStore.get as any).mockResolvedValue(candidate);
      (mockPolicyLoader.loadPolicy as any).mockReturnValue(DEFAULT_POLICY);
      (mockPromotionStore.isAlreadyPromoted as any).mockResolvedValue(false);
      (mockPromotionStore.getRecentPromotions as any).mockResolvedValue([]);
      (mockPromotionStore.storeDecision as any).mockResolvedValue({ success: true });
      (mockAuditEmitter.emitDecisionAudit as any).mockResolvedValue({ emitted: true });

      const decision1 = await engine.processPromotionRequest(request, currentTime);
      const decision2 = await engine.processPromotionRequest(request, currentTime);

      expect(decision1.decisionId).toBe(decision2.decisionId);
      expect(decision1.decision).toBe(decision2.decision);
      expect(decision1.decisionHash).toBe(decision2.decisionHash);
    });

    it('should use injected currentTime for decidedAt', async () => {
      const candidate = createCandidate();
      const request = createRequest({ candidateId: candidate.candidateId });
      const currentTime = '2026-01-16T10:35:00.000Z';

      (mockCandidateStore.get as any).mockResolvedValue(candidate);
      (mockPolicyLoader.loadPolicy as any).mockReturnValue(DEFAULT_POLICY);
      (mockPromotionStore.isAlreadyPromoted as any).mockResolvedValue(false);
      (mockPromotionStore.getRecentPromotions as any).mockResolvedValue([]);
      (mockPromotionStore.storeDecision as any).mockResolvedValue({ success: true });
      (mockAuditEmitter.emitDecisionAudit as any).mockResolvedValue({ emitted: true });

      const decision = await engine.processPromotionRequest(request, currentTime);

      expect(decision.decidedAt).toBe(currentTime);
    });
  });

  describe('idempotency', () => {
    it('should return existing decision if already stored', async () => {
      const candidate = createCandidate();
      const request = createRequest({ candidateId: candidate.candidateId });

      (mockCandidateStore.get as any).mockResolvedValue(candidate);
      (mockPolicyLoader.loadPolicy as any).mockReturnValue(DEFAULT_POLICY);
      (mockPromotionStore.isAlreadyPromoted as any).mockResolvedValue(false);
      (mockPromotionStore.getRecentPromotions as any).mockResolvedValue([]);
      (mockPromotionStore.storeDecision as any).mockResolvedValue({ alreadyExists: true });
      (mockAuditEmitter.emitDecisionAudit as any).mockResolvedValue({ emitted: true });

      const decision = await engine.processPromotionRequest(
        request,
        '2026-01-16T10:35:00.000Z'
      );

      // Should still return valid decision
      expect(decision.decision).toBe('PROMOTE');
    });
  });
});
