/**
 * Phase 3.2: Confidence Model Schema
 * 
 * Formal confidence assessment representation.
 * 
 * INVARIANTS:
 * - Confidence scores are deterministic
 * - Band ↔ score consistency enforced
 * - All factors in [0, 1]
 * - Weights sum to 1.0
 */

import { z } from 'zod';

/**
 * Confidence Band
 * 
 * Categorical representation of confidence level.
 */
export const ConfidenceBandSchema = z.enum([
  'LOW',      // 0.0 - 0.4: Insufficient evidence
  'MEDIUM',   // 0.4 - 0.6: Moderate confidence (reject - conservative)
  'HIGH',     // 0.6 - 0.8: Strong evidence (promote)
  'CRITICAL', // 0.8 - 1.0: Overwhelming evidence (promote immediately)
]);

export type ConfidenceBand = z.infer<typeof ConfidenceBandSchema>;

/**
 * Factor Contribution
 * 
 * Individual factor's contribution to confidence score.
 */
export const FactorContributionSchema = z.object({
  value: z.number().min(0).max(1),        // Normalized factor value [0, 1]
  contribution: z.number().min(0).max(1), // Weighted contribution [0, 1]
  weight: z.number().min(0).max(1),       // Factor weight [0, 1]
});

export type FactorContribution = z.infer<typeof FactorContributionSchema>;

/**
 * Factor Breakdown
 * 
 * Detailed breakdown of all confidence factors.
 */
export const FactorBreakdownSchema = z.object({
  detectionCount: FactorContributionSchema,
  severityScore: FactorContributionSchema,
  ruleDiversity: FactorContributionSchema,
  temporalDensity: FactorContributionSchema,
  signalVolume: FactorContributionSchema,
});

export type FactorBreakdown = z.infer<typeof FactorBreakdownSchema>;

/**
 * Candidate Assessment
 * 
 * Complete confidence assessment for a candidate.
 * 
 * CRITICAL RULES:
 * - assessedAt MUST be evidence.bundledAt (determinism)
 * - confidenceBand MUST match confidenceScore range
 * - All factor weights MUST sum to 1.0
 */
export const CandidateAssessmentSchema = z.object({
  // Numeric Score
  confidenceScore: z.number().min(0).max(1),
  
  // Categorical Band
  confidenceBand: ConfidenceBandSchema,
  
  // Explainability
  reasons: z.array(z.string()).min(1),
  
  // Factor Breakdown
  factors: FactorBreakdownSchema,
  
  // Audit
  assessedAt: z.string().datetime(),  // MUST be evidence.bundledAt
  modelVersion: z.string().min(1),    // e.g., "v1.0.0"
}).refine(
  (data) => {
    // Enforce band ↔ score consistency
    const { confidenceScore, confidenceBand } = data;
    
    if (confidenceBand === 'LOW' && (confidenceScore < 0.0 || confidenceScore >= 0.4)) {
      return false;
    }
    if (confidenceBand === 'MEDIUM' && (confidenceScore < 0.4 || confidenceScore >= 0.6)) {
      return false;
    }
    if (confidenceBand === 'HIGH' && (confidenceScore < 0.6 || confidenceScore >= 0.8)) {
      return false;
    }
    if (confidenceBand === 'CRITICAL' && (confidenceScore < 0.8 || confidenceScore > 1.0)) {
      return false;
    }
    
    return true;
  },
  {
    message: 'confidenceBand must match confidenceScore range',
    path: ['confidenceBand'],
  }
).refine(
  (data) => {
    // Enforce weights sum to 1.0 (with floating point tolerance)
    const { factors } = data;
    const weightSum = 
      factors.detectionCount.weight +
      factors.severityScore.weight +
      factors.ruleDiversity.weight +
      factors.temporalDensity.weight +
      factors.signalVolume.weight;
    
    // Allow 0.001 tolerance for floating point arithmetic
    return Math.abs(weightSum - 1.0) < 0.001;
  },
  {
    message: 'Factor weights must sum to 1.0',
    path: ['factors'],
  }
);

export type CandidateAssessment = z.infer<typeof CandidateAssessmentSchema>;

/**
 * Model Version
 * 
 * Current confidence model version.
 * Increment when weights, formulas, or bands change.
 */
export const CONFIDENCE_MODEL_VERSION = 'v1.0.0';

/**
 * Factor Weights (v1.0.0)
 * 
 * Importance of each factor in confidence calculation.
 * MUST sum to 1.0.
 */
export const FACTOR_WEIGHTS = {
  detectionCount: 0.30,   // Most important
  severityScore: 0.25,    // Very important
  ruleDiversity: 0.20,    // Important
  temporalDensity: 0.15,  // Moderately important
  signalVolume: 0.10,     // Least important
} as const;

/**
 * Confidence Band Thresholds
 * 
 * Score ranges for each band.
 */
export const CONFIDENCE_THRESHOLDS = {
  LOW: { min: 0.0, max: 0.4 },
  MEDIUM: { min: 0.4, max: 0.6 },
  HIGH: { min: 0.6, max: 0.8 },
  CRITICAL: { min: 0.8, max: 1.0 },
} as const;

/**
 * Promotion Threshold
 * 
 * Minimum confidence score required for promotion to incident.
 */
export const PROMOTION_THRESHOLD = 0.6; // HIGH band minimum
