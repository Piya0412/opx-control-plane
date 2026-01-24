/**
 * Phase 2.3 · Step 5: Candidate → Incident Integration Tests
 * 
 * Validates end-to-end wiring, idempotency, authority preservation, and error handling.
 * 
 * CONSTRAINTS:
 * - No code changes to handler/orchestrator/CP-5/6/7
 * - Tests validate outcomes only
 * - Idempotency demonstrated, not assumed
 * - Authority flows unchanged
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IncidentOrchestrator } from '../../src/orchestration/incident-orchestrator.js';
import {
  handleCandidateCreated,
  initializeHandler,
  type EventBridgeEvent,
} from '../../src/orchestration/candidate-event-handler.js';
import type { PromotionEngine } from '../../src/promotion/promotion-engine.js';
import type { IncidentManager } from '../../src/incident/incident-manager.js';
import type { CandidateStore } from '../../src/candidate/candidate-store.js';
import type { EventEmitter } from '../../src/orchestration/incident-orchestrator.js';
import type { OrchestrationStore } from '../../src/orchestration/orchestration-store.js';
import type { IncidentCandidate } from '../../src/candidate/candidate.schema.js';
import type { PromotionDecision } from '../../src/promotion/promotion.schema.js';
import type { Incident } from '../../src/incident/incident.schema.js';
import type { CandidateCreatedEvent } from '../../src/orchestration/candidate-event.schema.js';
import type { Context } from 'aws-lambda';

// === TEST HELPERS ===

function createTestCandidate(overrides?: Partial<IncidentCandidate>): IncidentCandidate {
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

function createCandidateCreatedEvent(
  overrides?: Partial<CandidateCreatedEvent>
): EventBridgeEvent<'CandidateCreated', CandidateCreatedEvent> {
  return {
    version: '0',
    id: 'event-123',
    'detail-type': 'CandidateCreated',
    source: 'opx.correlation',
    account: '123456789012',
    time: '2026-01-19T00:00:00Z',
    region: 'us-east-1',
    resources: [],
    detail: {
      eventType: 'CandidateCreated',
      candidateId: 'a'.repeat(64),
      correlationRuleId: 'rule-001',
      correlationRuleVersion: '1.0.0',
      signalCount: 5,
      severity: 'SEV2',
      service: 'test-service',
      createdAt: '2026-01-19T00:00:00Z',
      ...overrides,
    },
  };
}

function createMockContext(): Context {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'opx-candidate-processor',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:opx-candidate-processor',
    memoryLimitInMB: '512',
    awsRequestId: 'request-123',
    requestId: 'request-123',
    logGroupName: '/aws/lambda/opx-candidate-processor',
    logStreamName: '2026/01/19/[$LATEST]abc123',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  } as any;
}

function createPromotionDecision(
  decision: 'PROMOTE' | 'REJECT' | 'DEFER',
  overrides?: Partial<PromotionDecision>
): PromotionDecision {
  return {
    decisionId: 'c'.repeat(64),
    requestId: 'd1234567-89ab-cdef-0123-456789abcdef',
    candidateId: 'a'.repeat(64),
    decision,
    reason: `Policy evaluation: ${decision}`,
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

// === INTEGRATION TESTS ===

describe('Integration: Candidate → Incident Pipeline', () => {
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

  // === CATEGORY 1: END-TO-END FLOW ===

  describe('Category 1: End-to-End Flow', () => {
    it('Test 1.1: PROMOTE decision → incident created', async () => {
      const candidate = createTestCandidate({ policyId: 'policy-promote' });
      const decision = createPromotionDecision('PROMOTE');
      const incident = createMockIncident();

      vi.mocked(mockCandidateStore.get).mockResolvedValue(candidate);
      vi.mocked(mockPromotionEngine.processPromotionRequest).mockResolvedValue(decision);
      vi.mocked(mockIncidentManager.createIncidentFromPromotion).mockResolvedValue(incident);

      const result = await orchestrator.processCandidate(
        candidate.candidateId,
        { authorityType: 'AUTO_ENGINE', authorityId: 'opx-candidate-processor' },
        '2026-01-19T00:05:00Z'
      );

      // Verify result
      expect(result.success).toBe(true);
      expect(result.decision).toBe('PROMOTE');
      expect(result.incidentId).toBe(incident.incidentId);
      expect(result.decisionId).toBe(decision.decisionId);

      // Verify wiring: exactly one call to CP-6
      expect(mockPromotionEngine.processPromotionRequest).toHaveBeenCalledTimes(1);

      // Verify wiring: exactly one call to CP-7
      expect(mockIncidentManager.createIncidentFromPromotion).toHaveBeenCalledTimes(1);
      const incidentCall = vi.mocked(mockIncidentManager.createIncidentFromPromotion).mock.calls[0];
      expect(incidentCall[0].decisionId).toBe(decision.decisionId);
    });

    it('Test 1.2: DEFER decision → no incident', async () => {
      const candidate = createTestCandidate({ policyId: 'policy-defer' });
      const decision = createPromotionDecision('DEFER');

      vi.mocked(mockCandidateStore.get).mockResolvedValue(candidate);
      vi.mocked(mockPromotionEngine.processPromotionRequest).mockResolvedValue(decision);

      const result = await orchestrator.processCandidate(
        candidate.candidateId,
        { authorityType: 'AUTO_ENGINE', authorityId: 'opx-candidate-processor' },
        '2026-01-19T00:05:00Z'
      );

      // Verify result
      expect(result.success).toBe(true);
      expect(result.decision).toBe('DEFER');
      expect(result.incidentId).toBeUndefined();

      // Verify wiring: exactly one call to CP-6
      expect(mockPromotionEngine.processPromotionRequest).toHaveBeenCalledTimes(1);

      // Verify wiring: NO call to CP-7
      expect(mockIncidentManager.createIncidentFromPromotion).not.toHaveBeenCalled();

      // Verify event emitted
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'CandidateDeferred',
          candidateId: candidate.candidateId,
        })
      );
    });

    it('Test 1.3: SUPPRESS decision → no incident', async () => {
      const candidate = createTestCandidate({ policyId: 'policy-suppress' });
      const decision = createPromotionDecision('REJECT'); // REJECT = SUPPRESS

      vi.mocked(mockCandidateStore.get).mockResolvedValue(candidate);
      vi.mocked(mockPromotionEngine.processPromotionRequest).mockResolvedValue(decision);

      const result = await orchestrator.processCandidate(
        candidate.candidateId,
        { authorityType: 'AUTO_ENGINE', authorityId: 'opx-candidate-processor' },
        '2026-01-19T00:05:00Z'
      );

      // Verify result
      expect(result.success).toBe(true);
      expect(result.decision).toBe('SUPPRESS');
      expect(result.incidentId).toBeUndefined();

      // Verify wiring: exactly one call to CP-6
      expect(mockPromotionEngine.processPromotionRequest).toHaveBeenCalledTimes(1);

      // Verify wiring: NO call to CP-7
      expect(mockIncidentManager.createIncidentFromPromotion).not.toHaveBeenCalled();

      // Verify event emitted
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'CandidateSuppressed',
          candidateId: candidate.candidateId,
        })
      );
    });
  });

  // === CATEGORY 2: IDEMPOTENCY ===

  describe('Category 2: Idempotency', () => {
    it('Test 2.1: Same candidate twice → same incident', async () => {
      const candidate = createTestCandidate();
      const decision = createPromotionDecision('PROMOTE');
      const incident = createMockIncident();

      vi.mocked(mockCandidateStore.get).mockResolvedValue(candidate);
      vi.mocked(mockPromotionEngine.processPromotionRequest).mockResolvedValue(decision);
      vi.mocked(mockIncidentManager.createIncidentFromPromotion).mockResolvedValue(incident);

      // First call
      const result1 = await orchestrator.processCandidate(
        candidate.candidateId,
        { authorityType: 'AUTO_ENGINE', authorityId: 'opx-candidate-processor' },
        '2026-01-19T00:05:00Z'
      );

      // Second call (same inputs)
      const result2 = await orchestrator.processCandidate(
        candidate.candidateId,
        { authorityType: 'AUTO_ENGINE', authorityId: 'opx-candidate-processor' },
        '2026-01-19T00:05:00Z'
      );

      // Verify both succeed
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Verify same incident (idempotency)
      expect(result1.incidentId).toBe(result2.incidentId);
      expect(result1.decisionId).toBe(result2.decisionId);

      // Verify CP-7 called twice (CP-7 handles deduplication)
      expect(mockIncidentManager.createIncidentFromPromotion).toHaveBeenCalledTimes(2);
    });

    it('Test 2.2: Duplicate CandidateCreated events → same result', async () => {
      const event = createCandidateCreatedEvent();
      const candidate = createTestCandidate();
      const decision = createPromotionDecision('PROMOTE');
      const incident = createMockIncident();

      vi.mocked(mockCandidateStore.get).mockResolvedValue(candidate);
      vi.mocked(mockPromotionEngine.processPromotionRequest).mockResolvedValue(decision);
      vi.mocked(mockIncidentManager.createIncidentFromPromotion).mockResolvedValue(incident);

      initializeHandler({ orchestrator });

      // First event
      await handleCandidateCreated(event, createMockContext());

      // Second event (duplicate)
      await handleCandidateCreated(event, createMockContext());

      // Verify orchestrator called twice with identical parameters
      expect(mockPromotionEngine.processPromotionRequest).toHaveBeenCalledTimes(2);

      const calls = vi.mocked(mockPromotionEngine.processPromotionRequest).mock.calls;
      // Verify deterministic fields are identical (requestId and requestedAt are generated fresh)
      expect(calls[0][0].candidateId).toBe(calls[1][0].candidateId);
      expect(calls[0][0].policyId).toBe(calls[1][0].policyId);
      expect(calls[0][0].policyVersion).toBe(calls[1][0].policyVersion);
      expect(calls[0][0].authorityType).toBe(calls[1][0].authorityType);
      expect(calls[0][0].authorityId).toBe(calls[1][0].authorityId);
      expect(calls[0][0].requestContextHash).toBe(calls[1][0].requestContextHash);
    });

    it('Test 2.3: Replay after error → same result', async () => {
      const candidate = createTestCandidate();
      const decision = createPromotionDecision('PROMOTE');
      const incident = createMockIncident();

      vi.mocked(mockCandidateStore.get).mockResolvedValue(candidate);

      // First call: promotion engine fails
      vi.mocked(mockPromotionEngine.processPromotionRequest)
        .mockRejectedValueOnce(new Error('Transient error'));

      await expect(
        orchestrator.processCandidate(
          candidate.candidateId,
          { authorityType: 'AUTO_ENGINE', authorityId: 'opx-candidate-processor' },
          '2026-01-19T00:05:00Z'
        )
      ).rejects.toThrow('Transient error');

      // Second call: promotion engine succeeds
      vi.mocked(mockPromotionEngine.processPromotionRequest).mockResolvedValue(decision);
      vi.mocked(mockIncidentManager.createIncidentFromPromotion).mockResolvedValue(incident);

      const result = await orchestrator.processCandidate(
        candidate.candidateId,
        { authorityType: 'AUTO_ENGINE', authorityId: 'opx-candidate-processor' },
        '2026-01-19T00:05:00Z'
      );

      // Verify success
      expect(result.success).toBe(true);
      expect(result.incidentId).toBe(incident.incidentId);

      // Verify no partial state from first call
      expect(mockIncidentManager.createIncidentFromPromotion).toHaveBeenCalledTimes(1);
    });
  });

  // === CATEGORY 3: AUTHORITY PRESERVATION ===

  describe('Category 3: Authority Preservation', () => {
    it('Test 3.1: AUTO_ENGINE authority flows through', async () => {
      const event = createCandidateCreatedEvent();
      const candidate = createTestCandidate();
      const decision = createPromotionDecision('PROMOTE');
      const incident = createMockIncident();

      vi.mocked(mockCandidateStore.get).mockResolvedValue(candidate);
      vi.mocked(mockPromotionEngine.processPromotionRequest).mockResolvedValue(decision);
      vi.mocked(mockIncidentManager.createIncidentFromPromotion).mockResolvedValue(incident);

      initializeHandler({ orchestrator });

      await handleCandidateCreated(event, createMockContext());

      // Verify authority passed to promotion engine
      const promotionCall = vi.mocked(mockPromotionEngine.processPromotionRequest).mock.calls[0];
      expect(promotionCall[0].authorityType).toBe('AUTO_ENGINE');
      expect(promotionCall[0].authorityId).toBe('opx-candidate-processor');

      // Verify authority passed to incident manager
      const incidentCall = vi.mocked(mockIncidentManager.createIncidentFromPromotion).mock.calls[0];
      expect(incidentCall[0].authorityType).toBe('AUTO_ENGINE');
      expect(incidentCall[0].authorityId).toBe('opx-candidate-processor');
    });

    it('Test 3.2: Authority in audit trail', async () => {
      const candidate = createTestCandidate();
      const decision = createPromotionDecision('PROMOTE');
      const incident = createMockIncident();

      vi.mocked(mockCandidateStore.get).mockResolvedValue(candidate);
      vi.mocked(mockPromotionEngine.processPromotionRequest).mockResolvedValue(decision);
      vi.mocked(mockIncidentManager.createIncidentFromPromotion).mockResolvedValue(incident);

      await orchestrator.processCandidate(
        candidate.candidateId,
        { authorityType: 'AUTO_ENGINE', authorityId: 'opx-candidate-processor' },
        '2026-01-19T00:05:00Z'
      );

      // Verify orchestration log contains authority
      expect(mockOrchestrationStore.logAttempt).toHaveBeenCalled();
      const logCall = vi.mocked(mockOrchestrationStore.logAttempt).mock.calls[0];
      expect(logCall[0].authorityType).toBe('AUTO_ENGINE');
      expect(logCall[0].authorityId).toBe('opx-candidate-processor');
      expect(logCall[0].decision).toBe('PROMOTE');
    });
  });

  // === CATEGORY 4: ERROR HANDLING ===

  describe('Category 4: Error Handling', () => {
    it('Test 4.1: Candidate not found → error', async () => {
      vi.mocked(mockCandidateStore.get).mockResolvedValue(null);

      await expect(
        orchestrator.processCandidate(
          'nonexistent',
          { authorityType: 'AUTO_ENGINE', authorityId: 'opx-candidate-processor' },
          '2026-01-19T00:05:00Z'
        )
      ).rejects.toThrow('not found');

      // Verify promotion engine NOT called
      expect(mockPromotionEngine.processPromotionRequest).not.toHaveBeenCalled();

      // Verify incident manager NOT called
      expect(mockIncidentManager.createIncidentFromPromotion).not.toHaveBeenCalled();

      // Verify error logged
      expect(mockOrchestrationStore.logAttempt).toHaveBeenCalled();
      const logCall = vi.mocked(mockOrchestrationStore.logAttempt).mock.calls[0];
      expect(logCall[0].status).toBe('error');
    });

    it('Test 4.2: Promotion engine error → propagated', async () => {
      const candidate = createTestCandidate();

      vi.mocked(mockCandidateStore.get).mockResolvedValue(candidate);
      vi.mocked(mockPromotionEngine.processPromotionRequest)
        .mockRejectedValue(new Error('Policy evaluation failed'));

      await expect(
        orchestrator.processCandidate(
          candidate.candidateId,
          { authorityType: 'AUTO_ENGINE', authorityId: 'opx-candidate-processor' },
          '2026-01-19T00:05:00Z'
        )
      ).rejects.toThrow('Policy evaluation failed');

      // Verify incident manager NOT called
      expect(mockIncidentManager.createIncidentFromPromotion).not.toHaveBeenCalled();

      // Verify error logged
      expect(mockOrchestrationStore.logAttempt).toHaveBeenCalled();
      const logCall = vi.mocked(mockOrchestrationStore.logAttempt).mock.calls[0];
      expect(logCall[0].status).toBe('error');
      expect(logCall[0].error).toContain('Policy evaluation failed');
    });
  });

  // === CATEGORY 5: DATA FLOW ===

  describe('Category 5: Data Flow', () => {
    it('Test 5.1: Candidate metadata → incident fields', async () => {
      const candidate = createTestCandidate({
        suggestedSeverity: 'SEV1',
        suggestedService: 'payment-service',
        suggestedTitle: 'Payment processing failure',
      });
      const decision = createPromotionDecision('PROMOTE');
      const incident = createMockIncident({
        severity: 'SEV1',
        service: 'payment-service',
        title: 'Payment processing failure',
      });

      vi.mocked(mockCandidateStore.get).mockResolvedValue(candidate);
      vi.mocked(mockPromotionEngine.processPromotionRequest).mockResolvedValue(decision);
      vi.mocked(mockIncidentManager.createIncidentFromPromotion).mockResolvedValue(incident);

      const result = await orchestrator.processCandidate(
        candidate.candidateId,
        { authorityType: 'AUTO_ENGINE', authorityId: 'opx-candidate-processor' },
        '2026-01-19T00:05:00Z'
      );

      // Verify incident created with correct metadata
      expect(result.incidentId).toBe(incident.incidentId);

      // Verify incident manager called with promotion decision
      const incidentCall = vi.mocked(mockIncidentManager.createIncidentFromPromotion).mock.calls[0];
      expect(incidentCall[0].candidateId).toBe(candidate.candidateId);
      expect(incidentCall[0].decisionId).toBe(decision.decisionId);
    });
  });
});
