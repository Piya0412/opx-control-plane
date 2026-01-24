/**
 * Phase 3.4: Incident Entity & Lifecycle - Schema
 * 
 * Defines the authoritative incident entity and state machine.
 * 
 * CRITICAL DESIGN RULES:
 * - Incident identity: SHA256(service + evidenceId) - LOCKED from Phase 3.3
 * - Creation timestamps: DERIVED from promotionResult.evaluatedAt (not Date.now())
 * - Human transition timestamps: Real-time allowed
 * - Severity: DERIVED from evidence (max severity)
 */

import { z } from 'zod';

/**
 * Incident State Machine
 * 
 * States:
 *   OPEN          → Initial state after promotion
 *   ACKNOWLEDGED  → Human has seen it
 *   MITIGATING    → Actively working on fix
 *   RESOLVED      → Issue fixed, monitoring
 *   CLOSED        → Incident complete (terminal)
 * 
 * Valid Transitions:
 *   OPEN → ACKNOWLEDGED
 *   OPEN → MITIGATING
 *   ACKNOWLEDGED → MITIGATING
 *   MITIGATING → RESOLVED
 *   RESOLVED → CLOSED
 * 
 * Forbidden:
 *   OPEN → RESOLVED (must mitigate first for high severity)
 *   RESOLVED → OPEN (no reopening)
 *   CLOSED → * (terminal state)
 */
export const IncidentStateSchema = z.enum([
  'OPEN',
  'ACKNOWLEDGED',
  'MITIGATING',
  'RESOLVED',
  'CLOSED',
]);

export type IncidentState = z.infer<typeof IncidentStateSchema>;

/**
 * Authority Levels
 * 
 * Defines who/what can perform actions on incidents.
 */
export const AuthoritySchema = z.object({
  type: z.enum([
    'AUTO_ENGINE',        // Automated promotion gate
    'HUMAN_OPERATOR',     // Human operator
    'ON_CALL_SRE',        // On-call SRE
    'EMERGENCY_OVERRIDE', // Emergency override
  ]),
  principal: z.string(), // AWS principal ARN or identifier
});

export type Authority = z.infer<typeof AuthoritySchema>;

/**
 * Normalized Severity (from Phase 3.1)
 */
export const NormalizedSeveritySchema = z.enum([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'INFO',
]);

export type NormalizedSeverity = z.infer<typeof NormalizedSeveritySchema>;

/**
 * Incident Entity
 * 
 * The authoritative incident record.
 * 
 * CRITICAL TIMESTAMP RULES:
 * - createdAt: DERIVED from promotionResult.evaluatedAt (not Date.now())
 * - lastModifiedAt (on creation): DERIVED from promotionResult.evaluatedAt
 * - openedAt, acknowledgedAt, mitigatedAt, resolvedAt, closedAt: Real-time (human transitions)
 * - lastModifiedAt (on transitions): Real-time (transition timestamp)
 * 
 * CORRECTION 3: Simplified state machine (removed ACKNOWLEDGED)
 * CORRECTION 4: Resolution metadata required for RESOLVED state
 */
export const IncidentSchema = z.object({
  // Identity (deterministic from Phase 3.3)
  incidentId: z.string().length(64), // SHA256 hex
  
  // Context
  service: z.string().min(1),
  severity: NormalizedSeveritySchema, // DERIVED from evidence
  classification: z.string().min(1).optional(), // From candidate (optional)
  
  // State
  state: IncidentStateSchema,
  
  // Evidence
  evidenceId: z.string().length(64),
  candidateId: z.string().length(64),
  decisionId: z.string().length(64).optional(), // Optional for backward compatibility
  confidenceScore: z.number().min(0).max(1),
  
  // Lifecycle Timestamps (ISO-8601)
  // CRITICAL: createdAt is DERIVED (not real-time)
  createdAt: z.string().datetime(),
  openedAt: z.string().datetime().optional(),
  mitigatedAt: z.string().datetime().optional(),
  resolvedAt: z.string().datetime().optional(),
  closedAt: z.string().datetime().optional(),
  
  // Resolution (CORRECTION 4: Required for RESOLVED state)
  resolution: z.object({
    summary: z.string().min(1),
    resolutionType: z.enum(['MITIGATED', 'FALSE_POSITIVE', 'DUPLICATE', 'WONT_FIX']),
    resolvedBy: z.string().min(1),
  }).optional(),
  
  // Metadata
  title: z.string().min(1),
  description: z.string(),
  tags: z.array(z.string()).default([]),
  
  // Audit
  createdBy: AuthoritySchema,
  lastModifiedAt: z.string().datetime(),
  lastModifiedBy: AuthoritySchema,
});

export type Incident = z.infer<typeof IncidentSchema>;

/**
 * Resolution Metadata Schema
 * 
 * Required when transitioning to RESOLVED state.
 */
export const ResolutionMetadataSchema = z.object({
  summary: z.string().min(1),
  resolutionType: z.enum(['MITIGATED', 'FALSE_POSITIVE', 'DUPLICATE', 'WONT_FIX']),
  resolvedBy: z.string().min(1),
});

export type ResolutionMetadata = z.infer<typeof ResolutionMetadataSchema>;

/**
 * Transition Metadata
 * 
 * Additional context for state transitions.
 */
export const TransitionMetadataSchema = z.object({
  reason: z.string().optional(),
  notes: z.string().optional(),
  runbookUrl: z.string().url().optional(),
  ticketUrl: z.string().url().optional(),
}).passthrough(); // Allow additional fields

export type TransitionMetadata = z.infer<typeof TransitionMetadataSchema>;

/**
 * Transition Validation Result
 */
export interface TransitionValidation {
  allowed: boolean;
  reason?: string;
  requiredAuthority?: Authority['type'];
  requiredMetadata?: string[];
}

/**
 * State Transition Rules
 * 
 * Defines valid transitions and their requirements.
 */
export const STATE_TRANSITION_RULES: Record<
  IncidentState,
  Partial<Record<IncidentState, {
    minAuthority: Authority['type'];
    requiredMetadata?: string[];
  }>>
> = {
  OPEN: {
    ACKNOWLEDGED: {
      minAuthority: 'HUMAN_OPERATOR',
    },
    MITIGATING: {
      minAuthority: 'HUMAN_OPERATOR',
    },
  },
  ACKNOWLEDGED: {
    MITIGATING: {
      minAuthority: 'HUMAN_OPERATOR',
    },
  },
  MITIGATING: {
    RESOLVED: {
      minAuthority: 'ON_CALL_SRE', // Higher authority for resolution
      requiredMetadata: ['reason'], // Must explain resolution
    },
  },
  RESOLVED: {
    CLOSED: {
      minAuthority: 'HUMAN_OPERATOR',
    },
  },
  CLOSED: {
    // Terminal state - no transitions allowed
  },
};

/**
 * Authority Level Hierarchy
 * 
 * Higher number = more authority
 */
export const AUTHORITY_LEVELS: Record<Authority['type'], number> = {
  AUTO_ENGINE: 0,
  HUMAN_OPERATOR: 1,
  ON_CALL_SRE: 2,
  EMERGENCY_OVERRIDE: 999,
};

/**
 * Check if authority is sufficient
 */
export function hasAuthority(
  actual: Authority['type'],
  required: Authority['type']
): boolean {
  return AUTHORITY_LEVELS[actual] >= AUTHORITY_LEVELS[required];
}
