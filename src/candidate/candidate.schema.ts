/**
 * CP-5: Incident Candidate Schema
 * 
 * IncidentCandidate is a RECOMMENDATION to create an incident.
 * NOT an incident. A candidate that MAY become an incident.
 * 
 * INVARIANTS:
 * - Candidate ≠ Incident (sacred separation)
 * - Deterministic (same inputs → same candidate)
 * - Replayable (can rebuild from source entities)
 * - No side effects (read-only consumer of upstream)
 * - Candidates may be regenerated, replayed, or discarded without side effects
 * 
 * 🔒 HARDENING #1: candidateId independent of rule iteration order
 * 🔒 FIX-A: keyFields MUST be included in correlation key
 */

import { z } from 'zod';
import { createHash } from 'crypto';

// === CONFIDENCE ===

export const CandidateConfidenceSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);
export type CandidateConfidence = z.infer<typeof CandidateConfidenceSchema>;

export const ConfidenceFactorSchema = z.object({
  factor: z.string().min(1),
  weight: z.number().min(0).max(1),
  evidence: z.string().min(1),
}).strict();

export type ConfidenceFactor = z.infer<typeof ConfidenceFactorSchema>;

// === BLAST RADIUS ===

export const BlastRadiusScopeSchema = z.enum([
  'SINGLE_SERVICE',
  'MULTI_SERVICE',
  'INFRASTRUCTURE',
]);

export type BlastRadiusScope = z.infer<typeof BlastRadiusScopeSchema>;

export const BlastRadiusImpactSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type BlastRadiusImpact = z.infer<typeof BlastRadiusImpactSchema>;

export const BlastRadiusSchema = z.object({
  scope: BlastRadiusScopeSchema,
  affectedServices: z.array(z.string()).max(50),
  affectedResources: z.array(z.string()).max(20),
  estimatedImpact: BlastRadiusImpactSchema,
}).strict();

export type BlastRadius = z.infer<typeof BlastRadiusSchema>;

// === GENERATION TRACE ===

export const GenerationStepSchema = z.object({
  step: z.number().int().positive(),
  action: z.string().min(1),
  input: z.string(),
  output: z.string(),
  rule: z.string().optional(),
}).strict();

export type GenerationStep = z.infer<typeof GenerationStepSchema>;

// === SEVERITY ===

export const CandidateSeveritySchema = z.enum(['SEV1', 'SEV2', 'SEV3', 'SEV4']);
export type CandidateSeverity = z.infer<typeof CandidateSeveritySchema>;

// === INCIDENT CANDIDATE ===

export const IncidentCandidateSchema = z.object({
  // Identity (deterministic)
  candidateId: z.string().length(64),
  candidateVersion: z.string().min(1),

  // Correlation
  correlationKey: z.string().length(64),
  correlationRule: z.string().min(1),
  correlationRuleVersion: z.string().min(1),

  // Promotion policy (Phase 2.3)
  policyId: z.string().min(1),
  policyVersion: z.string().regex(/^\d+\.\d+\.\d+$/), // Semver

  // Evidence chain
  evidenceGraphIds: z.array(z.string()).min(1).max(100),
  detectionIds: z.array(z.string()).min(1).max(100),
  primaryDetectionId: z.string().min(1),

  // Classification
  suggestedSeverity: CandidateSeveritySchema,
  suggestedService: z.string().min(1),
  suggestedTitle: z.string().max(200),

  // Confidence
  confidence: CandidateConfidenceSchema,
  confidenceFactors: z.array(ConfidenceFactorSchema).max(10),

  // Blast radius
  blastRadius: BlastRadiusSchema,

  // Trace
  generationTrace: z.array(GenerationStepSchema).max(20),

  // Window
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),

  // Metadata (NOT part of deterministic identity)
  createdAt: z.string().datetime(),
}).strict();

export type IncidentCandidate = z.infer<typeof IncidentCandidateSchema>;

// === CONSTANTS ===

export const CANDIDATE_VERSION = 'v1';
export const MAX_DETECTIONS_PER_CANDIDATE = 100;
export const MAX_TRACE_STEPS = 20;

// === RESOLVED KEY FIELDS ===

/**
 * Resolved key fields from rule evaluation
 * 
 * 🔒 FIX-A: keyFields MUST affect correlation key
 */
export interface ResolvedKeyFields {
  service?: string;
  source?: string;
  ruleId?: string;
  signalType?: string;
  windowTruncated: string;
}

// === DETERMINISTIC ID COMPUTATION ===

/**
 * Compute deterministic candidate ID
 * 
 * 🔒 INVARIANT: Same correlationKey + same version → same candidateId
 * 
 * @param correlationKey - Correlation key
 * @param candidateVersion - Candidate schema version
 * @returns Deterministic candidate ID (SHA256 hex)
 */
export function computeCandidateId(
  correlationKey: string,
  candidateVersion: string
): string {
  const input = `${correlationKey}|${candidateVersion}`;
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Compute correlation key from detections
 * 
 * 🔒 INVARIANT: Same detections + same rule + same keyFields → same key
 * 🔒 HARDENING #1: Independent of processing order (sorted)
 * 🔒 FIX-A: keyFields MUST be included in correlation key
 * 
 * @param detectionIds - Detection IDs to correlate
 * @param correlationRuleId - Correlation rule ID
 * @param correlationRuleVersion - Correlation rule version
 * @param resolvedKeyFields - Resolved key field values
 * @returns Deterministic correlation key (SHA256 hex)
 */
export function computeCorrelationKey(
  detectionIds: string[],
  correlationRuleId: string,
  correlationRuleVersion: string,
  resolvedKeyFields: ResolvedKeyFields
): string {
  // Sort detection IDs for order-independence
  const sortedIds = [...detectionIds].sort().join('|');

  // 🔒 FIX-A: Serialize keyFields in deterministic order
  const keyFieldParts: string[] = [];
  if (resolvedKeyFields.service !== undefined) {
    keyFieldParts.push(`service=${resolvedKeyFields.service}`);
  }
  if (resolvedKeyFields.source !== undefined) {
    keyFieldParts.push(`source=${resolvedKeyFields.source}`);
  }
  if (resolvedKeyFields.ruleId !== undefined) {
    keyFieldParts.push(`ruleId=${resolvedKeyFields.ruleId}`);
  }
  if (resolvedKeyFields.signalType !== undefined) {
    keyFieldParts.push(`signalType=${resolvedKeyFields.signalType}`);
  }
  keyFieldParts.push(`windowTruncated=${resolvedKeyFields.windowTruncated}`);

  const serializedKeyFields = keyFieldParts.sort().join('&');

  const input = `${sortedIds}|${correlationRuleId}|${correlationRuleVersion}|${serializedKeyFields}`;
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Validate incident candidate
 * 
 * Strict parsing - fails fast on unknown fields.
 */
export function parseIncidentCandidate(data: unknown): IncidentCandidate {
  return IncidentCandidateSchema.parse(data);
}
