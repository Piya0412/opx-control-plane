/**
 * CP-6: Promotion Policy Schema
 * 
 * Defines the promotion policy DSL for deterministic decision making.
 * 
 * Policies are:
 * - Static (loaded from filesystem)
 * - Versioned (immutable once deployed)
 * - Deterministic (same inputs → same decision)
 */

import { z } from 'zod';
import { AuthorityTypeSchema, type AuthorityType } from './promotion.schema.js';
import { CandidateConfidenceSchema, CandidateSeveritySchema, BlastRadiusScopeSchema } from '../candidate/candidate.schema.js';

// === POLICY ELIGIBILITY ===

export const PolicyEligibilitySchema = z.object({
  // Minimum confidence required
  minConfidence: CandidateConfidenceSchema,
  
  // Allowed severities for this policy
  allowedSeverities: z.array(CandidateSeveritySchema).min(1),
  
  // Minimum number of detections required
  minDetections: z.number().int().positive(),
  
  // Maximum age of candidate in minutes
  maxAgeMinutes: z.number().int().positive(),
  
  // Required blast radius scope (optional)
  requiredBlastRadiusScope: z.array(BlastRadiusScopeSchema).optional(),
}).strict();

export type PolicyEligibility = z.infer<typeof PolicyEligibilitySchema>;

// === AUTHORITY RESTRICTIONS ===

export const SeverityOverrideSchema = z.record(
  CandidateSeveritySchema,
  z.array(AuthorityTypeSchema)
);

export const AuthorityRestrictionsSchema = z.object({
  // Allowed authority types for this policy
  allowedAuthorities: z.array(AuthorityTypeSchema).min(1),
  
  // Severity-specific authority overrides
  severityOverrides: SeverityOverrideSchema.optional(),
}).strict();

export type AuthorityRestrictions = z.infer<typeof AuthorityRestrictionsSchema>;

// === DEFERRAL CONDITIONS ===

export const DeferralConditionsSchema = z.object({
  // Defer if there's already an active incident for the same service
  pendingIncidentForService: z.boolean(),
  
  // Cooldown period in minutes (defer if recent promotion for same correlation)
  cooldownMinutes: z.number().int().nonnegative(),
}).strict();

export type DeferralConditions = z.infer<typeof DeferralConditionsSchema>;

// === REJECTION CONDITIONS ===

export const RejectionConditionsSchema = z.object({
  // Reject if candidate was already promoted
  duplicateCandidate: z.boolean(),
  
  // Reject if candidate is too old
  staleCandidate: z.boolean(),
  
  // Reject if candidate has insufficient evidence
  insufficientEvidence: z.boolean(),
}).strict();

export type RejectionConditions = z.infer<typeof RejectionConditionsSchema>;

// === PROMOTION POLICY ===

export const PromotionPolicySchema = z.object({
  // Policy identity
  id: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver format'),
  description: z.string().min(1),
  
  // Policy rules
  eligibility: PolicyEligibilitySchema,
  authorityRestrictions: AuthorityRestrictionsSchema,
  deferralConditions: DeferralConditionsSchema,
  rejectionConditions: RejectionConditionsSchema,
}).strict();

export type PromotionPolicy = z.infer<typeof PromotionPolicySchema>;

// === POLICY VALIDATION ===

/**
 * Validate promotion policy
 * 
 * @param raw - Raw policy data
 * @returns Validation result
 */
export function validatePromotionPolicy(raw: unknown): {
  valid: boolean;
  policy?: PromotionPolicy;
  errors?: string[];
} {
  const result = PromotionPolicySchema.safeParse(raw);
  
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
    };
  }

  const policy = result.data;

  // Additional business logic validation
  const businessErrors: string[] = [];

  // Check that severity overrides only reference allowed authorities
  if (policy.authorityRestrictions.severityOverrides) {
    for (const [severity, authorities] of Object.entries(policy.authorityRestrictions.severityOverrides)) {
      for (const authority of authorities) {
        if (!policy.authorityRestrictions.allowedAuthorities.includes(authority)) {
          businessErrors.push(
            `severityOverrides.${severity}: authority '${authority}' not in allowedAuthorities`
          );
        }
      }
    }
  }

  // Check that allowed severities are consistent with eligibility
  if (policy.eligibility.allowedSeverities.length === 0) {
    businessErrors.push('eligibility.allowedSeverities: must have at least one severity');
  }

  if (businessErrors.length > 0) {
    return {
      valid: false,
      errors: businessErrors,
    };
  }

  return {
    valid: true,
    policy,
  };
}

/**
 * Get policy key for storage/lookup
 * 
 * @param policyId - Policy ID
 * @param version - Policy version
 * @returns Policy key
 */
export function getPolicyKey(policyId: string, version: string): string {
  return `${policyId}.v${version}`;
}

/**
 * Default promotion policy for testing
 */
export const DEFAULT_POLICY: PromotionPolicy = {
  id: 'default',
  version: '1.0.0',
  description: 'Default promotion policy',
  eligibility: {
    minConfidence: 'HIGH',
    allowedSeverities: ['SEV1', 'SEV2', 'SEV3', 'SEV4'],
    minDetections: 1,
    maxAgeMinutes: 60,
  },
  authorityRestrictions: {
    allowedAuthorities: ['AUTO_ENGINE', 'HUMAN_OPERATOR', 'ON_CALL_SRE', 'EMERGENCY_OVERRIDE'],
  },
  deferralConditions: {
    pendingIncidentForService: false,
    cooldownMinutes: 0,
  },
  rejectionConditions: {
    duplicateCandidate: true,
    staleCandidate: true,
    insufficientEvidence: true,
  },
};
