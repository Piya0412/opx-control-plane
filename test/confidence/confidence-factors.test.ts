/**
 * Phase 3.2: Confidence Factors Tests
 * 
 * Tests for pure factor computation functions.
 */

import { describe, it, expect } from 'vitest';
import {
  computeDetectionCountScore,
  computeSeverityScore,
  computeRuleDiversityScore,
  computeTemporalDensityScore,
  computeSignalVolumeScore,
} from '../../src/confidence/confidence-factors.js';
import type { DetectionSummary } from '../../src/evidence/evidence-bundle.schema.js';

describe('Confidence Factors', () => {
  describe('computeDetectionCountScore', () => {
    it('should return 0.3 for 1 detection', () => {
      expect(computeDetectionCountScore(1)).toBe(0.3);
    });

    it('should return 0.5 for 2 detections', () => {
      expect(computeDetectionCountScore(2)).toBe(0.5);
    });

    it('should return 0.7 for 3 detections', () => {
      expect(computeDetectionCountScore(3)).toBe(0.7);
    });

    it('should return 0.9 for 4+ detections', () => {
      expect(computeDetectionCountScore(4)).toBe(0.9);
      expect(computeDetectionCountScore(5)).toBe(0.9);
      expect(computeDetectionCountScore(10)).toBe(0.9);
    });

    it('should throw for zero or negative count', () => {
      expect(() => computeDetectionCountScore(0)).toThrow('Detection count must be positive');
      expect(() => computeDetectionCountScore(-1)).toThrow('Detection count must be positive');
    });
  });

  describe('computeSeverityScore', () => {
    const createDetection = (severity: string): DetectionSummary => ({
      detectionId: 'det-1',
      ruleId: 'rule-1',
      ruleVersion: '1.0.0',
      severity: severity as any,
      confidence: 0.9,
      detectedAt: '2026-01-22T10:00:00.000Z',
      signalIds: ['sig-1'],
    });

    it('should return 1.0 for CRITICAL severity', () => {
      const detections = [createDetection('CRITICAL')];
      expect(computeSeverityScore(detections)).toBe(1.0);
    });

    it('should return 0.7 for HIGH severity', () => {
      const detections = [createDetection('HIGH')];
      expect(computeSeverityScore(detections)).toBe(0.7);
    });

    it('should return 0.4 for MEDIUM severity', () => {
      const detections = [createDetection('MEDIUM')];
      expect(computeSeverityScore(detections)).toBe(0.4);
    });

    it('should return 0.2 for LOW severity', () => {
      const detections = [createDetection('LOW')];
      expect(computeSeverityScore(detections)).toBe(0.2);
    });

    it('should return 0.1 for INFO severity', () => {
      const detections = [createDetection('INFO')];
      expect(computeSeverityScore(detections)).toBe(0.1);
    });

    it('should compute weighted average for mixed severities', () => {
      const detections = [
        createDetection('CRITICAL'), // 1.0
        createDetection('HIGH'),      // 0.7
      ];
      expect(computeSeverityScore(detections)).toBe((1.0 + 0.7) / 2);
    });

    it('should throw for empty detections array', () => {
      expect(() => computeSeverityScore([])).toThrow('Detections array cannot be empty');
    });

    it('should throw for unknown severity', () => {
      const detections = [createDetection('UNKNOWN')];
      expect(() => computeSeverityScore(detections)).toThrow('Unknown severity: UNKNOWN');
    });
  });

  describe('computeRuleDiversityScore', () => {
    const createDetection = (ruleId: string): DetectionSummary => ({
      detectionId: `det-${ruleId}`,
      ruleId,
      ruleVersion: '1.0.0',
      severity: 'HIGH',
      confidence: 0.9,
      detectedAt: '2026-01-22T10:00:00.000Z',
      signalIds: ['sig-1'],
    });

    it('should return 0.3 for single rule', () => {
      const detections = [
        createDetection('rule-a'),
        createDetection('rule-a'),
      ];
      expect(computeRuleDiversityScore(detections)).toBe(0.3);
    });

    it('should return 0.6 for two distinct rules', () => {
      const detections = [
        createDetection('rule-a'),
        createDetection('rule-b'),
      ];
      expect(computeRuleDiversityScore(detections)).toBe(0.6);
    });

    it('should return 1.0 for three or more distinct rules', () => {
      const detections = [
        createDetection('rule-a'),
        createDetection('rule-b'),
        createDetection('rule-c'),
      ];
      expect(computeRuleDiversityScore(detections)).toBe(1.0);
    });

    it('should return 1.0 for four distinct rules', () => {
      const detections = [
        createDetection('rule-a'),
        createDetection('rule-b'),
        createDetection('rule-c'),
        createDetection('rule-d'),
      ];
      expect(computeRuleDiversityScore(detections)).toBe(1.0);
    });

    it('should throw for empty detections array', () => {
      expect(() => computeRuleDiversityScore([])).toThrow('Detections array cannot be empty');
    });
  });

  describe('computeTemporalDensityScore', () => {
    const createDetection = (detectedAt: string): DetectionSummary => ({
      detectionId: 'det-1',
      ruleId: 'rule-1',
      ruleVersion: '1.0.0',
      severity: 'HIGH',
      confidence: 0.9,
      detectedAt,
      signalIds: ['sig-1'],
    });

    it('should return 1.0 for single detection', () => {
      const detections = [createDetection('2026-01-22T10:00:00.000Z')];
      const windowMs = 5 * 60 * 1000; // 5 minutes
      expect(computeTemporalDensityScore(detections, windowMs)).toBe(1.0);
    });

    it('should return ~1.0 for detections at same time', () => {
      const detections = [
        createDetection('2026-01-22T10:00:00.000Z'),
        createDetection('2026-01-22T10:00:00.000Z'),
      ];
      const windowMs = 5 * 60 * 1000;
      expect(computeTemporalDensityScore(detections, windowMs)).toBe(1.0);
    });

    it('should return ~0.0 for detections spread across window', () => {
      const detections = [
        createDetection('2026-01-22T10:00:00.000Z'),
        createDetection('2026-01-22T10:05:00.000Z'), // 5 minutes later
      ];
      const windowMs = 5 * 60 * 1000; // 5 minutes
      expect(computeTemporalDensityScore(detections, windowMs)).toBe(0.0);
    });

    it('should return ~0.5 for detections spread halfway', () => {
      const detections = [
        createDetection('2026-01-22T10:00:00.000Z'),
        createDetection('2026-01-22T10:02:30.000Z'), // 2.5 minutes later
      ];
      const windowMs = 5 * 60 * 1000; // 5 minutes
      const expected = 1 - (2.5 * 60 * 1000) / windowMs;
      expect(computeTemporalDensityScore(detections, windowMs)).toBeCloseTo(expected, 2);
    });

    it('should clamp to [0, 1]', () => {
      const detections = [
        createDetection('2026-01-22T10:00:00.000Z'),
        createDetection('2026-01-22T10:10:00.000Z'), // 10 minutes later
      ];
      const windowMs = 5 * 60 * 1000; // 5 minutes (smaller than spread)
      const score = computeTemporalDensityScore(detections, windowMs);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should throw for empty detections array', () => {
      expect(() => computeTemporalDensityScore([], 300000)).toThrow('Detections array cannot be empty');
    });

    it('should throw for zero or negative window duration', () => {
      const detections = [createDetection('2026-01-22T10:00:00.000Z')];
      expect(() => computeTemporalDensityScore(detections, 0)).toThrow('Window duration must be positive');
      expect(() => computeTemporalDensityScore(detections, -1)).toThrow('Window duration must be positive');
    });
  });

  describe('computeSignalVolumeScore', () => {
    it('should return 0.3 for 1-2 signals', () => {
      expect(computeSignalVolumeScore(1)).toBe(0.3);
      expect(computeSignalVolumeScore(2)).toBe(0.3);
    });

    it('should return 0.5 for 3-5 signals', () => {
      expect(computeSignalVolumeScore(3)).toBe(0.5);
      expect(computeSignalVolumeScore(4)).toBe(0.5);
      expect(computeSignalVolumeScore(5)).toBe(0.5);
    });

    it('should return 0.7 for 6-10 signals', () => {
      expect(computeSignalVolumeScore(6)).toBe(0.7);
      expect(computeSignalVolumeScore(7)).toBe(0.7);
      expect(computeSignalVolumeScore(10)).toBe(0.7);
    });

    it('should return 0.9 for 11+ signals', () => {
      expect(computeSignalVolumeScore(11)).toBe(0.9);
      expect(computeSignalVolumeScore(20)).toBe(0.9);
      expect(computeSignalVolumeScore(100)).toBe(0.9);
    });

    it('should throw for zero or negative count', () => {
      expect(() => computeSignalVolumeScore(0)).toThrow('Signal count must be positive');
      expect(() => computeSignalVolumeScore(-1)).toThrow('Signal count must be positive');
    });
  });

  describe('Determinism', () => {
    it('should produce same results for same inputs', () => {
      const detections: DetectionSummary[] = [
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
      ];

      const windowMs = 5 * 60 * 1000;

      // Call multiple times
      const score1 = computeSeverityScore(detections);
      const score2 = computeSeverityScore(detections);
      const diversity1 = computeRuleDiversityScore(detections);
      const diversity2 = computeRuleDiversityScore(detections);
      const density1 = computeTemporalDensityScore(detections, windowMs);
      const density2 = computeTemporalDensityScore(detections, windowMs);

      // Should be identical
      expect(score1).toBe(score2);
      expect(diversity1).toBe(diversity2);
      expect(density1).toBe(density2);
    });
  });
});
