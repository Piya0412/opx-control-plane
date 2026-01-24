/**
 * Phase 3.3: Promotion Gate Tests
 * 
 * Tests for promotion gate logic.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PromotionGate } from '../../src/promotion/promotion-gate.js';
import { ActiveIncidentChecker } from '../../src/promotion/active-incident-checker.js';
import type { EvidenceStore } from '../../src/evidence/evidence-store.js';
import type { EvidenceBundle } from '../../src/evidence/evidence-bundle.schema.js';
import type { CandidateAssessment } from '../../src/confidence/confidence.schema.js';

describe('PromotionGate', () => {
  let gate: PromotionGate;
  let mockIncidentChecker: ActiveIncidentChecker;
  let mockEvidenceStore: EvidenceStore;
  
  const validEvidenceId = 'a'.repeat(64);
  const candidateId = 'candidate-123';
  
  const createEvidence = (overrides: Partial<EvidenceBundle> = {}): EvidenceBundle => ({
    evidenceId: validEvidenceId,
    service: 'test-service',
    windowStart: '2026-01-22T10:00:00.000Z',
    windowEnd: '2026-01-22T10:05:00.000Z',
    detections: [
      {
        detectionId: 'det-1',
        ruleId: 'rule-a',
        ruleVersion: '1.0.0',
        severity: 'CRITICAL',
        confidence: 0.9,
        detectedAt: '2026-01-22T10:00:00.000Z',
        signalIds: ['sig-1'],
      },
      {
        detectionId: 'det-2',
        ruleId: 'rule-b',
        ruleVersion: '1.0.0',
        severity: 'HIGH',
        confidence: 0.8,
        detectedAt: '2026-01-22T10:02:00.000Z',
        signalIds: ['sig-2'],
      },
    ],
    signalSummary: {
      signalCount: 2,
      severityDistribution: { CRITICAL: 1, HIGH: 1 },
      timeSpread: 2 * 60 * 1000,
      uniqueRules: 2,
    },
    bundledAt: '2026-01-22T10:05:00.000Z',
    ...overrides,
  });
  
  const createAssessment = (overrides: Partial<CandidateAssessment> = {}): CandidateAssessment => ({
    confidenceScore: 0.7,
    confidenceBand: 'HIGH',
    reasons: ['Test reason'],
    factors: {
      detectionCount: { value: 0.5, contribution: 0.15, weight: 0.3 },
      severityScore: { value: 0.85, contribution: 0.2125, weight: 0.25 },
      ruleDiversity: { value: 0.6, contribution: 0.12, weight: 0.2 },
      temporalDensity: { value: 0.8, contribution: 0.12, weight: 0.15 },
      signalVolume: { value: 0.3, contribution: 0.03, weight: 0.1 },
    },
    assessedAt: '2026-01-22T10:05:00.000Z',
    modelVersion: 'v1.0.0',
    ...overrides,
  });
  
  beforeEach(() => {
    // Create mocks
    mockIncidentChecker = {
      hasActiveIncident: vi.fn().mockResolvedValue(false),
      getActiveIncident: vi.fn().mockResolvedValue(null),
    } as any;
    
    mockEvidenceStore = {
      getEvidence: vi.fn().mockResolvedValue(createEvidence()),
      putEvidence: vi.fn(),
      evidenceExists: vi.fn(),
    } as any;
    
    gate = new PromotionGate(mockIncidentChecker, mockEvidenceStore);
  });
  
  describe('evaluate', () => {
    it('should PROMOTE when all conditions pass', async () => {
      const evidence = createEvidence();
      const assessment = createAssessment();
      
      mockEvidenceStore.getEvidence = vi.fn().mockResolvedValue(evidence);
      mockIncidentChecker.hasActiveIncident = vi.fn().mockResolvedValue(false);
      
      const result = await gate.evaluate(candidateId, validEvidenceId, assessment);
      
      expect(result.decision).toBe('PROMOTE');
      expect(result.incidentId).toBeDefined();
      expect(result.incidentId).toHaveLength(64);
      expect(result.evaluatedAt).toBe(evidence.bundledAt); // CRITICAL: determinism
    });
    
    it('should REJECT when evidence not found', async () => {
      const assessment = createAssessment();
      
      mockEvidenceStore.getEvidence = vi.fn().mockResolvedValue(null);
      
      const result = await gate.evaluate(candidateId, validEvidenceId, assessment);
      
      expect(result.decision).toBe('REJECT');
      expect(result.rejectionCode).toBe('EVIDENCE_NOT_FOUND');
      expect(result.rejectionReason).toContain('Evidence bundle not found');
    });
    
    it('should REJECT when confidence too low', async () => {
      const evidence = createEvidence();
      const assessment = createAssessment({
        confidenceBand: 'MEDIUM',
        confidenceScore: 0.5,
      });
      
      mockEvidenceStore.getEvidence = vi.fn().mockResolvedValue(evidence);
      
      const result = await gate.evaluate(candidateId, validEvidenceId, assessment);
      
      expect(result.decision).toBe('REJECT');
      expect(result.rejectionCode).toBe('CONFIDENCE_TOO_LOW');
      expect(result.rejectionReason).toContain('Confidence too low');
    });
    
    it('should REJECT when insufficient detections', async () => {
      const evidence = createEvidence({
        detections: [
          {
            detectionId: 'det-1',
            ruleId: 'rule-a',
            ruleVersion: '1.0.0',
            severity: 'CRITICAL',
            confidence: 0.9,
            detectedAt: '2026-01-22T10:00:00.000Z',
            signalIds: ['sig-1'],
          },
        ],
      });
      const assessment = createAssessment();
      
      mockEvidenceStore.getEvidence = vi.fn().mockResolvedValue(evidence);
      
      const result = await gate.evaluate(candidateId, validEvidenceId, assessment);
      
      expect(result.decision).toBe('REJECT');
      expect(result.rejectionCode).toBe('INSUFFICIENT_DETECTIONS');
      expect(result.rejectionReason).toContain('Insufficient detections');
    });
    
    it('should REJECT when active incident exists', async () => {
      const evidence = createEvidence();
      const assessment = createAssessment();
      
      mockEvidenceStore.getEvidence = vi.fn().mockResolvedValue(evidence);
      mockIncidentChecker.hasActiveIncident = vi.fn().mockResolvedValue(true);
      
      const result = await gate.evaluate(candidateId, validEvidenceId, assessment);
      
      expect(result.decision).toBe('REJECT');
      expect(result.rejectionCode).toBe('ACTIVE_INCIDENT_EXISTS');
      expect(result.rejectionReason).toContain('Active incident already exists');
    });
    
    it('should use evidence.bundledAt for evaluatedAt (determinism)', async () => {
      const evidence = createEvidence({
        bundledAt: '2026-01-22T10:05:00.000Z',
      });
      const assessment = createAssessment();
      
      mockEvidenceStore.getEvidence = vi.fn().mockResolvedValue(evidence);
      mockIncidentChecker.hasActiveIncident = vi.fn().mockResolvedValue(false);
      
      const result = await gate.evaluate(candidateId, validEvidenceId, assessment);
      
      expect(result.evaluatedAt).toBe('2026-01-22T10:05:00.000Z');
      expect(result.evaluatedAt).toBe(evidence.bundledAt);
    });
    
    it('should include evidence window in result', async () => {
      const evidence = createEvidence({
        windowStart: '2026-01-22T10:00:00.000Z',
        windowEnd: '2026-01-22T10:05:00.000Z',
      });
      const assessment = createAssessment();
      
      mockEvidenceStore.getEvidence = vi.fn().mockResolvedValue(evidence);
      mockIncidentChecker.hasActiveIncident = vi.fn().mockResolvedValue(false);
      
      const result = await gate.evaluate(candidateId, validEvidenceId, assessment);
      
      expect(result.evidenceWindow).toEqual({
        start: '2026-01-22T10:00:00.000Z',
        end: '2026-01-22T10:05:00.000Z',
      });
    });
    
    it('should include gate version in result', async () => {
      const evidence = createEvidence();
      const assessment = createAssessment();
      
      mockEvidenceStore.getEvidence = vi.fn().mockResolvedValue(evidence);
      mockIncidentChecker.hasActiveIncident = vi.fn().mockResolvedValue(false);
      
      const result = await gate.evaluate(candidateId, validEvidenceId, assessment);
      
      expect(result.gateVersion).toBe('v1.0.0');
    });
    
    it('should REJECT with GATE_INTERNAL_ERROR on unexpected error', async () => {
      const assessment = createAssessment();
      
      mockEvidenceStore.getEvidence = vi.fn().mockRejectedValue(new Error('Database error'));
      
      const result = await gate.evaluate(candidateId, validEvidenceId, assessment);
      
      expect(result.decision).toBe('REJECT');
      expect(result.rejectionCode).toBe('GATE_INTERNAL_ERROR');
      expect(result.rejectionReason).toContain('Gate internal error');
    });
  });
  
  describe('Determinism', () => {
    it('should produce same incidentId for same evidence', async () => {
      const evidence = createEvidence();
      const assessment = createAssessment();
      
      mockEvidenceStore.getEvidence = vi.fn().mockResolvedValue(evidence);
      mockIncidentChecker.hasActiveIncident = vi.fn().mockResolvedValue(false);
      
      const result1 = await gate.evaluate(candidateId, validEvidenceId, assessment);
      const result2 = await gate.evaluate(candidateId, validEvidenceId, assessment);
      
      expect(result1.incidentId).toBe(result2.incidentId);
    });
    
    it('should produce same result for same inputs (replay-safe)', async () => {
      const evidence = createEvidence();
      const assessment = createAssessment();
      
      mockEvidenceStore.getEvidence = vi.fn().mockResolvedValue(evidence);
      mockIncidentChecker.hasActiveIncident = vi.fn().mockResolvedValue(false);
      
      const result1 = await gate.evaluate(candidateId, validEvidenceId, assessment);
      const result2 = await gate.evaluate(candidateId, validEvidenceId, assessment);
      
      expect(result1).toEqual(result2);
    });
  });
  
  describe('Fail-Closed', () => {
    it('should fail-closed on all errors', async () => {
      const assessment = createAssessment();
      
      // Simulate various errors
      mockEvidenceStore.getEvidence = vi.fn().mockRejectedValue(new Error('Network error'));
      
      const result = await gate.evaluate(candidateId, validEvidenceId, assessment);
      
      expect(result.decision).toBe('REJECT');
      expect(result.rejectionCode).toBe('GATE_INTERNAL_ERROR');
    });
  });
});
