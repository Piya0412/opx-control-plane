/**
 * Phase 3.5: Idempotency Checker Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IdempotencyChecker } from '../../src/replay/idempotency-checker';
import type { EvidenceStore } from '../../src/evidence/evidence-store';
import type { PromotionStore } from '../../src/promotion/promotion-store';
import type { IncidentStore } from '../../src/incident/incident-store';
import type { EvidenceBundle } from '../../src/evidence/evidence-bundle.schema';
import type { PromotionResult } from '../../src/promotion/promotion.schema';
import type { Incident } from '../../src/incident/incident.schema';

describe('IdempotencyChecker', () => {
  let checker: IdempotencyChecker;
  let mockEvidenceStore: EvidenceStore;
  let mockPromotionStore: PromotionStore;
  let mockIncidentStore: IncidentStore;

  beforeEach(() => {
    // Create mock stores
    mockEvidenceStore = {
      getEvidence: vi.fn(),
    } as any;

    mockPromotionStore = {
      getDecision: vi.fn(),
    } as any;

    mockIncidentStore = {
      getIncident: vi.fn(),
    } as any;

    checker = new IdempotencyChecker({
      evidenceStore: mockEvidenceStore,
      promotionStore: mockPromotionStore,
      incidentStore: mockIncidentStore,
    });
  });

  describe('evidenceExists', () => {
    it('should return exists=true when evidence found', async () => {
      const mockEvidence: EvidenceBundle = {
        evidenceId: 'evidence123',
        service: 'test-service',
        detections: [
          {
            detectionId: 'det1',
            ruleId: 'rule1',
            severity: 'HIGH',
            signalIds: ['sig1'],
            detectedAt: '2026-01-22T10:00:00.000Z',
          },
        ],
        windowStart: '2026-01-22T09:00:00.000Z',
        windowEnd: '2026-01-22T10:00:00.000Z',
        bundledAt: '2026-01-22T10:00:00.000Z',
        signalSummary: {
          signalCount: 1,
          severityDistribution: { HIGH: 1 },
          timeSpread: 0,
          uniqueRules: 1,
        },
      };

      vi.mocked(mockEvidenceStore.getEvidence).mockResolvedValue(mockEvidence);

      const result = await checker.evidenceExists('evidence123');

      expect(result.exists).toBe(true);
      expect(result.evidenceId).toBe('evidence123');
      expect(result.evidence).toEqual(mockEvidence);
    });

    it('should return exists=false when evidence not found', async () => {
      vi.mocked(mockEvidenceStore.getEvidence).mockResolvedValue(null);

      const result = await checker.evidenceExists('evidence123');

      expect(result.exists).toBe(false);
      expect(result.evidenceId).toBeUndefined();
      expect(result.evidence).toBeUndefined();
    });

    it('should return exists=false on error (fail-closed)', async () => {
      vi.mocked(mockEvidenceStore.getEvidence).mockRejectedValue(new Error('DB error'));

      const result = await checker.evidenceExists('evidence123');

      expect(result.exists).toBe(false);
    });
  });

  describe('confidenceExists', () => {
    it('should return exists=false (not implemented yet)', async () => {
      const result = await checker.confidenceExists('evidence123');

      expect(result.exists).toBe(false);
      expect(result.assessment).toBeUndefined();
    });
  });

  describe('promotionExists', () => {
    it('should return exists=true when promotion found', async () => {
      const mockDecision: PromotionResult = {
        decision: 'PROMOTE',
        candidateId: 'candidate123',
        incidentId: 'incident123',
        confidenceScore: 0.8,
        confidenceBand: 'HIGH',
        evaluatedAt: '2026-01-22T10:00:00.000Z',
        gateVersion: 'v1.0.0',
      };

      vi.mocked(mockPromotionStore.getDecision).mockResolvedValue(mockDecision);

      const result = await checker.promotionExists('candidate123');

      expect(result.exists).toBe(true);
      expect(result.decision).toEqual(mockDecision);
    });

    it('should return exists=false when promotion not found', async () => {
      vi.mocked(mockPromotionStore.getDecision).mockResolvedValue(null);

      const result = await checker.promotionExists('candidate123');

      expect(result.exists).toBe(false);
      expect(result.decision).toBeUndefined();
    });

    it('should return exists=false on error (fail-closed)', async () => {
      vi.mocked(mockPromotionStore.getDecision).mockRejectedValue(new Error('DB error'));

      const result = await checker.promotionExists('candidate123');

      expect(result.exists).toBe(false);
    });
  });

  describe('incidentExists', () => {
    it('should return exists=true when incident found', async () => {
      const mockIncident: Incident = {
        incidentId: 'incident123',
        service: 'test-service',
        severity: 'HIGH',
        state: 'OPEN',
        title: 'Test Incident',
        evidenceId: 'evidence123',
        candidateId: 'candidate123',
        confidenceScore: 0.8,
        confidenceBand: 'HIGH',
        openedAt: '2026-01-22T10:00:00.000Z',
        lastModifiedAt: '2026-01-22T10:00:00.000Z',
        createdBy: {
          type: 'AUTO_ENGINE',
          principal: 'arn:aws:lambda:us-east-1:123456789012:function:test',
        },
        lastModifiedBy: {
          type: 'AUTO_ENGINE',
          principal: 'arn:aws:lambda:us-east-1:123456789012:function:test',
        },
      };

      vi.mocked(mockIncidentStore.getIncident).mockResolvedValue(mockIncident);

      const result = await checker.incidentExists('incident123');

      expect(result.exists).toBe(true);
      expect(result.incident).toEqual(mockIncident);
    });

    it('should return exists=false when incident not found', async () => {
      vi.mocked(mockIncidentStore.getIncident).mockResolvedValue(null);

      const result = await checker.incidentExists('incident123');

      expect(result.exists).toBe(false);
      expect(result.incident).toBeUndefined();
    });

    it('should return exists=false on error (fail-closed)', async () => {
      vi.mocked(mockIncidentStore.getIncident).mockRejectedValue(new Error('DB error'));

      const result = await checker.incidentExists('incident123');

      expect(result.exists).toBe(false);
    });
  });
});
