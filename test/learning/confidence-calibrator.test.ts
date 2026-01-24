/**
 * Phase 4 - Step 5: Confidence Calibrator Tests
 * 
 * Tests for confidence calibration logic.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfidenceCalibrator } from '../../src/learning/confidence-calibrator';
import { CalibrationStore } from '../../src/learning/calibration-store';
import type { OutcomeStore } from '../../src/learning/outcome-store';
import type { IncidentOutcome } from '../../src/learning/outcome.schema';

describe('Phase 4 - Step 5: Confidence Calibrator', () => {
  let calibrator: ConfidenceCalibrator;
  let outcomeStore: OutcomeStore;
  let calibrationStore: CalibrationStore;
  
  const createMockOutcome = (
    confidenceRating: number,
    truePositive: boolean
  ): IncidentOutcome => ({
    outcomeId: 'a'.repeat(64),
    incidentId: 'b'.repeat(64),
    service: 'order-service',
    recordedAt: '2026-01-22T10:00:00.000Z',
    validatedAt: '2026-01-22T10:00:00.000Z',
    recordedBy: { type: 'HUMAN_OPERATOR', principal: 'arn:aws:iam::123456789012:user/operator' },
    classification: {
      truePositive,
      falsePositive: !truePositive,
      rootCause: 'Test',
      resolutionType: 'FIXED',
    },
    timing: {
      detectedAt: '2026-01-22T09:00:00.000Z',
      resolvedAt: '2026-01-22T09:45:00.000Z',
      closedAt: '2026-01-22T10:00:00.000Z',
      ttd: 0,
      ttr: 2700000,
    },
    humanAssessment: {
      confidenceRating,
      severityAccuracy: 'ACCURATE',
      detectionQuality: 'GOOD',
    },
    version: '1.0.0',
  });
  
  beforeEach(() => {
    outcomeStore = {} as OutcomeStore;
    calibrationStore = {} as CalibrationStore;
    
    calibrator = new ConfidenceCalibrator(outcomeStore, calibrationStore);
  });
  
  describe('calibrateConfidence', () => {
    it('should calibrate confidence from outcomes', async () => {
      const outcomes = [
        createMockOutcome(0.7, true),
        createMockOutcome(0.75, true),
      ];
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
      calibrationStore.storeCalibration = vi.fn().mockResolvedValue(true);
      
      const calibration = await calibrator.calibrateConfidence(
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      expect(calibration.calibrationId).toHaveLength(64);
      expect(calibration.bandCalibrations.length).toBeGreaterThan(0);
    });
    
    it('should have deterministic calibrationId', async () => {
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue([createMockOutcome(0.7, true)]);
      calibrationStore.storeCalibration = vi.fn().mockResolvedValue(true);
      
      const calibration1 = await calibrator.calibrateConfidence(
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      const calibration2 = await calibrator.calibrateConfidence(
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      expect(calibration1.calibrationId).toBe(calibration2.calibrationId);
    });
    
    it('should map confidence scores to bands correctly', async () => {
      const outcomes = [
        createMockOutcome(0.1, true),  // VERY_LOW
        createMockOutcome(0.3, true),  // LOW
        createMockOutcome(0.5, true),  // MEDIUM
        createMockOutcome(0.7, true),  // HIGH
        createMockOutcome(0.9, true),  // VERY_HIGH
      ];
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
      calibrationStore.storeCalibration = vi.fn().mockResolvedValue(true);
      
      const calibration = await calibrator.calibrateConfidence(
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      const bands = calibration.bandCalibrations.map(b => b.band);
      expect(bands).toContain('VERY_LOW');
      expect(bands).toContain('LOW');
      expect(bands).toContain('MEDIUM');
      expect(bands).toContain('HIGH');
      expect(bands).toContain('VERY_HIGH');
    });
    
    it('should calculate accuracy correctly', async () => {
      // Create 25 outcomes in HIGH band (20 TP, 5 FP)
      const outcomes = [
        ...Array(20).fill(null).map(() => createMockOutcome(0.7, true)),
        ...Array(5).fill(null).map(() => createMockOutcome(0.7, false)),
      ];
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
      calibrationStore.storeCalibration = vi.fn().mockResolvedValue(true);
      
      const calibration = await calibrator.calibrateConfidence(
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      const highBand = calibration.bandCalibrations.find(b => b.band === 'HIGH');
      expect(highBand).toBeDefined();
      expect(highBand!.accuracy).toBeCloseTo(0.8, 2); // 20/25 = 0.8
    });
    
    it('should calculate drift correctly', async () => {
      // HIGH band: expected 0.7, actual 0.8 → drift = 0.1 (underconfident)
      const outcomes = [
        ...Array(20).fill(null).map(() => createMockOutcome(0.7, true)),
        ...Array(5).fill(null).map(() => createMockOutcome(0.7, false)),
      ];
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
      calibrationStore.storeCalibration = vi.fn().mockResolvedValue(true);
      
      const calibration = await calibrator.calibrateConfidence(
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      const highBand = calibration.bandCalibrations.find(b => b.band === 'HIGH');
      expect(highBand!.drift).toBeCloseTo(0.1, 2); // 0.8 - 0.7 = 0.1
    });
    
    it('should mark bands with insufficient samples', async () => {
      // Only 10 outcomes (< 20 minimum)
      const outcomes = Array(10).fill(null).map(() => createMockOutcome(0.7, true));
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
      calibrationStore.storeCalibration = vi.fn().mockResolvedValue(true);
      
      const calibration = await calibrator.calibrateConfidence(
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      const highBand = calibration.bandCalibrations.find(b => b.band === 'HIGH');
      expect(highBand!.sampleSizeSufficient).toBe(false);
    });
    
    it('should exclude insufficient bands from drift analysis', async () => {
      // 10 outcomes in HIGH (insufficient), 25 in MEDIUM (sufficient, well-calibrated)
      const outcomes = [
        ...Array(10).fill(null).map(() => createMockOutcome(0.7, true)),
        // MEDIUM band: 13 TP, 12 FP = 52% accuracy, expected 50%, drift = 0.02 (well calibrated)
        ...Array(13).fill(null).map(() => createMockOutcome(0.5, true)),
        ...Array(12).fill(null).map(() => createMockOutcome(0.5, false)),
      ];
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
      calibrationStore.storeCalibration = vi.fn().mockResolvedValue(true);
      
      const calibration = await calibrator.calibrateConfidence(
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      expect(calibration.driftAnalysis.insufficientData).toBe(1);
      // Average drift should only include MEDIUM band (which is well calibrated)
      expect(calibration.driftAnalysis.wellCalibrated).toBe(1);
    });
    
    it('should generate recommendations with safety language', async () => {
      const outcomes = Array(25).fill(null).map(() => createMockOutcome(0.7, true));
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
      calibrationStore.storeCalibration = vi.fn().mockResolvedValue(true);
      
      const calibration = await calibrator.calibrateConfidence(
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      expect(calibration.recommendations.length).toBeGreaterThan(0);
      
      for (const rec of calibration.recommendations) {
        expect(rec.recommendation).toContain('informational only');
        expect(rec.recommendation).toContain('human review');
        expect(rec.recommendation).toContain('No automatic tuning');
        expect(rec.actionable).toBe(false);
      }
    });
    
    it('should generate INFO recommendation for insufficient data', async () => {
      const outcomes = Array(10).fill(null).map(() => createMockOutcome(0.7, true));
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
      calibrationStore.storeCalibration = vi.fn().mockResolvedValue(true);
      
      const calibration = await calibrator.calibrateConfidence(
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      const rec = calibration.recommendations.find(r => r.band === 'HIGH');
      expect(rec!.severity).toBe('INFO');
      expect(rec!.recommendation).toContain('insufficient data');
    });
    
    it('should handle empty outcomes', async () => {
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue([]);
      calibrationStore.storeCalibration = vi.fn().mockResolvedValue(true);
      
      const calibration = await calibrator.calibrateConfidence(
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      expect(calibration.bandCalibrations).toHaveLength(0);
      expect(calibration.driftAnalysis.averageDrift).toBe(0);
    });
    
    it('should handle all true positives', async () => {
      const outcomes = Array(25).fill(null).map(() => createMockOutcome(0.7, true));
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
      calibrationStore.storeCalibration = vi.fn().mockResolvedValue(true);
      
      const calibration = await calibrator.calibrateConfidence(
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      const highBand = calibration.bandCalibrations.find(b => b.band === 'HIGH');
      expect(highBand!.accuracy).toBe(1.0);
      expect(highBand!.drift).toBeCloseTo(0.3, 2); // 1.0 - 0.7 = 0.3
    });
    
    it('should handle all false positives', async () => {
      const outcomes = Array(25).fill(null).map(() => createMockOutcome(0.7, false));
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
      calibrationStore.storeCalibration = vi.fn().mockResolvedValue(true);
      
      const calibration = await calibrator.calibrateConfidence(
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      const highBand = calibration.bandCalibrations.find(b => b.band === 'HIGH');
      expect(highBand!.accuracy).toBe(0.0);
      expect(highBand!.drift).toBeCloseTo(-0.7, 2); // 0.0 - 0.7 = -0.7
    });
    
    it('should generate different calibrationId for different dates', async () => {
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue([createMockOutcome(0.7, true)]);
      calibrationStore.storeCalibration = vi.fn().mockResolvedValue(true);
      
      const calibration1 = await calibrator.calibrateConfidence(
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      const calibration2 = await calibrator.calibrateConfidence(
        '2026-02-01T00:00:00.000Z',
        '2026-02-28T23:59:59.999Z'
      );
      
      expect(calibration1.calibrationId).not.toBe(calibration2.calibrationId);
    });
  });
});
