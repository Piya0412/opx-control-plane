/**
 * Phase 3.4: Incident Manager Tests (CANONICAL)
 * 
 * Tests aligned with Phase 3.4 implementation.
 * 
 * CRITICAL: This test file matches the CANONICAL implementation.
 * Previous CP-6 tests were removed as they reflected abandoned iteration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IncidentManager } from '../../src/incident/incident-manager.js';
import { IncidentStore } from '../../src/incident/incident-store.js';
import { IncidentStateMachine } from '../../src/incident/state-machine.js';
import type { Incident, Authority } from '../../src/incident/incident.schema.js';
import type { PromotionResult } from '../../src/promotion/promotion.schema.js';
import type { EvidenceBundle } from '../../src/evidence/evidence-bundle.schema.js';

describe('Phase 3.4: Incident Manager (Canonical)', () => {
  let manager: IncidentManager;
  let incidentStore: IncidentStore;
  let stateMachine: IncidentStateMachine;

  const mockPromotionResult: PromotionResult = {
    decision: 'PROMOTE',
    incidentId: 'i'.repeat(64),
    candidateId: 'c'.repeat(64),
    evidenceId: 'e'.repeat(64),
    confidenceScore: 0.85,
    confidenceBand: 'HIGH',
    evidenceWindow: {
      start: '2026-01-17T09:00:00.000Z',
      end: '2026-01-17T10:00:00.000Z',
    },
    evaluatedAt: '2026-01-17T10:00:00.000Z',
    gateVersion: 'v1.0.0',
  };

  const mockEvidence: EvidenceBundle = {
    evidenceId: 'e'.repeat(64),
    service: 'lambda',
    detections: [
      {
        detectionId: 'd1'.padEnd(64, '0'),
        ruleId: 'rule-1',
        ruleVersion: '1.0.0',
        severity: 'HIGH',
        confidence: 0.9,
        detectedAt: '2026-01-17T09:30:00.000Z',
        signalIds: ['s1'.padEnd(64, '0')],
        metadata: {},
      },
      {
        detectionId: 'd2'.padEnd(64, '0'),
        ruleId: 'rule-2',
        ruleVersion: '1.0.0',
        severity: 'MEDIUM',
        confidence: 0.8,
        detectedAt: '2026-01-17T09:45:00.000Z',
        signalIds: ['s2'.padEnd(64, '0')],
        metadata: {},
      },
    ],
    correlationKey: 'k'.repeat(64),
    bundledAt: '2026-01-17T10:00:00.000Z',
    bundleVersion: 'v1',
  };

  const mockAuthority: Authority = {
    type: 'AUTO_ENGINE',
    principal: 'arn:aws:iam::123456789012:role/opx-engine',
  };

  beforeEach(() => {
    incidentStore = {
      getIncident: vi.fn(),
      putIncident: vi.fn(),
      updateIncident: vi.fn(),
      listIncidents: vi.fn(),
      listActiveIncidents: vi.fn(),
    } as any;

    stateMachine = new IncidentStateMachine();

    manager = new IncidentManager(incidentStore, stateMachine);
  });

  describe('createIncident', () => {
    it('should create incident from promotion result', async () => {
      vi.mocked(incidentStore.getIncident).mockResolvedValue(null);
      vi.mocked(incidentStore.putIncident).mockResolvedValue(true);

      const incident = await manager.createIncident(
        mockPromotionResult,
        mockEvidence,
        mockPromotionResult.candidateId,
        mockAuthority
      );

      expect(incident).toBeDefined();
      expect(incident.incidentId).toBe(mockPromotionResult.incidentId);
      expect(incident.service).toBe(mockEvidence.service);
      expect(incident.state).toBe('OPEN');
      expect(incident.severity).toBe('HIGH'); // Max from detections
      expect(incident.createdAt).toBe(mockPromotionResult.evaluatedAt);
      expect(incident.openedAt).toBe(mockPromotionResult.evaluatedAt);
      expect(incidentStore.putIncident).toHaveBeenCalled();
    });

    it('should reject non-PROMOTE decision', async () => {
      const rejectResult = { ...mockPromotionResult, decision: 'REJECT' as const };

      await expect(
        manager.createIncident(rejectResult, mockEvidence, 'c'.repeat(64), mockAuthority)
      ).rejects.toThrow('Cannot create incident from REJECT decision');
    });

    it('should return existing incident (idempotent)', async () => {
      const existingIncident: Incident = {
        incidentId: mockPromotionResult.incidentId,
        service: 'lambda',
        severity: 'HIGH',
        state: 'OPEN',
        evidenceId: mockEvidence.evidenceId,
        candidateId: mockPromotionResult.candidateId,
        decisionId: mockPromotionResult.incidentId,
        confidenceScore: 0.85,
        createdAt: '2026-01-17T10:00:00.000Z',
        openedAt: '2026-01-17T10:00:00.000Z',
        title: 'Test Incident',
        description: 'Test',
        tags: [],
        createdBy: mockAuthority,
        lastModifiedAt: '2026-01-17T10:00:00.000Z',
        lastModifiedBy: mockAuthority,
      };

      vi.mocked(incidentStore.getIncident).mockResolvedValue(existingIncident);

      const incident = await manager.createIncident(
        mockPromotionResult,
        mockEvidence,
        mockPromotionResult.candidateId,
        mockAuthority
      );

      expect(incident).toBe(existingIncident);
      expect(incidentStore.putIncident).not.toHaveBeenCalled();
    });

    it('should derive severity from evidence (max severity)', async () => {
      vi.mocked(incidentStore.getIncident).mockResolvedValue(null);
      vi.mocked(incidentStore.putIncident).mockResolvedValue(true);

      const incident = await manager.createIncident(
        mockPromotionResult,
        mockEvidence,
        mockPromotionResult.candidateId,
        mockAuthority
      );

      // Evidence has HIGH and MEDIUM detections, should use HIGH
      expect(incident.severity).toBe('HIGH');
    });
  });

  describe('transitionIncident', () => {
    const mockIncident: Incident = {
      incidentId: 'i'.repeat(64),
      service: 'lambda',
      severity: 'HIGH',
      state: 'OPEN',
      evidenceId: 'e'.repeat(64),
      candidateId: 'c'.repeat(64),
      decisionId: 'i'.repeat(64),
      confidenceScore: 0.85,
      createdAt: '2026-01-17T10:00:00.000Z',
      openedAt: '2026-01-17T10:00:00.000Z',
      title: 'Test Incident',
      description: 'Test',
      tags: [],
      createdBy: mockAuthority,
      lastModifiedAt: '2026-01-17T10:00:00.000Z',
      lastModifiedBy: mockAuthority,
    };

    it('should transition incident state', async () => {
      vi.mocked(incidentStore.getIncident).mockResolvedValue(mockIncident);
      vi.mocked(incidentStore.updateIncident).mockResolvedValue(undefined);

      const humanAuthority: Authority = {
        type: 'HUMAN_OPERATOR',
        principal: 'user:jane@example.com',
      };

      const updated = await manager.transitionIncident(
        mockIncident.incidentId,
        'ACKNOWLEDGED',
        humanAuthority
      );

      expect(updated.state).toBe('ACKNOWLEDGED');
      expect(updated.acknowledgedAt).toBeDefined();
      expect(incidentStore.updateIncident).toHaveBeenCalled();
    });

    it('should reject invalid transition', async () => {
      vi.mocked(incidentStore.getIncident).mockResolvedValue(mockIncident);

      await expect(
        manager.transitionIncident(mockIncident.incidentId, 'CLOSED', mockAuthority)
      ).rejects.toThrow('Transition not allowed');
    });

    it('should reject if incident not found', async () => {
      vi.mocked(incidentStore.getIncident).mockResolvedValue(null);

      await expect(
        manager.transitionIncident('nonexistent', 'ACKNOWLEDGED', mockAuthority)
      ).rejects.toThrow('Incident not found');
    });
  });

  describe('query methods', () => {
    it('should get incident by ID', async () => {
      const mockIncident: Incident = {
        incidentId: 'i'.repeat(64),
        service: 'lambda',
        severity: 'HIGH',
        state: 'OPEN',
        evidenceId: 'e'.repeat(64),
        candidateId: 'c'.repeat(64),
        decisionId: 'i'.repeat(64),
        confidenceScore: 0.85,
        createdAt: '2026-01-17T10:00:00.000Z',
        title: 'Test',
        description: 'Test',
        tags: [],
        createdBy: mockAuthority,
        lastModifiedAt: '2026-01-17T10:00:00.000Z',
        lastModifiedBy: mockAuthority,
      };

      vi.mocked(incidentStore.getIncident).mockResolvedValue(mockIncident);

      const result = await manager.getIncident(mockIncident.incidentId);

      expect(result).toBe(mockIncident);
    });

    it('should list active incidents', async () => {
      const mockIncidents: Incident[] = [];
      vi.mocked(incidentStore.listActiveIncidents).mockResolvedValue(mockIncidents);

      const result = await manager.listActiveIncidents();

      expect(result).toBe(mockIncidents);
    });
  });
});
