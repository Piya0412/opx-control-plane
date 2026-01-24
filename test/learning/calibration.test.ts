/**
 * Phase 4 - Step 5: Calibration Schema Tests
 * 
 * Tests for confidence calibration schema validation.
 */

import { describe, it, expect } from 'vitest';
import { ConfidenceCalibrationSchema } from '../../src/learning/calibration.schema';

describe('Phase 4 - Step 5: Calibration Schema', () => {
  const validCalibration = {
    calibrationId: 'a'.repeat(64),
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-01-31T23:59:59.999Z',
    generatedAt: '2026-02-01T00:00:00.000Z',
    bandCalibrations: [
      {
        band: 'HIGH' as const,
        totalIncidents: 25,
        truePositives: 20,
        falsePositives: 5,
        accuracy: 0.8,
        expectedAccuracy: 0.7,
        drift: 0.1,
        sampleSizeSufficient: true,
      },
    ],
    driftAnalysis: {
      overconfident: 0,
      underconfident: 1,
      wellCalibrated: 0,
      insufficientData: 0,
      averageDrift: 0.1,
      maxDrift: 0.1,
    },
    recommendations: [
      {
        band: 'HIGH' as const,
        recommendation: 'HIGH band shows slight underconfidence (drift: 0.100). This is informational only and requires human review. No automatic tuning should be performed.',
        severity: 'WARNING' as const,
        actionable: false as const,
      },
    ],
    version: '1.0.0',
  };
  
  it('should validate valid calibration', () => {
    const result = ConfidenceCalibrationSchema.safeParse(validCalibration);
    
    expect(result.success).toBe(true);
  });
  
  it('should reject invalid calibrationId (not 64 chars)', () => {
    const invalid = { ...validCalibration, calibrationId: 'abc' };
    
    const result = ConfidenceCalibrationSchema.safeParse(invalid);
    
    expect(result.success).toBe(false);
  });
  
  it('should reject invalid date', () => {
    const invalid = { ...validCalibration, startDate: 'invalid-date' };
    
    const result = ConfidenceCalibrationSchema.safeParse(invalid);
    
    expect(result.success).toBe(false);
  });
  
  it('should reject negative metrics', () => {
    const invalid = {
      ...validCalibration,
      driftAnalysis: { ...validCalibration.driftAnalysis, overconfident: -1 },
    };
    
    const result = ConfidenceCalibrationSchema.safeParse(invalid);
    
    expect(result.success).toBe(false);
  });
  
  it('should reject invalid accuracy (>1)', () => {
    const invalid = {
      ...validCalibration,
      bandCalibrations: [
        { ...validCalibration.bandCalibrations[0], accuracy: 1.5 },
      ],
    };
    
    const result = ConfidenceCalibrationSchema.safeParse(invalid);
    
    expect(result.success).toBe(false);
  });
  
  it('should allow empty band calibrations', () => {
    const valid = {
      ...validCalibration,
      bandCalibrations: [],
      recommendations: [],
    };
    
    const result = ConfidenceCalibrationSchema.safeParse(valid);
    
    expect(result.success).toBe(true);
  });
  
  it('should validate sampleSizeSufficient field', () => {
    const calibration = validCalibration.bandCalibrations[0];
    
    expect(calibration).toHaveProperty('sampleSizeSufficient');
    expect(typeof calibration.sampleSizeSufficient).toBe('boolean');
  });
  
  it('should validate actionable field is false', () => {
    const recommendation = validCalibration.recommendations[0];
    
    expect(recommendation).toHaveProperty('actionable');
    expect(recommendation.actionable).toBe(false);
  });
  
  it('should reject actionable = true', () => {
    const invalid = {
      ...validCalibration,
      recommendations: [
        { ...validCalibration.recommendations[0], actionable: true },
      ],
    };
    
    const result = ConfidenceCalibrationSchema.safeParse(invalid);
    
    expect(result.success).toBe(false);
  });
});
