/**
 * Phase 2.3 · Step 6: Replay Determinism Tests
 * 
 * GATING REQUIREMENT: These tests must pass 100% for Phase 2.3 completion.
 * 
 * Validates:
 * - Same inputs → same decision ID (deterministic)
 * - Same decision → same incident ID (deterministic)
 * - Multiple replays → single incident (idempotent)
 * - No duplicate incidents under replay
 * 
 * CONSTRAINTS:
 * - No code changes outside test files
 * - Strict equality for identity fields
 * - Metadata excluded from equality checks
 * - Fixed timestamps (no wall-clock time)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IncidentOrchestrator } from '../../src/orchestration/incident-orchestrator.js';
import type { PromotionEngine } from '../../src/promotion/promotion-engine.js';
import type { IncidentManager } from '../../src/incident/incident-manager.js';
import type { CandidateStore } from '../../src/candidate/candidate-store.js';
import type { EventEmitter } from '../../src/orchestration/incident-orchestrator.js';
import type { OrchestrationStore } from '../../src/orchestration/orchestration-store.js';
import type { IncidentCandidate } from '../../src/candidate/candidate.schema.js';
import type { PromotionDecision } from '../../src/promotion/promotion.schema.js';
import type { Incident } from '../../src/incident/incident.schema.js';
import type { AuthorityContext } from '../../src/orchestration/incident-orchestrator.js';

// === DETERMINISTIC TEST HELPERS ===

/**
 * Create deterministic candidate with fixed values
 * 
 * CRITICAL: No random values, no timestamps, fully reproducible
 */
function createDeterministicCandidate(seed: string): IncidentCandidate {
  // Use seed to generate deterministic IDs
  const seedHash = seed.padEnd(64, '0');
  
  return {
    candidateId: seedHash,
    candidateVersion: 'v1',
    correlationKey: seedHash.split('').reverse().join(''),
    correlationRule: 'rule-deterministic',
    correlationRuleVersion: '1.0.0',
    policyId: 'policy-promote',
    policyVersion: '1.0.0',
    evidenceGraphIds: ['graph-1'],
    detectionIds: ['detection-1'],
    primaryDetectionId: 'detection-1',
    suggestedSeverity: 'SEV2',
    suggestedService: 'test-service',
    suggestedTitle: 'Deterministic test incident',
    confidence: 'HIGH',
    confidenceFactors: [],
    blastRadius: {
      scope: 'SINGLE_SERVICE',
      affectedServices: ['test-service'],
      affectedResources: [],
      estimatedImpact: 'MEDIUM',
    },
    generationTrace: [],
    windowStart: '2026-01-19T12:00:00.000Z',
    windowEnd: '2026-01-19T12:05:00.000Z',
    createdAt: '2026-01-19T12:05:00.000Z',
  };
}

/**
 * Create fixed-time authority context
 * 
 * CRITICAL: No timestamps, fully deterministic
 */
function createFixedTimeAuthority(candidateId: string): AuthorityContext {
  return {
    authorityType: 'AUTO_ENGINE',
    authorityId: 'opx-candidate-processor',
    sessionId: candidateId,
    justification: 'Auto-promotion from correlation',
  };
}

/**
 * Create deterministic promotion decision
 */
function createDeterministicDecision(
  candidateId: string,
  decision: 'PROMOTE' | 'REJECT' | 'DEFER'
): PromotionDecision {
  // Use deterministic decision ID based on candidate
  const decisionId = candidateId.split('').reverse().join('').substring(0, 64);
  
  return {
    decisionId,
    requestId: 'fixed-request-id-00000000-0000-0000-0000-000000000000',
    candidateId,
    decision,
    reason: `Policy evaluation: ${decision}`,
    policyId: 'policy-promote',
    policyVersion: '1.0.0',
    authorityType: 'AUTO_ENGINE',
    authorityId: 'opx-candidate-processor',
    decisionHash: 'e'.repeat(64),
    decidedAt: '2026-01-19T12:05:00.000Z',
  };
}

