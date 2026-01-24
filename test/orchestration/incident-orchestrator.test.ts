/**
 * Phase 2.3: Incident Orchestrator Tests
 * 
 * Comprehensive test coverage for the orchestration layer.
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

// === TEST HELPERS ===

function createMockCandidate(overrides?: Partial<IncidentCandidate>): IncidentCandidate {
  return {
    candidateId: 'a'.repeat(64),
    candidateVersion: 'v1',
    correlationKey: 'b'.repeat(64),
    correlationRule: 'rule-001',
    correlationRuleVersion: '1.0.0',
    policyId: 'policy-default',
    policyVersion: '1.0.0',
    evidenceGraphIds: ['graph-1'],
    detectionIds: ['detection-1'],
    primaryDetectionId: 'detection-1',
    suggestedSeverity: 'SEV2',
    suggestedService: 'test-service',
    suggestedTitle: 'Test incident',
    confidence: 'HIGH',
    confidenceFactors: [],
    blastRadius: {
      scope: 'SINGLE_SERVICE',
      affectedServices: ['test-service'],
      affectedResources: [],
      estimatedImpact: 'MEDIUM',
    },
    generationTrace: [],
    windowStart: '2026-01-19T00:00:00Z',
    windowEnd: '2026-01-19T00:05:00Z',
    createdAt: '2026-01-19T00:05:00Z',
    ...overrides,
  };
}

function createMockPromotionDecision(
  decision: 'PROMOTE' | 'REJECT' | 'DEFER',
  overrides?: Partial<PromotionDecision>
): PromotionDecision {
  return {
    decisionId: 'c'.repeat(64),
    requestId: 'd1234567-89ab-cdef-0123-456789abcdef',
    candidateId: 'a'.repeat(64),
    decision,
    reason: `Decision: ${decision}`,
    policyId: 'policy-default',
    policyVersion: '1.0.0',
    authorityType: 'AUTO_ENGINE',
    authorityId: 'opx-candidate-processor',
    decisionHash: 'e'.repeat(64),
    decidedAt: '2026-01-19T00:05:00Z',
    ...overrides,
  };
}

function createMockIncident(overrides?: Partial<Incident>): Incident {
  return {
    incidentId: 'f'.repeat(64),
    decisionId: 'c'.repeat(64),
    candidateId: 'a'.repeat(64),
    severity: 'SEV2',
    service: 'test-service',
    title: 'Test incident',
    status: 'PENDING',
    createdAt: '2026-01-19T00:05:00Z',
    detectionCount: 1,
    evidenceGraphCount: 1,
    blastRadiusScope: 'SINGLE_SERVICE',
    incidentVersion: 1,
    ...overrides,
  };
}


// === TESTS ===

describe('IncidentOrchestrator', () => {
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

  describe('Happy Path', () => {
    it('should process PROMOTE decision and create incident', async () => {
      const candidate = createMockCandidate();
      const decision = createMockPromotionDecision('PROMOTE');
      const incident = createMockIncident();

      vi.mocked(mockCandidateStore.get).mockResolvedValue(candidate);
      vi.mocked(mockPromotionEngine.processPromotionRequest).mockResolvedValue(decision);
      vi.mocked(mockIncidentManager.createIncidentFromPromotion).mockResolvedValue(incident);

      const result = await orchestrator.processCandidate(
        candidate.candidateId,
        { authorityType: 'AUTO_ENGINE', authorityId: 'opx-candidate-processor' },
        '2026-01-19T00:05:00Z'
      );

      expect(result).toEqual({
        success: true,
        decision: 'PROMOTE',
        incidentId: incident.incidentId,
        decisionId: decision.decisionId,
        reason: decision.reason,
      });

      expect(mockPromotionEngine.processPromotionRequest).toHaveBeenCalledTimes(1);
      expect(mockIncidentManager.createIncidentFromPromotion).toHaveBeenCalledTimes(1);
    });
  });
});
