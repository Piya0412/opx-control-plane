/**
 * CP-5: Incident Candidate Generator
 * 
 * Module exports for candidate generation.
 */

// Schema
export {
  IncidentCandidate,
  IncidentCandidateSchema,
  CandidateConfidence,
  CandidateConfidenceSchema,
  ConfidenceFactor,
  ConfidenceFactorSchema,
  BlastRadius,
  BlastRadiusSchema,
  BlastRadiusScope,
  BlastRadiusScopeSchema,
  BlastRadiusImpact,
  BlastRadiusImpactSchema,
  GenerationStep,
  GenerationStepSchema,
  CandidateSeverity,
  CandidateSeveritySchema,
  ResolvedKeyFields,
  CANDIDATE_VERSION,
  MAX_DETECTIONS_PER_CANDIDATE,
  MAX_TRACE_STEPS,
  computeCandidateId,
  computeCorrelationKey,
  parseIncidentCandidate,
} from './candidate.schema.js';

// Correlation Rule Schema
export {
  CorrelationRule,
  CorrelationRuleSchema,
  CorrelationMatcher,
  CorrelationMatcherSchema,
  ConfidenceBoost,
  ConfidenceBoostSchema,
  KeyField,
  KeyFieldSchema,
  WindowTruncation,
  WindowTruncationSchema,
  PrimarySelection,
  PrimarySelectionSchema,
  parseCorrelationRule,
} from './correlation-rule.schema.js';

// Rule Loader
export {
  CorrelationRuleLoader,
  FileCorrelationRuleLoader,
  InMemoryCorrelationRuleLoader,
} from './correlation-rule-loader.js';

// Builder
export { CandidateBuilder, CandidateBuilderInput } from './candidate-builder.js';

// Store
export {
  CandidateStore,
  CandidateStoreConfig,
  CandidateStoreResult,
} from './candidate-store.js';

// Generator
export {
  CandidateGenerator,
  CandidateGeneratorConfig,
  GenerationResult,
  NormalizedSignalStore,
} from './candidate-generator.js';
