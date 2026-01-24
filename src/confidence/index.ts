/**
 * Phase 3.2: Confidence Module Exports
 */

// Schema
export {
  CandidateAssessment,
  CandidateAssessmentSchema,
  ConfidenceBand,
  ConfidenceBandSchema,
  FactorContribution,
  FactorContributionSchema,
  FactorBreakdown,
  FactorBreakdownSchema,
  CONFIDENCE_MODEL_VERSION,
  FACTOR_WEIGHTS,
  CONFIDENCE_THRESHOLDS,
  PROMOTION_THRESHOLD,
} from './confidence.schema.js';

// Calculator
export {
  ConfidenceCalculator,
} from './confidence-calculator.js';

// Factors
export {
  computeDetectionCountScore,
  computeSeverityScore,
  computeRuleDiversityScore,
  computeTemporalDensityScore,
  computeSignalVolumeScore,
} from './confidence-factors.js';
