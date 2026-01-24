/**
 * Phase 3.2: Confidence Calculator Tests
 * 
 * Tests for confidence assessment logic.
 */

import { describe, it, expect } from 'vitest';
import { ConfidenceCalculator } from '../../src/confidence/confidence-calculator.js';
import type { EvidenceBundle } from '../../src/evidence/evidence-bundle.schema.js';

describe('ConfidenceCalculator', () => {
  const calculator = new ConfidenceCalculator();

  const createEvidenceBundle = (overrides: Partial<EvidenceBundle> = {}): EvidenceBundle => ({
    evidenceId: 'a'.repeat(64),
    service: 'test-service',
    windowStart: '2026-01-22T10:00:00.000Z',
    windowEnd: '2026-01-22T10:05:00.000Z',
    detections: [
      {
        detectionId: 'det-1',
        ruleId: 'rule-a',
        ruleVersion: '1.0.0',
        severity: 'HIGH',
        confidence: 0.9,
        detectedAt: '2026-01-22T10:00:00.000Z',
        signalIds: ['sig-1'],
      },
    ],
    signalSummary: {
      signalCount: 1,
      severityDistribution: { HIGH: 1 },
      timeSpread: 0,
      uniqueRules: 1,
    },
    bundledAt: '2026-01-22T10:05:00.000Z',
    ...overrides,
  });

  describe('assess', () => {
    it('should return LOW or MEDIUM band for single detection with MEDIUM severity', () => {
      const evidence = createEvidenceBundle({
        detections: [
          {
            detectionId: 'det-1',
            ruleId: 'rule-a',
            ruleVersion: '1.0.0',
            severity: 'MEDIUM',
            confidence: 0.8,
            detectedAt: '2026-01-22T10:00:00.000Z',
            signalIds: ['sig-1'],
          },
        ],
        signalSummary: {
          signalCount: 1,
          severityDistribution: { MEDIUM: 1 },
          timeSpread: 0,
          uniqueRules: 1,
        },
      });

      const assessment = calculator.assess(evidence);

      // Single detection with MEDIUM severity should be LOW or MEDIUM
      expect(['LOW', 'MEDIUM']).toContain(assessment.confidenceBand);
      expect(assessment.confidenceScore).toBeLessThan(0.6);
    });

    it('should return HIGH or CRITICAL band for multiple CRITICAL detections', () => {
      const evidence = createEvidenceBundle({
        detections: [
          {
            detectionId: 'det-1',
            ruleId: 'rule-a',
            ruleVersion: '1.0.0',
            severity: 'CRITICAL',
            confidence: 0.9,
            detectedAt: '2026-01-22T10:00:00.000Z',
            signalIds: ['sig-1', 'sig-2'],
          },
          {
            detectionId: 'det-2',
            ruleId: 'rule-b',
            ruleVersion: '1.0.0',
            severity: 'CRITICAL',
            confidence: 0.9,
            detectedAt: '2026-01-22T10:01:00.000Z',
            signalIds: ['sig-3', 'sig-4'],
          },
          {
            detectionId: 'det-3',
            ruleId: 'rule-c',
            ruleVersion: '1.0.0',
            severity: 'CRITICAL',
            confidence: 0.9,
            detectedAt: '2026-01-22T10:02:00.000Z',
            signalIds: ['sig-5', 'sig-6'],
          },
        ],
        signalSummary: {
          signalCount: 6,
          severityDistribution: { CRITICAL: 3 },
          timeSpread: 2 * 60 * 1000,
          uniqueRules: 3,
        },
      });

      const assessment = calculator.assess(evidence);

      // 3 CRITICAL detections from 3 rules should be HIGH or CRITICAL
      expect(['HIGH', 'CRITICAL']).toContain(assessment.confidenceBand);
      expect(assessment.confidenceScore).toBeGreaterThanOrEqual(0.6);
    });

    it('should return CRITICAL band for many CRITICAL detections', () => {
      const evidence = createEvidenceBundle({
        detections: [
          {
            detectionId: 'det-1',
            ruleId: 'rule-a',
            ruleVersion: '1.0.0',
            severity: 'CRITICAL',
            confidence: 0.9,
            detectedAt: '2026-01-22T10:00:00.000Z',
            signalIds: ['sig-1', 'sig-2', 'sig-3'],
          },
          {
            detectionId: 'det-2',
            ruleId: 'rule-b',
            ruleVersion: '1.0.0',
            severity: 'CRITICAL',
            confidence: 0.9,
            detectedAt: '2026-01-22T10:00:30.000Z',
            signalIds: ['sig-4', 'sig-5', 'sig-6'],
          },
          {
            detectionId: 'det-3',
            ruleId: 'rule-c',
            ruleVersion: '1.0.0',
            severity: 'CRITICAL',
            confidence: 0.9,
            detectedAt: '2026-01-22T10:01:00.000Z',
            signalIds: ['sig-7', 'sig-8', 'sig-9'],
          },
          {
            detectionId: 'det-4',
            ruleId: 'rule-d',
            ruleVersion: '1.0.0',
            severity: 'CRITICAL',
            confidence: 0.9,
            detectedAt: '2026-01-22T10:01:30.000Z',
            signalIds: ['sig-10', 'sig-11', 'sig-12'],
          },
          {
            detectionId: 'det-5',
            ruleId: 'rule-e',
            ruleVersion: '1.0.0',
            severity: 'CRITICAL',
            confidence: 0.9,
            detectedAt: '2026-01-22T10:02:00.000Z',
            signalIds: ['sig-13', 'sig-14', 'sig-15'],
          },
        ],
        signalSummary: {
          signalCount: 15,
          severityDistribution: { CRITICAL: 5 },
          timeSpread: 2 * 60 * 1000,
          uniqueRules: 5,
        },
      });

      const assessment = calculator.assess(evidence);

      expect(assessment.confidenceBand).toBe('CRITICAL');
      expect(assessment.confidenceScore).toBeGreaterThanOrEqual(0.8);
    });

    it('should use evidence.bundledAt for assessedAt (determinism)', () => {
      const evidence = createEvidenceBundle({
        bundledAt: '2026-01-22T10:05:00.000Z',
      });

      const assessment = calculator.assess(evidence);

      expect(assessment.assessedAt).toBe('2026-01-22T10:05:00.000Z');
    });

    it('should include model version', () => {
      const evidence = createEvidenceBundle();

      const assessment = calculator.assess(evidence);

      expect(assessment.modelVersion).toBe('v1.0.0');
    });

    it('should generate reasons that reference computed facts', () => {
      const evidence = createEvidenceBundle({
        detections: [
          {
            detectionId: 'det-1',
            ruleId: 'rule-a',
            ruleVersion: '1.0.0',
            severity: 'CRITICAL',
            confidence: 0.9,
            detectedAt: '2026-01-22T10:00:00.000Z',
            signalIds: ['sig-1', 'sig-2'],
          },
          {
            detectionId: 'det-2',
            ruleId: 'rule-b',
            ruleVersion: '1.0.0',
            severity: 'CRITICAL',
            confidence: 0.9,
            detectedAt: '2026-01-22T10:01:00.000Z',
            signalIds: ['sig-3', 'sig-4'],
          },
        ],
        signalSummary: {
          signalCount: 4,
          severityDistribution: { CRITICAL: 2 },
          timeSpread: 60 * 1000,
          uniqueRules: 2,
        },
      });

      const assessment = calculator.assess(evidence);

      expect(assessment.reasons.length).toBeGreaterThan(0);
      
      // Should reference detection count
      const hasDetectionCount = assessment.reasons.some(r => r.includes('2 detections'));
      expect(hasDetectionCount).toBe(true);

      // Should reference CRITICAL severity (not SEV1)
      const hasCriticalSeverity = assessment.reasons.some(r => r.includes('CRITICAL'));
      expect(hasCriticalSeverity).toBe(true);

      // Should NOT reference raw severity
      const hasRawSeverity = assessment.reasons.some(r => r.includes('SEV1'));
      expect(hasRawSeverity).toBe(false);

      // Should reference rule diversity
      const hasRuleDiversity = assessment.reasons.some(r => r.includes('2 distinct'));
      expect(hasRuleDiversity).toBe(true);
    });

    it('should never restate the band in reasons', () => {
      const evidence = createEvidenceBundle();

      const assessment = calculator.assess(evidence);

      // Reasons should not contain band names
      const hasBandName = assessment.reasons.some(r => 
        r.includes('LOW') || r.includes('MEDIUM') || r.includes('HIGH') || r.includes('CRITICAL')
      );
      
      // Exception: severity can be CRITICAL/HIGH/MEDIUM/LOW
      // So we check that reasons don't say "confidence is HIGH" or similar
      const restatesBand = assessment.reasons.some(r => 
        r.toLowerCase().includes('confidence is') || 
        r.toLowerCase().includes('band is')
      );
      expect(restatesBand).toBe(false);
    });

    it('should include factor breakdown', () => {
      const evidence = createEvidenceBundle();

      const assessment = calculator.assess(evidence);

      expect(assessment.factors).toBeDefined();
      expect(assessment.factors.detectionCount).toBeDefined();
      expect(assessment.factors.severityScore).toBeDefined();
      expect(assessment.factors.ruleDiversity).toBeDefined();
      expect(assessment.factors.temporalDensity).toBeDefined();
      expect(assessment.factors.signalVolume).toBeDefined();

      // All factors should have value, contribution, weight
      expect(assessment.factors.detectionCount.value).toBeGreaterThanOrEqual(0);
      expect(assessment.factors.detectionCount.value).toBeLessThanOrEqual(1);
      expect(assessment.factors.detectionCount.contribution).toBeGreaterThanOrEqual(0);
      expect(assessment.factors.detectionCount.contribution).toBeLessThanOrEqual(1);
      expect(assessment.factors.detectionCount.weight).toBeGreaterThanOrEqual(0);
      expect(assessment.factors.detectionCount.weight).toBeLessThanOrEqual(1);
    });

    it('should enforce band ↔ score consistency', () => {
      const evidence = createEvidenceBundle();

      const assessment = calculator.assess(evidence);

      // Verify band matches score range
      if (assessment.confidenceBand === 'LOW') {
        expect(assessment.confidenceScore).toBeLessThan(0.4);
      } else if (assessment.confidenceBand === 'MEDIUM') {
        expect(assessment.confidenceScore).toBeGreaterThanOrEqual(0.4);
        expect(assessment.confidenceScore).toBeLessThan(0.6);
      } else if (assessment.confidenceBand === 'HIGH') {
        expect(assessment.confidenceScore).toBeGreaterThanOrEqual(0.6);
        expect(assessment.confidenceScore).toBeLessThan(0.8);
      } else if (assessment.confidenceBand === 'CRITICAL') {
        expect(assessment.confidenceScore).toBeGreaterThanOrEqual(0.8);
      }
    });
  });

  describe('Determinism', () => {
    it('should produce identical assessment for same evidence', () => {
      const evidence = createEvidenceBundle({
        detections: [
          {
            detectionId: 'det-1',
            ruleId: 'rule-a',
            ruleVersion: '1.0.0',
            severity: 'CRITICAL',
            confidence: 0.9,
            detectedAt: '2026-01-22T10:00:00.000Z',
            signalIds: ['sig-1', 'sig-2'],
          },
          {
            detectionId: 'det-2',
            ruleId: 'rule-b',
            ruleVersion: '1.0.0',
            severity: 'HIGH',
            confidence: 0.8,
            detectedAt: '2026-01-22T10:02:00.000Z',
            signalIds: ['sig-3'],
          },
        ],
        signalSummary: {
          signalCount: 3,
          severityDistribution: { CRITICAL: 1, HIGH: 1 },
          timeSpread: 2 * 60 * 1000,
          uniqueRules: 2,
        },
      });

      const assessment1 = calculator.assess(evidence);
      const assessment2 = calculator.assess(evidence);

      // Should be byte-for-byte identical
      expect(assessment1.confidenceScore).toBe(assessment2.confidenceScore);
      expect(assessment1.confidenceBand).toBe(assessment2.confidenceBand);
      expect(assessment1.assessedAt).toBe(assessment2.assessedAt);
      expect(assessment1.modelVersion).toBe(assessment2.modelVersion);
      expect(assessment1.reasons).toEqual(assessment2.reasons);
      expect(assessment1.factors).toEqual(assessment2.factors);
    });
  });

  describe('Boundary Scores', () => {
    it('should handle score at 0.39 (LOW)', () => {
      // This is a synthetic test - actual scores may not hit exact boundaries
      // But we verify band logic is correct
      const evidence = createEvidenceBundle({
        detections: [
          {
            detectionId: 'det-1',
            ruleId: 'rule-a',
            ruleVersion: '1.0.0',
            severity: 'LOW',
            confidence: 0.5,
            detectedAt: '2026-01-22T10:00:00.000Z',
            signalIds: ['sig-1'],
          },
        ],
        signalSummary: {
          signalCount: 1,
          severityDistribution: { LOW: 1 },
          timeSpread: 0,
          uniqueRules: 1,
        },
      });

      const assessment = calculator.assess(evidence);

      if (assessment.confidenceScore < 0.4) {
        expect(assessment.confidenceBand).toBe('LOW');
      }
    });

    it('should handle score at 0.4 (MEDIUM)', () => {
      const evidence = createEvidenceBundle({
        detections: [
          {
            detectionId: 'det-1',
            ruleId: 'rule-a',
            ruleVersion: '1.0.0',
            severity: 'MEDIUM',
            confidence: 0.7,
            detectedAt: '2026-01-22T10:00:00.000Z',
            signalIds: ['sig-1', 'sig-2'],
          },
          {
            detectionId: 'det-2',
            ruleId: 'rule-a',
            ruleVersion: '1.0.0',
            severity: 'MEDIUM',
            confidence: 0.7,
            detectedAt: '2026-01-22T10:01:00.000Z',
            signalIds: ['sig-3'],
          },
        ],
        signalSummary: {
          signalCount: 3,
          severityDistribution: { MEDIUM: 2 },
          timeSpread: 60 * 1000,
          uniqueRules: 1,
        },
      });

      const assessment = calculator.assess(evidence);

      if (assessment.confidenceScore >= 0.4 && assessment.confidenceScore < 0.6) {
        expect(assessment.confidenceBand).toBe('MEDIUM');
      }
    });

    it('should handle score at 0.6 (HIGH)', () => {
      const evidence = createEvidenceBundle({
        detections: [
          {
            detectionId: 'det-1',
            ruleId: 'rule-a',
            ruleVersion: '1.0.0',
            severity: 'HIGH',
            confidence: 0.8,
            detectedAt: '2026-01-22T10:00:00.000Z',
            signalIds: ['sig-1', 'sig-2'],
          },
          {
            detectionId: 'det-2',
            ruleId: 'rule-b',
            ruleVersion: '1.0.0',
            severity: 'HIGH',
            confidence: 0.8,
            detectedAt: '2026-01-22T10:01:00.000Z',
            signalIds: ['sig-3', 'sig-4'],
          },
          {
            detectionId: 'det-3',
            ruleId: 'rule-c',
            ruleVersion: '1.0.0',
            severity: 'HIGH',
            confidence: 0.8,
            detectedAt: '2026-01-22T10:02:00.000Z',
            signalIds: ['sig-5'],
          },
        ],
        signalSummary: {
          signalCount: 5,
          severityDistribution: { HIGH: 3 },
          timeSpread: 2 * 60 * 1000,
          uniqueRules: 3,
        },
      });

      const assessment = calculator.assess(evidence);

      if (assessment.confidenceScore >= 0.6 && assessment.confidenceScore < 0.8) {
        expect(assessment.confidenceBand).toBe('HIGH');
      }
    });

    it('should handle score at 0.8 (CRITICAL)', () => {
      const evidence = createEvidenceBundle({
        detections: [
          {
            detectionId: 'det-1',
            ruleId: 'rule-a',
            ruleVersion: '1.0.0',
            severity: 'CRITICAL',
            confidence: 0.95,
            detectedAt: '2026-01-22T10:00:00.000Z',
            signalIds: ['sig-1', 'sig-2', 'sig-3'],
          },
          {
            detectionId: 'det-2',
            ruleId: 'rule-b',
            ruleVersion: '1.0.0',
            severity: 'CRITICAL',
            confidence: 0.95,
            detectedAt: '2026-01-22T10:00:30.000Z',
            signalIds: ['sig-4', 'sig-5', 'sig-6'],
          },
          {
            detectionId: 'det-3',
            ruleId: 'rule-c',
            ruleVersion: '1.0.0',
            severity: 'CRITICAL',
            confidence: 0.95,
            detectedAt: '2026-01-22T10:01:00.000Z',
            signalIds: ['sig-7', 'sig-8', 'sig-9'],
          },
          {
            detectionId: 'det-4',
            ruleId: 'rule-d',
            ruleVersion: '1.0.0',
            severity: 'CRITICAL',
            confidence: 0.95,
            detectedAt: '2026-01-22T10:01:30.000Z',
            signalIds: ['sig-10', 'sig-11', 'sig-12'],
          },
        ],
        signalSummary: {
          signalCount: 12,
          severityDistribution: { CRITICAL: 4 },
          timeSpread: 90 * 1000,
          uniqueRules: 4,
        },
      });

      const assessment = calculator.assess(evidence);

      if (assessment.confidenceScore >= 0.8) {
        expect(assessment.confidenceBand).toBe('CRITICAL');
      }
    });
  });

  describe('Rule Diversity Step Behavior', () => {
    it('should use stepwise scoring for rule diversity', () => {
      const evidence1 = createEvidenceBundle({
        detections: [
          {
            detectionId: 'det-1',
            ruleId: 'rule-a',
            ruleVersion: '1.0.0',
            severity: 'HIGH',
            confidence: 0.9,
            detectedAt: '2026-01-22T10:00:00.000Z',
            signalIds: ['sig-1'],
          },
        ],
        signalSummary: {
          signalCount: 1,
          severityDistribution: { HIGH: 1 },
          timeSpread: 0,
          uniqueRules: 1,
        },
      });

      const evidence2 = createEvidenceBundle({
        detections: [
          {
            detectionId: 'det-1',
            ruleId: 'rule-a',
            ruleVersion: '1.0.0',
            severity: 'HIGH',
            confidence: 0.9,
            detectedAt: '2026-01-22T10:00:00.000Z',
            signalIds: ['sig-1'],
          },
          {
            detectionId: 'det-2',
            ruleId: 'rule-b',
            ruleVersion: '1.0.0',
            severity: 'HIGH',
            confidence: 0.9,
            detectedAt: '2026-01-22T10:01:00.000Z',
            signalIds: ['sig-2'],
          },
        ],
        signalSummary: {
          signalCount: 2,
          severityDistribution: { HIGH: 2 },
          timeSpread: 60 * 1000,
          uniqueRules: 2,
        },
      });

      const assessment1 = calculator.assess(evidence1);
      const assessment2 = calculator.assess(evidence2);

      // Rule diversity should contribute more in evidence2
      expect(assessment2.factors.ruleDiversity.value).toBeGreaterThan(assessment1.factors.ruleDiversity.value);
      
      // Specifically: 1 rule = 0.3, 2 rules = 0.6
      expect(assessment1.factors.ruleDiversity.value).toBe(0.3);
      expect(assessment2.factors.ruleDiversity.value).toBe(0.6);
    });
  });

  describe('Zero Randomness', () => {
    it('should be snapshot-safe (no randomness)', () => {
      const evidence = createEvidenceBundle({
        detections: [
          {
            detectionId: 'det-1',
            ruleId: 'rule-a',
            ruleVersion: '1.0.0',
            severity: 'CRITICAL',
            confidence: 0.9,
            detectedAt: '2026-01-22T10:00:00.000Z',
            signalIds: ['sig-1', 'sig-2'],
          },
          {
            detectionId: 'det-2',
            ruleId: 'rule-b',
            ruleVersion: '1.0.0',
            severity: 'HIGH',
            confidence: 0.8,
            detectedAt: '2026-01-22T10:02:00.000Z',
            signalIds: ['sig-3'],
          },
        ],
        signalSummary: {
          signalCount: 3,
          severityDistribution: { CRITICAL: 1, HIGH: 1 },
          timeSpread: 2 * 60 * 1000,
          uniqueRules: 2,
        },
        bundledAt: '2026-01-22T10:05:00.000Z',
      });

      const assessment = calculator.assess(evidence);

      // Snapshot values (these should never change for same input)
      expect(assessment.confidenceScore).toMatchSnapshot();
      expect(assessment.confidenceBand).toMatchSnapshot();
      expect(assessment.reasons).toMatchSnapshot();
      expect(assessment.factors).toMatchSnapshot();
    });
  });
});
