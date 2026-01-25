/**
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
        reason: `Cannot transition from terminal status: ${currentStatus}`,
      };
    }

    // Check if transition is defined in rules
    const allowedTransitions = STATE_TRANSITION_RULES[currentStatus];
    if (!allowedTransitions || Object.keys(allowedTransitions).length === 0) {
      const legalStates = this.getLegalNextStates(currentStatus);
      return {
        allowed: false,
        reason: `No transitions allowed from ${currentStatus}. Legal transitions: ${legalStates.join(', ') || 'none'}`,
      };
    }

    const transitionRule = allowedTransitions[targetStatus];
    if (!transitionRule) {
      const legalStates = this.getLegalNextStates(currentStatus);
      return {
        allowed: false,
        reason: `Illegal transition from ${currentStatus} to ${targetStatus}. Legal transitions: ${legalStates.join(', ')}`,
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
        reason: `Insufficient authority: ${authority.type} < ${transitionRule!.minAuthority}`,
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
          reason: `Missing required metadata: ${missingMetadata.join(', ')}`,
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
        `Transition not allowed: ${validation.reason}`
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
