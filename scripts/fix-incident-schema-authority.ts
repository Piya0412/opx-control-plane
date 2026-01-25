#!/usr/bin/env tsx
/**
 * CRITICAL FIX: Unify Incident Schema Authority
 * 
 * Problem: Two competing schemas exist
 * - incident-status.schema.ts (CORRECT, tests use this)
 * - incident.schema.ts (OUTDATED, implementation uses this)
 * 
 * This script mechanically fixes incident.schema.ts to match the authority.
 * 
 * Changes:
 * 1. Rename: state → status
 * 2. Enum: OPEN/ACKNOWLEDGED/... → PENDING/OPEN/MITIGATING/RESOLVED/CLOSED
 * 3. Flatten: resolution.summary → resolutionSummary
 * 4. Type: MITIGATED → FIXED
 * 5. Add: detectionCount, evidenceGraphCount, blastRadiusScope, incidentVersion
 * 6. Optional: createdBy, lastModifiedAt, lastModifiedBy
 */

import * as fs from 'fs';
import * as path from 'path';

const INCIDENT_SCHEMA_PATH = 'src/incident/incident.schema.ts';
const STATE_MACHINE_PATH = 'src/incident/state-machine.ts';

console.log('🔧 Fixing Incident Schema Authority...\n');

// === FIX 1: incident.schema.ts ===

console.log('📝 Rewriting incident.schema.ts...');

const newIncidentSchema = `/**
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
  'SEV5',
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
`;

fs.writeFileSync(INCIDENT_SCHEMA_PATH, newIncidentSchema, 'utf-8');
console.log('✅ incident.schema.ts rewritten\n');

// === FIX 2: state-machine.ts ===

console.log('📝 Rewriting state-machine.ts...');

