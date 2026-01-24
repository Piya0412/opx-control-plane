/**
 * CP-6: Authority Schema & Trust Model
 * 
 * Defines authority types, trust boundaries, and permission model.
 * 
 * 🔒 INV-6.3: Explicit Authority Declaration
 * Every promotion request MUST include authority context.
 */

import { z } from 'zod';
import { AuthorityTypeSchema, type AuthorityType } from './promotion.schema.js';
import { CandidateSeverity } from '../candidate/candidate.schema.js';

// === AUTHORITY CONTEXT ===

export const AuthorityContextSchema = z.object({
  authorityType: AuthorityTypeSchema,
  authorityId: z.string().min(1), // e.g., 'auto-engine-v1', 'user:jane@example.com'
  sessionId: z.string().optional(), // for human operators
  justification: z.string().min(20).max(2048).optional(), // required for EMERGENCY_OVERRIDE
  timestamp: z.string().datetime(),
}).strict();

export type AuthorityContext = z.infer<typeof AuthorityContextSchema>;

// === TRUST LEVELS ===

export interface AuthorityTrustLevel {
  maxSeverity: CandidateSeverity;
  requiresPolicy: boolean;
  requiresJustification: boolean;
  description: string;
}

/**
 * Authority Trust Boundaries
 * 
 * Defines what each authority type is allowed to do.
 */
export const AUTHORITY_TRUST_LEVELS: Record<AuthorityType, AuthorityTrustLevel> = {
  AUTO_ENGINE: {
    maxSeverity: 'SEV3',
    requiresPolicy: true,
    requiresJustification: false,
    description: 'Policy-driven automatic promotion (limited to SEV3+)',
  },
  HUMAN_OPERATOR: {
    maxSeverity: 'SEV2',
    requiresPolicy: true,
    requiresJustification: false,
    description: 'Manual promotion by operator (limited to SEV2+)',
  },
  ON_CALL_SRE: {
    maxSeverity: 'SEV1',
    requiresPolicy: true,
    requiresJustification: false,
    description: 'On-call engineer promotion (all severities)',
  },
  EMERGENCY_OVERRIDE: {
    maxSeverity: 'SEV1',
    requiresPolicy: false,
    requiresJustification: true,
    description: 'Emergency override (requires justification, bypasses policy)',
  },
};

// === AUTHORITY VALIDATION ===

/**
 * Validate authority context structure
 * 
 * @param context - Authority context to validate
 * @returns Validation result
 */
export function validateAuthorityContext(context: unknown): {
  valid: boolean;
  reason?: string;
  context?: AuthorityContext;
} {
  const result = AuthorityContextSchema.safeParse(context);
  
  if (!result.success) {
    return {
      valid: false,
      reason: `Invalid authority context: ${result.error.message}`,
    };
  }

  const authorityContext = result.data;
  const trustLevel = AUTHORITY_TRUST_LEVELS[authorityContext.authorityType];

  // Check justification requirement
  if (trustLevel.requiresJustification && !authorityContext.justification) {
    return {
      valid: false,
      reason: `${authorityContext.authorityType} requires justification`,
    };
  }

  return {
    valid: true,
    context: authorityContext,
  };
}

/**
 * Check if authority can promote candidate of given severity
 * 
 * @param authorityType - Authority type
 * @param candidateSeverity - Candidate severity
 * @returns Permission check result
 */
export function checkAuthorityPermission(
  authorityType: AuthorityType,
  candidateSeverity: CandidateSeverity
): { allowed: boolean; reason?: string } {
  const trustLevel = AUTHORITY_TRUST_LEVELS[authorityType];
  
  // Severity order: SEV1 > SEV2 > SEV3 > SEV4
  const severityOrder: Record<CandidateSeverity, number> = {
    SEV1: 1,
    SEV2: 2,
    SEV3: 3,
    SEV4: 4,
  };

  const authorityMaxLevel = severityOrder[trustLevel.maxSeverity];
  const candidateLevel = severityOrder[candidateSeverity];

  if (candidateLevel < authorityMaxLevel) {
    return {
      allowed: false,
      reason: `${authorityType} cannot promote ${candidateSeverity} (max: ${trustLevel.maxSeverity})`,
    };
  }

  return { allowed: true };
}

/**
 * Get authority description
 * 
 * @param authorityType - Authority type
 * @returns Human-readable description
 */
export function getAuthorityDescription(authorityType: AuthorityType): string {
  return AUTHORITY_TRUST_LEVELS[authorityType].description;
}