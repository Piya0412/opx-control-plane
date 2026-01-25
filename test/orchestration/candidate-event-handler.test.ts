/**
 * Phase 2.3: Candidate Event Handler Tests
 * Comprehensive test coverage (8 tests)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleCandidateCreated,
  initializeHandler,
  type EventBridgeEvent,
} from '../../src/orchestration/candidate-event-handler.js';
import type { IncidentOrchestrator } from '../../src/orchestration/incident-orchestrator.js';
import type { CandidateCreatedEvent } from '../../src/orchestration/candidate-event.schema.js';
import type { Context } from 'aws-lambda';

function createMockEventBridgeEvent(
  detail: Partial<CandidateCreatedEvent>
): EventBridgeEvent<'CandidateCreated', any> {
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
      ...detail,
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

describe('CandidateEventHandler', () => {
  let mockPromotionGate: any;
  let mockCandidateStore: any;
  let mockPromotionStore: any;
  let mockIncidentManager: any;
  let mockEvidenceStore: any;

  beforeEach(() => {
    mockPromotionGate = {
      evaluate: vi.fn(),
    };
    
    mockCandidateStore = {
      get: vi.fn(),
    };
    
    mockPromotionStore = {
      recordDecision: vi.fn(),
    };
    
    mockIncidentManager = {
      createIncident: vi.fn(),
    };
    
    mockEvidenceStore = {
      getEvidence: vi.fn(),
    };

    initializeHandler({
      promotionGate: mockPromotionGate,
      candidateStore: mockCandidateStore,
      promotionStore: mockPromotionStore,
      incidentManager: mockIncidentManager,
      evidenceStore: mockEvidenceStore,
    });
  });

  describe('Happy Path', () => {
    it('processes valid CandidateCreated event', async () => {
      const event = createMockEventBridgeEvent({});

      const mockCandidate = {
        candidateId: 'a'.repeat(64),
        evidenceGraphIds: ['e'.repeat(64)],
        confidence: 'HIGH',
        confidenceFactors: [],
        createdAt: '2026-01-19T00:00:00Z',
      };

      const mockEvidence = {
        evidenceId: 'e'.repeat(64),
        bundledAt: '2026-01-19T00:00:00Z',
      };

      const mockPromotionResult = {
        decision: 'PROMOTE',
        incidentId: 'f'.repeat(64),
        candidateId: 'a'.repeat(64),
        evidenceId: 'e'.repeat(64),
        confidenceScore: 0.8,
        confidenceBand: 'HIGH',
        evidenceWindow: {
          start: '2026-01-19T00:00:00Z',
          end: '2026-01-19T00:30:00Z',
        },
        evaluatedAt: '2026-01-19T00:00:00Z',
        gateVersion: 'v1.0.0',
      };

      const mockIncident = {
        incidentId: 'f'.repeat(64),
        state: 'OPEN',
        severity: 'SEV2',
      };

      vi.mocked(mockCandidateStore.get).mockResolvedValue(mockCandidate);
      vi.mocked(mockEvidenceStore.getEvidence).mockResolvedValue(mockEvidence);
      vi.mocked(mockPromotionGate.evaluate).mockResolvedValue(mockPromotionResult);
      vi.mocked(mockIncidentManager.createIncident).mockResolvedValue(mockIncident);
      vi.mocked(mockPromotionStore.recordDecision).mockResolvedValue(undefined);

      await expect(
        handleCandidateCreated(event, createMockContext())
      ).resolves.toBeUndefined();

      expect(mockPromotionGate.evaluate).toHaveBeenCalled();
      expect(mockIncidentManager.createIncident).toHaveBeenCalled();
    });

    it('logs result correctly', async () => {
      const event = createMockEventBridgeEvent({});

      const mockCandidate = {
        candidateId: 'a'.repeat(64),
        evidenceGraphIds: ['e'.repeat(64)],
        confidence: 'LOW',
        confidenceFactors: [],
        createdAt: '2026-01-19T00:00:00Z',
      };

      const mockPromotionResult = {
        decision: 'REJECT',
        candidateId: 'a'.repeat(64),
        evidenceId: 'e'.repeat(64),
        confidenceScore: 0.3,
        confidenceBand: 'LOW',
        rejectionReason: 'Confidence too low',
        rejectionCode: 'CONFIDENCE_TOO_LOW',
        evidenceWindow: {
          start: '2026-01-19T00:00:00Z',
          end: '2026-01-19T00:30:00Z',
        },
        evaluatedAt: '2026-01-19T00:00:00Z',
        gateVersion: 'v1.0.0',
      };

      vi.mocked(mockCandidateStore.get).mockResolvedValue(mockCandidate);
      vi.mocked(mockPromotionGate.evaluate).mockResolvedValue(mockPromotionResult);
      vi.mocked(mockPromotionStore.recordDecision).mockResolvedValue(undefined);

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await handleCandidateCreated(event, createMockContext());

      expect(logSpy).toHaveBeenCalledWith(
        'Candidate rejected',
        expect.objectContaining({
          candidateId: 'a'.repeat(64),
          rejectionReason: 'Confidence too low',
        })
      );

      logSpy.mockRestore();
    });
  });

  describe('Schema Validation', () => {
    it('throws on invalid eventType', async () => {
      const event = createMockEventBridgeEvent({
        eventType: 'InvalidType' as any,
      });

      await expect(
        handleCandidateCreated(event, createMockContext())
      ).rejects.toThrow('Invalid CandidateCreated event');

      expect(mockOrchestrator.processCandidate).not.toHaveBeenCalled();
    });

    it('throws on invalid candidateId format', async () => {
      const event = createMockEventBridgeEvent({
        candidateId: 'invalid',
      });

      await expect(
        handleCandidateCreated(event, createMockContext())
      ).rejects.toThrow('Invalid CandidateCreated event');

      expect(mockOrchestrator.processCandidate).not.toHaveBeenCalled();
    });

    it('throws on missing required field', async () => {
      const event = createMockEventBridgeEvent({
        severity: undefined as any,
      });

      await expect(
        handleCandidateCreated(event, createMockContext())
      ).rejects.toThrow('Invalid CandidateCreated event');

      expect(mockOrchestrator.processCandidate).not.toHaveBeenCalled();
    });
  });

  describe('Authority Context', () => {
    it('builds AUTO_ENGINE authority correctly', async () => {
      const event = createMockEventBridgeEvent({
        candidateId: 'b'.repeat(64),
      });

      vi.mocked(mockOrchestrator.processCandidate).mockResolvedValue({
        success: true,
        decision: 'PROMOTE',
        incidentId: 'f'.repeat(64),
        decisionId: 'c'.repeat(64),
        reason: 'Policy evaluation: PROMOTE',
      });

      await handleCandidateCreated(event, createMockContext());

      expect(mockOrchestrator.processCandidate).toHaveBeenCalledWith(
        'b'.repeat(64),
        {
          authorityType: 'AUTO_ENGINE',
          authorityId: 'opx-candidate-processor',
          sessionId: 'b'.repeat(64),
          justification: 'Auto-promotion from correlation',
        },
        expect.any(String)
      );
    });
  });

  describe('Error Propagation', () => {
    it('propagates orchestrator errors', async () => {
      const event = createMockEventBridgeEvent({});

      vi.mocked(mockOrchestrator.processCandidate).mockRejectedValue(
        new Error('Candidate not found')
      );

      await expect(
        handleCandidateCreated(event, createMockContext())
      ).rejects.toThrow('Candidate not found');
    });

    it('propagates validation errors', async () => {
      const event = createMockEventBridgeEvent({
        candidateId: 'invalid',
      });

      await expect(
        handleCandidateCreated(event, createMockContext())
      ).rejects.toThrow('Invalid CandidateCreated event');

      expect(mockOrchestrator.processCandidate).not.toHaveBeenCalled();
    });
  });
});
