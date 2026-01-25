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
 * 
 * 🔒 SCHEMA AUTHORITY: This file is the single source of truth
 * 🔒 CORRECTION 1: PENDING → CLOSED removed (no silent drops)
 * 🔒 CORRECTION 2: CLOSED is terminal (no reopen)
 * 🔒 CORRECTION 3: Simplified state machine (removed ACKNOWLEDGED)
 * 🔒 CORRECTION 4: Resolution metadata required for RESOLVED state
 */

import { z } from 'zod';

/**
 * Incident Status (State Machine)
 * 
 * States:
 *   PENDING       → Created, awaiting acknowledgment
 *   OPEN          → Acknowledged, being investigated
 *   MITIGATING    → Actively working on fix
 *   RESOLVED      → Issue fixed, monitoring
 *   CLOSED        → Incident complete (terminal)
 * 
 * Valid Transitions:
 *   PENDING → OPEN
 *   OPEN → MITIGATING
 *   OPEN → RESOLVED
 *   MITIGATING → RESOLVED
 *   RESOLVED → CLOSED
 * 
 * Forbidden:
 *   PENDING → CLOSED (CORRECTION 1: no silent drops)
 *   CLOSED → * (CORRECTION 2: terminal state, no reopen)
 */
export const IncidentStatusSchema = z.enum([
  'PENDING',
  'OPEN',
  'MITIGATING',
  'RESOLVED',
  'CLOSED',
]);

export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;

/**
 * Severity Levels
 */
export const SeveritySchema = z.enum([
  'SEV1',
  'SEV2',
  'SEV3',
  'SEV4',
]);

export type Severity = z.infer<typeof SeveritySchema>;

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
 * Incident Entity
 * 
 * The authoritative incident record.
 * 
 * CRITICAL TIMESTAMP RULES:
 * - createdAt: DERIVED from promotionResult.evaluatedAt (not Date.now())
 * - lastModifiedAt (on creation): DERIVED from promotionResult.evaluatedAt
 * - openedAt, mitigatedAt, resolvedAt, closedAt: Real-time (human transitions)
 * - lastModifiedAt (on transitions): Real-time (transition timestamp)
 */
export const IncidentSchema = z.object({
  // Identity (deterministic from Phase 3.3)
  incidentId: z.string().length(64), // SHA256 hex
  decisionId: z.string().length(64),
  candidateId: z.string().length(64),
  
  // Context
  severity: SeveritySchema,
  service: z.string().min(1),
  title: z.string().min(1),
  
  // State (CORRECTED: status not state)
  status: IncidentStatusSchema,
  
  // Lifecycle Timestamps (ISO-8601)
  createdAt: z.string().datetime(),
  openedAt: z.string().datetime().optional(),
  mitigatingAt: z.string().datetime().optional(),
  resolvedAt: z.string().datetime().optional(),
  closedAt: z.string().datetime().optional(),
  
  // Counts
  detectionCount: z.number().int().min(0),
  evidenceGraphCount: z.number().int().min(0),
  
  // Blast Radius
  blastRadiusScope: z.enum(['SINGLE_SERVICE', 'MULTI_SERVICE', 'INFRASTRUCTURE']),
  
  // Version
  incidentVersion: z.number().int().min(1),
  
  // Resolution (CORRECTED: flat fields, not nested)
  resolutionSummary: z.string().min(1).optional(),
  resolutionType: z.enum(['FIXED', 'FALSE_POSITIVE', 'DUPLICATE', 'WONT_FIX']).optional(),
  resolvedBy: z.string().min(1).optional(),
  
  // Metadata
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
  
  // Audit (CORRECTED: optional)
  createdBy: AuthoritySchema.optional(),
  lastModifiedAt: z.string().datetime().optional(),
  lastModifiedBy: AuthoritySchema.optional(),
});

export type Incident = z.infer<typeof IncidentSchema>;

/**
 * Resolution Metadata Schema
 * 
 * Required when transitioning to RESOLVED state.
 */
export const ResolutionMetadataSchema = z.object({
  resolutionSummary: z.string().min(1),
  resolutionType: z.enum(['FIXED', 'FALSE_POSITIVE', 'DUPLICATE', 'WONT_FIX']),
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
 * 
 * 🔒 CORRECTION 1: PENDING → CLOSED removed
 * 🔒 CORRECTION 2: CLOSED is terminal
 * 🔒 CORRECTION 3: ACKNOWLEDGED removed
 */
export const STATE_TRANSITION_RULES: Record<
  IncidentStatus,
  Partial<Record<IncidentStatus, {
    minAuthority: Authority['type'];
    requiredMetadata?: string[];
  }>>
> = {
  PENDING: {
    OPEN: {
      minAuthority: 'HUMAN_OPERATOR',
    },
  },
  OPEN: {
    MITIGATING: {
      minAuthority: 'HUMAN_OPERATOR',
    },
    RESOLVED: {
      minAuthority: 'ON_CALL_SRE',
      requiredMetadata: ['reason'],
    },
  },
  MITIGATING: {
    RESOLVED: {
      minAuthority: 'ON_CALL_SRE',
      requiredMetadata: ['reason'],
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