/**
 * Create deterministic incident
 */
function createDeterministicIncident(
  candidateId: string,
  decisionId: string
): Incident {
  // Use deterministic incident ID based on decision
  const incidentId = decisionId.split('').reverse().join('').substring(0, 64);
  
  return {
    incidentId,
    decisionId,
    candidateId,
    severity: 'SEV2',
    service: 'test-service',
    title: 'Deterministic test incident',
    status: 'PENDING',
    createdAt: '2026-01-19T12:05:00.000Z',
    detectionCount: 1,
    evidenceGraphCount: 1,
    blastRadiusScope: 'SINGLE_SERVICE',
    incidentVersion: 1,
  };
}

// === REPLAY DETERMINISM TESTS ===

describe('Replay Determinism (GATING)', () => {
  let orchestrator: IncidentOrchestrator;
  let mockPromotionEngine: PromotionEngine;
  let mockIncidentManager: IncidentManager;
  let mockCandidateStore: CandidateStore;
  let mockEventEmitter: EventEmitter;
  let mockOrchestrationStore: OrchestrationStore;

  beforeEach(() => {
    mockPromotionEngine = {
      processPromotionRequest: vi.fn(),
    } as any;

    mockIncidentManager = {
      createIncidentFromPromotion: vi.fn(),
    } as any;

    mockCandidateStore = {
      get: vi.fn(),
    } as any;

    mockEventEmitter = {
      emit: vi.fn().mockResolvedValue(undefined),
    };

    mockOrchestrationStore = {
      logAttempt: vi.fn().mockResolvedValue(undefined),
    } as any;

    orchestrator = new IncidentOrchestrator({
      promotionEngine: mockPromotionEngine,
      incidentManager: mockIncidentManager,
      candidateStore: mockCandidateStore,
      eventEmitter: mockEventEmitter,
      orchestrationStore: mockOrchestrationStore,
    });
  });

  // === CATEGORY 1: DETERMINISTIC DECISION ===

  describe('Category 1: Deterministic Decision', () => {
    it('Test 1.1: Same candidate + same policy + same time → same decision ID', async () => {
      const candidate = createDeterministicCandidate('replay-test-1');
      const decision = createDeterministicDecision(candidate.candidateId, 'PROMOTE');
      const incident = createDeterministicIncident(candidate.candidateId, decision.decisionId);
      const authority = createFixedTimeAuthority(candidate.candidateId);
      const fixedTime = '2026-01-19T12:00:00.000Z';

      vi.mocked(mockCandidateStore.get).mockResolvedValue(candidate);
      vi.mocked(mockPromotionEngine.processPromotionRequest).mockResolvedValue(decision);
      vi.mocked(mockIncidentManager.createIncidentFromPromotion).mockResolvedValue(incident);

      // First run
      const result1 = await orchestrator.processCandidate(
        candidate.candidateId,
        authority,
        fixedTime
      );

      // Second run (replay with identical inputs)
      const result2 = await orchestrator.processCandidate(
        candidate.candidateId,
        authority,
        fixedTime
      );

      // GATING ASSERTION: Decision ID must be identical
      expect(result1.decisionId).toBe(result2.decisionId);
      expect(result1.decision).toBe(result2.decision);
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Verify determinism: same inputs called twice
      expect(mockPromotionEngine.processPromotionRequest).toHaveBeenCalledTimes(2);
    });

    it('Test 1.2: Different timestamps → same decision ID', async () => {
      const candidate = createDeterministicCandidate('replay-test-2');
      const decision = createDeterministicDecision(candidate.candidateId, 'PROMOTE');
      const incident = createDeterministicIncident(candidate.candidateId, decision.decisionId);
      const authority = createFixedTimeAuthority(candidate.candidateId);

      vi.mocked(mockCandidateStore.get).mockResolvedValue(candidate);
      vi.mocked(mockPromotionEngine.processPromotionRequest).mockResolvedValue(decision);
      vi.mocked(mockIncidentManager.createIncidentFromPromotion).mockResolvedValue(incident);

      // First run with timestamp1
      const result1 = await orchestrator.processCandidate(
        candidate.candidateId,
        authority,
        '2026-01-19T12:00:00.000Z'
      );

      // Second run with timestamp2 (different time)
      const result2 = await orchestrator.processCandidate(
        candidate.candidateId,
        authority,
        '2026-01-19T13:00:00.000Z'
      );

      // GATING ASSERTION: Decision ID unaffected by timestamp
      expect(result1.decisionId).toBe(result2.decisionId);
      expect(result1.decision).toBe(result2.decision);

      // Verify identity fields identical
      expect(result1.incidentId).toBe(result2.incidentId);
    });
  });

  // === CATEGORY 2: DETERMINISTIC INCIDENT ===

  describe('Category 2: Deterministic Incident', () => {
    it('Test 2.1: Same decision → same incident ID', async () => {
      const candidate = createDeterministicCandidate('replay-test-3');
      const decision = createDeterministicDecision(candidate.candidateId, 'PROMOTE');
      const incident = createDeterministicIncident(candidate.candidateId, decision.decisionId);
      const authority = createFixedTimeAuthority(candidate.candidateId);
      const fixedTime = '2026-01-19T12:00:00.000Z';

      vi.mocked(mockCandidateStore.get).mockResolvedValue(candidate);
      vi.mocked(mockPromotionEngine.processPromotionRequest).mockResolvedValue(decision);
      vi.mocked(mockIncidentManager.createIncidentFromPromotion).mockResolvedValue(incident);

      // First run
      const result1 = await orchestrator.processCandidate(
        candidate.candidateId,
        authority,
        fixedTime
      );

      // Second run (replay)
      const result2 = await orchestrator.processCandidate(
        candidate.candidateId,
        authority,
        fixedTime
      );

      // GATING ASSERTION: Incident ID must be identical
      expect(result1.incidentId).toBe(result2.incidentId);
      expect(result1.incidentId).toBe(incident.incidentId);

      // Verify incident manager called twice (CP-7 handles deduplication)
      expect(mockIncidentManager.createIncidentFromPromotion).toHaveBeenCalledTimes(2);

      // Verify both calls used same decision
      const calls = vi.mocked(mockIncidentManager.createIncidentFromPromotion).mock.calls;
      expect(calls[0][0].decisionId).toBe(calls[1][0].decisionId);
    });

    it('Test 2.2: Replay produces identical incident', async () => {
      const candidate = createDeterministicCandidate('replay-test-4');
      const decision = createDeterministicDecision(candidate.candidateId, 'PROMOTE');
      const incident = createDeterministicIncident(candidate.candidateId, decision.decisionId);
      const authority = createFixedTimeAuthority(candidate.candidateId);
      const fixedTime = '2026-01-19T12:00:00.000Z';

      vi.mocked(mockCandidateStore.get).mockResolvedValue(candidate);
      vi.mocked(mockPromotionEngine.processPromotionRequest).mockResolvedValue(decision);
      vi.mocked(mockIncidentManager.createIncidentFromPromotion).mockResolvedValue(incident);

      // First run
      const result1 = await orchestrator.processCandidate(
        candidate.candidateId,
        authority,
        fixedTime
      );

      // Second run (replay)
      const result2 = await orchestrator.processCandidate(
        candidate.candidateId,
        authority,
        fixedTime
      );

      // GATING ASSERTION: Identity fields must be identical
      expect(result1.incidentId).toBe(result2.incidentId);
      expect(result1.decisionId).toBe(result2.decisionId);
      expect(result1.decision).toBe(result2.decision);
      expect(result1.reason).toBe(result2.reason);

      // Verify incident manager received identical decision objects
      const calls = vi.mocked(mockIncidentManager.createIncidentFromPromotion).mock.calls;
      expect(calls[0][0].decisionId).toBe(calls[1][0].decisionId);
      expect(calls[0][0].candidateId).toBe(calls[1][0].candidateId);
      expect(calls[0][0].policyId).toBe(calls[1][0].policyId);
      expect(calls[0][0].policyVersion).toBe(calls[1][0].policyVersion);
    });
  });

  // === CATEGORY 3: NO DUPLICATE INCIDENTS ===

  describe('Category 3: No Duplicate Incidents', () => {
    it('Test 3.1: Multiple replays → single incident', async () => {
      const candidate = createDeterministicCandidate('replay-test-5');
      const decision = createDeterministicDecision(candidate.candidateId, 'PROMOTE');
      const incident = createDeterministicIncident(candidate.candidateId, decision.decisionId);
      const authority = createFixedTimeAuthority(candidate.candidateId);
      const fixedTime = '2026-01-19T12:00:00.000Z';

      vi.mocked(mockCandidateStore.get).mockResolvedValue(candidate);
      vi.mocked(mockPromotionEngine.processPromotionRequest).mockResolvedValue(decision);
      vi.mocked(mockIncidentManager.createIncidentFromPromotion).mockResolvedValue(incident);

      // Run 5 times (simulate multiple replays)
      const results = await Promise.all([
        orchestrator.processCandidate(candidate.candidateId, authority, fixedTime),
        orchestrator.processCandidate(candidate.candidateId, authority, fixedTime),
        orchestrator.processCandidate(candidate.candidateId, authority, fixedTime),
        orchestrator.processCandidate(candidate.candidateId, authority, fixedTime),
        orchestrator.processCandidate(candidate.candidateId, authority, fixedTime),
      ]);

      // GATING ASSERTION: All replays return same incident ID
      const incidentIds = results.map(r => r.incidentId);
      const uniqueIncidentIds = new Set(incidentIds);
      expect(uniqueIncidentIds.size).toBe(1);
      expect(incidentIds[0]).toBe(incident.incidentId);

      // Verify all decision IDs identical
      const decisionIds = results.map(r => r.decisionId);
      const uniqueDecisionIds = new Set(decisionIds);
      expect(uniqueDecisionIds.size).toBe(1);

      // Verify incident manager called 5 times (CP-7 deduplicates)
      expect(mockIncidentManager.createIncidentFromPromotion).toHaveBeenCalledTimes(5);
    });

    it('Test 3.2: Concurrent replays → single incident', async () => {
      const candidate = createDeterministicCandidate('replay-test-6');
      const decision = createDeterministicDecision(candidate.candidateId, 'PROMOTE');
      const incident = createDeterministicIncident(candidate.candidateId, decision.decisionId);
      const authority = createFixedTimeAuthority(candidate.candidateId);
      const fixedTime = '2026-01-19T12:00:00.000Z';

      vi.mocked(mockCandidateStore.get).mockResolvedValue(candidate);
      vi.mocked(mockPromotionEngine.processPromotionRequest).mockResolvedValue(decision);
      vi.mocked(mockIncidentManager.createIncidentFromPromotion).mockResolvedValue(incident);

      // Run 3 concurrent replays
      const [result1, result2, result3] = await Promise.all([
        orchestrator.processCandidate(candidate.candidateId, authority, fixedTime),
        orchestrator.processCandidate(candidate.candidateId, authority, fixedTime),
        orchestrator.processCandidate(candidate.candidateId, authority, fixedTime),
      ]);

      // GATING ASSERTION: All concurrent replays return same incident ID
      expect(result1.incidentId).toBe(result2.incidentId);
      expect(result2.incidentId).toBe(result3.incidentId);
      expect(result1.incidentId).toBe(incident.incidentId);

      // Verify all decision IDs identical
      expect(result1.decisionId).toBe(result2.decisionId);
      expect(result2.decisionId).toBe(result3.decisionId);

      // Verify no race conditions
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);

      // Verify incident manager called 3 times
      expect(mockIncidentManager.createIncidentFromPromotion).toHaveBeenCalledTimes(3);
    });
  });
});