const newStateMachine = `/**
 * Phase 3.4: Incident State Machine
 * 
 * Validates and executes state transitions for incidents.
 * 
 * Rules:
 * - All transitions must be explicitly allowed
 * - Authority levels must be sufficient
 * - Required metadata must be present
 * - Terminal states cannot transition
 * 
 * 🔒 CORRECTION 1: PENDING → CLOSED removed (no silent drops)
 * 🔒 CORRECTION 2: CLOSED is terminal (no reopen)
 * 🔒 CORRECTION 3: ACKNOWLEDGED removed
 */

import {
  Incident,
  IncidentStatus,
  Authority,
  TransitionMetadata,
  TransitionValidation,
  STATE_TRANSITION_RULES,
  hasAuthority,
} from './incident.schema.js';

export class IncidentStateMachine {
  /**
   * Validate if a transition is allowed
   * 
   * @param currentStatus - Current status
   * @param targetStatus - Target status
   * @returns Validation result
   */
  validateTransition(
    currentStatus: IncidentStatus,
    targetStatus: IncidentStatus
  ): TransitionValidation {
    // Cannot transition from same status to itself
    if (currentStatus === targetStatus) {
      return {
        allowed: false,
        reason: 'Cannot transition to same status',
      };
    }

    // Check if current status is terminal
    if (this.isTerminal(currentStatus)) {
      return {
        allowed: false,
        reason: \`Cannot transition from terminal status: \${currentStatus}\`,
      };
    }

    // Check if transition is defined in rules
    const allowedTransitions = STATE_TRANSITION_RULES[currentStatus];
    if (!allowedTransitions || Object.keys(allowedTransitions).length === 0) {
      const legalStates = this.getLegalNextStates(currentStatus);
      return {
        allowed: false,
        reason: \`No transitions allowed from \${currentStatus}. Legal transitions: \${legalStates.join(', ') || 'none'}\`,
      };
    }

    const transitionRule = allowedTransitions[targetStatus];
    if (!transitionRule) {
      const legalStates = this.getLegalNextStates(currentStatus);
      return {
        allowed: false,
        reason: \`Illegal transition from \${currentStatus} to \${targetStatus}. Legal transitions: \${legalStates.join(', ')}\`,
      };
    }

    // Transition is allowed
    return { allowed: true };
  }

  /**
   * Check if a status is terminal
   * 
   * @param status - Status to check
   * @returns True if terminal
   */
  isTerminal(status: IncidentStatus): boolean {
    return status === 'CLOSED';
  }

  /**
   * Check if a status requires resolution metadata
   * 
   * @param status - Status to check
   * @returns True if resolution required
   */
  requiresResolution(status: IncidentStatus): boolean {
    return status === 'RESOLVED';
  }

  /**
   * Check if a status requires existing resolution
   * 
   * @param status - Status to check
   * @returns True if existing resolution required
   */
  requiresExistingResolution(status: IncidentStatus): boolean {
    return status === 'CLOSED';
  }

  /**
   * Get legal next states from current status
   * 
   * @param currentStatus - Current status
   * @returns Array of legal next states
   */
  getLegalNextStates(currentStatus: IncidentStatus): IncidentStatus[] {
    const allowedTransitions = STATE_TRANSITION_RULES[currentStatus];
    if (!allowedTransitions) {
      return [];
    }

    return Object.keys(allowedTransitions) as IncidentStatus[];
  }

  /**
   * Check if a transition is allowed with authority
   */
  canTransition(
    currentStatus: IncidentStatus,
    targetStatus: IncidentStatus,
    authority: Authority,
    metadata?: TransitionMetadata
  ): TransitionValidation {
    // First check basic transition validity
    const basicValidation = this.validateTransition(currentStatus, targetStatus);
    if (!basicValidation.allowed) {
      return basicValidation;
    }

    // Get transition rule
    const allowedTransitions = STATE_TRANSITION_RULES[currentStatus];
    const transitionRule = allowedTransitions![targetStatus];

    // Check authority level
    if (!hasAuthority(authority.type, transitionRule!.minAuthority)) {
      return {
        allowed: false,
        reason: \`Insufficient authority: \${authority.type} < \${transitionRule!.minAuthority}\`,
        requiredAuthority: transitionRule!.minAuthority,
      };
    }

    // Check required metadata
    if (transitionRule!.requiredMetadata) {
      const missingMetadata = transitionRule!.requiredMetadata.filter(
        (field) => !metadata || !metadata[field as keyof TransitionMetadata]
      );

      if (missingMetadata.length > 0) {
        return {
          allowed: false,
          reason: \`Missing required metadata: \${missingMetadata.join(', ')}\`,
          requiredMetadata: missingMetadata,
        };
      }
    }

    // Transition is allowed
    return { allowed: true };
  }

  /**
   * Execute a state transition
   * 
   * CRITICAL: Transition timestamps use real-time (not derived)
   * Rationale: Human actions are real-time events, not derived facts
   */
  transition(
    incident: Incident,
    targetStatus: IncidentStatus,
    authority: Authority,
    metadata?: TransitionMetadata
  ): Incident {
    // Validate transition
    const validation = this.canTransition(
      incident.status,
      targetStatus,
      authority,
      metadata
    );

    if (!validation.allowed) {
      throw new Error(
        \`Transition not allowed: \${validation.reason}\`
      );
    }

    // Build updated incident
    const now = new Date().toISOString();
    const updated: Incident = {
      ...incident,
      status: targetStatus,
      lastModifiedAt: now,
      lastModifiedBy: authority,
    };

    // Set status-specific timestamps
    switch (targetStatus) {
      case 'OPEN':
        updated.openedAt = now;
        break;
      case 'MITIGATING':
        updated.mitigatingAt = now;
        break;
      case 'RESOLVED':
        updated.resolvedAt = now;
        break;
      case 'CLOSED':
        updated.closedAt = now;
        break;
    }

    return updated;
  }

  /**
   * Get all allowed transitions from current status
   */
  getAllowedTransitions(
    currentStatus: IncidentStatus,
    authority: Authority
  ): IncidentStatus[] {
    const allowedTransitions = STATE_TRANSITION_RULES[currentStatus];
    if (!allowedTransitions) {
      return [];
    }

    return Object.entries(allowedTransitions)
      .filter(([_, rule]) => hasAuthority(authority.type, rule.minAuthority))
      .map(([status]) => status as IncidentStatus);
  }
}
`;

fs.writeFileSync(STATE_MACHINE_PATH, newStateMachine, 'utf-8');
console.log('✅ state-machine.ts rewritten\n');

console.log('✅ Schema authority unified!');
console.log('');
console.log('Next steps:');
console.log('1. Run: npm test');
console.log('2. Verify all Phase 3 tests pass');
console.log('3. Commit with message: "fix: unify incident schema authority (Phase 3.4)"');
