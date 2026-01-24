/**
 * Phase 3.3: Promotion Module Exports
 */

// Schema
export {
  PromotionResult,
  PromotionResultSchema,
  PromotionDecision,
  PromotionDecisionSchema,
  RejectionCode,
  RejectionCodeSchema,
  EvidenceWindow,
  EvidenceWindowSchema,
  GATE_VERSION,
  PROMOTION_CONDITIONS,
} from './promotion.schema.js';

// Identity
export {
  computeIncidentId,
} from './incident-identity.js';

// Active Incident Check
export {
  ActiveIncidentChecker,
} from './active-incident-checker.js';

// Promotion Gate
export {
  PromotionGate,
} from './promotion-gate.js';

// Promotion Store
export {
  PromotionStore,
} from './promotion-store.js';
