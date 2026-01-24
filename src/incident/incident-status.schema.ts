/**
 * CP-7: Incident Status Schema
 * 
 * Defines the incident status enum and legal state transitions.
 * 
 * 🔒 CORRECTION 1: PENDING → CLOSED removed (no silent drops)
 * 🔒 CORRECTION 2: CLOSED is terminal (no reopen)
 */

// Incident Status enum
export type IncidentStatus = 
  | 'PENDING'      // Created, awaiting acknowledgment
  | 'OPEN'         // Acknowledged, being investigated
  | 'MITIGATING'   // Mitigation in progress
  | 'RESOLVED'     // Issue resolved, awaiting closure
  | 'CLOSED';      // Incident closed (TERMINAL)

// State transition table (legal transitions only)
// 🔒 CORRECTION 1: PENDING → CLOSED removed
// 🔒 CORRECTION 2: CLOSED is terminal (no transitions)
export const LEGAL_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  PENDING: ['OPEN'],                     // Must acknowledge before any action
  OPEN: ['MITIGATING', 'RESOLVED'],      // Can start mitigation or resolve directly
  MITIGATING: ['RESOLVED'],              // Can only move to resolved
  RESOLVED: ['CLOSED'],                  // Can only close (no reopen)
  CLOSED: [],                            // TERMINAL - no transitions allowed
};

// Terminal states (cannot transition further)
export const TERMINAL_STATES: IncidentStatus[] = ['CLOSED'];

// States requiring resolution metadata
// 🔒 CORRECTION 4: Resolution is immutable once set
export const REQUIRES_RESOLUTION: IncidentStatus[] = ['RESOLVED'];

// States that must have resolution already set
export const REQUIRES_EXISTING_RESOLUTION: IncidentStatus[] = ['CLOSED'];
