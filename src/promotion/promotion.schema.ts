/**
 * Phase 3.3 & CP-6: Promotion Schema
 * 
 * Formal promotion decision representation.
 * 
 * INVARIANTS:
 * - Promotion decisions are deterministic
 * - evaluatedAt MUST be evidence.bundledAt
 * - Incident identity is evidence-derived
 * - Promotion store keyed by incidentId (not candidateId)
 */

import { z } from 'zod';
import { createHash } from 'crypto';

/**
 * Promotion Decision Type
 * 
 * Binary decision: PROMOTE or REJECT (no "maybe").
 */
export const PromotionDecisionTypeSchema = z.enum(['PROMOTE', 'REJECT']);

export type PromotionDecisionType = z.infer<typeof PromotionDecisionTypeSchema>;

// Legacy alias for Phase 3.3 compatibility
export const PromotionDecisionSchema = PromotionDecisionTypeSchema;

/**
 * Rejection Code
 * 
 * Machine-readable reason for rejection.
 */
export const RejectionCodeSchema = z.enum([
  'CONFIDENCE_TOO_LOW',        // Confidence < HIGH
  'INSUFFICIENT_DETECTIONS',   // < 2 detections
  'ACTIVE_INCIDENT_EXISTS',    // Duplicate incident
  'EVIDENCE_NOT_FOUND',        // Evidence missing
  'SERVICE_NOT_ALLOWED',       // Service not in allowlist
  'GATE_INTERNAL_ERROR',       // Unexpected failure
]);

export type RejectionCode = z.infer<typeof RejectionCodeSchema>;

/**
 * Evidence Window
 * 
 * Time window for audit/ops (non-logic).
 */
export const EvidenceWindowSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export type EvidenceWindow = z.infer<typeof EvidenceWindowSchema>;

/**
 * Promotion Result
 * 
 * Complete promotion decision with context.
 * 
 * CRITICAL RULES:
 * - evaluatedAt MUST be evidence.bundledAt (determinism)
 * - If PROMOTE → incidentId required
 * - If REJECT → rejectionReason + rejectionCode required
 */
export const PromotionResultSchema = z.object({
  // Decision
  decision: PromotionDecisionSchema,
  
  // If PROMOTE
  incidentId: z.string().length(64).optional(), // SHA256 hex
  
  // If REJECT
  rejectionReason: z.string().optional(),
  rejectionCode: RejectionCodeSchema.optional(),
  
  // Context
  candidateId: z.string().min(1),
  evidenceId: z.string().length(64),
  confidenceScore: z.number().min(0).max(1),
  confidenceBand: z.string().min(1),
  evidenceWindow: EvidenceWindowSchema,
  
  // Audit
  evaluatedAt: z.string().datetime(), // MUST be evidence.bundledAt
  gateVersion: z.string().min(1),
}).refine(
  (data) => {
    // If PROMOTE → incidentId required
    if (data.decision === 'PROMOTE' && !data.incidentId) {
      return false;
    }
    return true;
  },
  {
    message: 'incidentId required when decision is PROMOTE',
    path: ['incidentId'],
  }
).refine(
  (data) => {
    // If REJECT → rejectionReason + rejectionCode required
    if (data.decision === 'REJECT' && (!data.rejectionReason || !data.rejectionCode)) {
      return false;
    }
    return true;
  },
  {
    message: 'rejectionReason and rejectionCode required when decision is REJECT',
    path: ['rejectionReason'],
  }
);

export type PromotionResult = z.infer<typeof PromotionResultSchema>;

/**
 * Gate Version
 * 
 * Current promotion gate version.
 * Increment when conditions, thresholds, or logic changes.
 */
export const GATE_VERSION = 'v1.0.0';

/**
 * Promotion Conditions (v1.0.0)
 * 
 * All conditions must be true for PROMOTE.
 */
export const PROMOTION_CONDITIONS = {
  // Confidence threshold
  minConfidenceBand: 'HIGH',
  minConfidenceScore: 0.6,
  
  // Detection requirements
  minDetections: 2,
  minUniqueRules: 1,
} as const;

/**
 * CRITICAL: evaluatedAt MUST use evidence.bundledAt
 * 
 * ❌ WRONG: evaluatedAt: new Date().toISOString()
 * ✅ CORRECT: evaluatedAt: evidence.bundledAt
 * 
 * Rationale: Promotion decisions are derived facts, not momentary events.
 * Using Date.now() violates P3-I3 (Deterministic Decisions).
 * Replay must produce byte-for-byte identical PromotionResult.
 */

// ============================================================================
// CP-6: Promotion Request & Decision Schema (Phase 4)
// ============================================================================

/**
 * Authority Types
 */
