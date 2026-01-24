/**
 * Phase 4 - Step 5: Confidence Calibration Schema
 * 
 * Compare predicted confidence vs actual outcomes.
 * 
 * CRITICAL RULES:
 * - calibrationId is DETERMINISTIC (SHA256, not UUID)
 * - Sample size guard (MIN_SAMPLES_PER_BAND = 20)
 * - Recommendations are NON-ACTIONABLE (actionable = false, locked)
 */

import { z } from 'zod';

/**
 * Confidence Band
 * 
 * Predicted confidence ranges.
 */
export const ConfidenceBandSchema = z.enum([
  'VERY_LOW',   // 0.0 - 0.2
  'LOW',        // 0.2 - 0.4
  'MEDIUM',     // 0.4 - 0.6
  'HIGH',       // 0.6 - 0.8
  'VERY_HIGH',  // 0.8 - 1.0
]);

export type ConfidenceBand = z.infer<typeof ConfidenceBandSchema>;

/**
 * Band Calibration Data
 * 
 * Calibration metrics for a single confidence band.
 * 
 * CRITICAL: Includes sample size sufficiency guard.
 */
export const BandCalibrationSchema = z.object({
  band: ConfidenceBandSchema,
  totalIncidents: z.number().nonnegative(),
  truePositives: z.number().nonnegative(),
  falsePositives: z.number().nonnegative(),
  accuracy: z.number().min(0).max(1), // TP / (TP + FP)
  expectedAccuracy: z.number().min(0).max(1), // Midpoint of band
  drift: z.number(), // accuracy - expectedAccuracy
  sampleSizeSufficient: z.boolean(), // totalIncidents >= MIN_SAMPLES_PER_BAND
});

/**
 * Drift Analysis
 * 
 * Overall drift metrics.
 */
export const DriftAnalysisSchema = z.object({
  overconfident: z.number().nonnegative(), // Count of bands with negative drift
  underconfident: z.number().nonnegative(), // Count of bands with positive drift
  wellCalibrated: z.number().nonnegative(), // Count of bands with |drift| < 0.05
  insufficientData: z.number().nonnegative(), // Count of bands with insufficient samples
  averageDrift: z.number(), // Average drift across all bands with sufficient data
  maxDrift: z.number(), // Maximum absolute drift
});

/**
 * Calibration Recommendation
 * 
 * Read-only, non-actionable recommendation.
 * 
 * CRITICAL: Recommendations are advisory only. No automatic changes.
 */
export const CalibrationRecommendationSchema = z.object({
  band: ConfidenceBandSchema,
  recommendation: z.string(),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']),
  actionable: z.literal(false), // LOCKED: Always false (no automatic action)
});

/**
 * Confidence Calibration
 * 
 * Complete calibration record.
 * 
 * CRITICAL: calibrationId is DETERMINISTIC (not UUID).
 * calibrationId = SHA256(startDate + ":" + endDate + ":" + version)
 */
export const ConfidenceCalibrationSchema = z.object({
  calibrationId: z.string().length(64), // SHA256 hex (deterministic)
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  generatedAt: z.string().datetime(),
  bandCalibrations: z.array(BandCalibrationSchema),
  driftAnalysis: DriftAnalysisSchema,
  recommendations: z.array(CalibrationRecommendationSchema),
  version: z.string().min(1),
});

// Export types
export type BandCalibration = z.infer<typeof BandCalibrationSchema>;
export type DriftAnalysis = z.infer<typeof DriftAnalysisSchema>;
export type CalibrationRecommendation = z.infer<typeof CalibrationRecommendationSchema>;
export type ConfidenceCalibration = z.infer<typeof ConfidenceCalibrationSchema>;