export const AuthorityTypeSchema = z.enum([
  'HUMAN_OPERATOR',
  'ON_CALL_SRE',
  'EMERGENCY_OVERRIDE',
  'AUTOMATED_SYSTEM',
]);

export type AuthorityType = z.infer<typeof AuthorityTypeSchema>;

/**
 * Promotion Request
 * 
 * Request to evaluate a candidate for promotion to incident.
 */
export const PromotionRequestSchema = z.object({
  requestId: z.string().uuid(),
  candidateId: z.string().length(64),
  policyId: z.string().min(1),
  policyVersion: z.string().min(1),
  authorityType: AuthorityTypeSchema,
  authorityId: z.string().min(1),
  requestContextHash: z.string().length(64),
  requestedAt: z.string().datetime(),
  justification: z.string().optional(),
  sessionId: z.string().optional(),
});

export type PromotionRequest = z.infer<typeof PromotionRequestSchema>;

/**
 * Promotion Request With Validation
 * 
 * Adds validation rules for specific authority types.
 */
export const PromotionRequestWithValidationSchema = PromotionRequestSchema.refine(
  (data) => {
    // EMERGENCY_OVERRIDE requires justification
    if (data.authorityType === 'EMERGENCY_OVERRIDE' && !data.justification) {
      return false;
    }
    return true;
  },
  {
    message: 'EMERGENCY_OVERRIDE requires justification',
    path: ['justification'],
  }
);

/**
 * Promotion Decision
 * 
 * Complete promotion decision with audit trail.
 */
export const PromotionDecisionFullSchema = z.object({
  decisionId: z.string().length(64),
  requestId: z.string().uuid(),
  candidateId: z.string().length(64),
  decision: PromotionDecisionTypeSchema,
  reason: z.string().min(1),
  policyId: z.string().min(1),
  policyVersion: z.string().min(1),
  authorityType: AuthorityTypeSchema,
  authorityId: z.string().min(1),
  decidedAt: z.string().datetime(),
  decisionHash: z.string().length(64),
  justification: z.string().optional(),
  sessionId: z.string().optional(),
});

export type PromotionDecision = z.infer<typeof PromotionDecisionFullSchema>;

/**
 * Promotion Audit Record
 * 
 * Immutable audit record of promotion decision.
 */
export const PromotionAuditRecordSchema = z.object({
  auditId: z.string().uuid(),
  decisionId: z.string().length(64),
  requestId: z.string().uuid(),
  candidateId: z.string().length(64),
  decision: PromotionDecisionTypeSchema,
  reason: z.string().min(1),
  policyId: z.string().min(1),
  policyVersion: z.string().min(1),
  authorityType: AuthorityTypeSchema,
  authorityId: z.string().min(1),
  decidedAt: z.string().datetime(),
  policySnapshot: z.string().min(1),
  inputSnapshot: z.string().min(1),
  auditedAt: z.string().datetime(),
});

export type PromotionAuditRecord = z.infer<typeof PromotionAuditRecordSchema>;

/**
 * Promotion Version
 * 
 * Current promotion system version.
 */
export const PROMOTION_VERSION = 'v1.0.0';

/**
 * Compute Decision ID
 * 
 * Deterministic decision identity (excludes authorityId per CORRECTION 1).
 * 
 * @param candidateId - Candidate ID
 * @param policyId - Policy ID
 * @param policyVersion - Policy version
 * @param requestContextHash - Request context hash
 * @returns Decision ID (SHA-256 hex)
 */
export function computeDecisionId(
  candidateId: string,
  policyId: string,
  policyVersion: string,
  requestContextHash: string
): string {
  const input = `${candidateId}:${policyId}:${policyVersion}:${requestContextHash}`;
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Compute Decision Hash
 * 
 * Deterministic hash of decision outcome.
 * 
 * @param decision - Decision type
 * @param reason - Decision reason
 * @param policyVersion - Policy version
 * @param candidateId - Candidate ID
 * @returns Decision hash (SHA-256 hex)
 */
export function computeDecisionHash(
  decision: PromotionDecisionType,
  reason: string,
  policyVersion: string,
  candidateId: string
): string {
  const input = `${decision}:${reason}:${policyVersion}:${candidateId}`;
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Compute Request Context Hash
 * 
 * Deterministic hash of request context.
 * 
 * @param candidateId - Candidate ID
 * @param policyId - Policy ID
 * @param policyVersion - Policy version
 * @returns Request context hash (SHA-256 hex)
 */
export function computeRequestContextHash(
  candidateId: string,
  policyId: string,
  policyVersion: string
): string {
  const input = `${candidateId}:${policyId}:${policyVersion}`;
  return createHash('sha256').update(input).digest('hex');
}
