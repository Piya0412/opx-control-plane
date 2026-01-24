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
 */

import {
  Incident,
  IncidentState,
  Authority,
  TransitionMetadata,
  TransitionValidation,
  STATE_TRANSITION_RULES,
  hasAuthority,
} from './incident.schema';

export class IncidentStateMachine {
  /**
   * Validate if a transition is allowed
   * 
   * @param currentState - Current state
   * @param targetState - Target state
   * @returns Validation result
   */
  validateTransition(
    currentState: IncidentState,
    targetState: IncidentState
  ): TransitionValidation {
    // Cannot transition from same state to itself
    if (currentState === targetState) {
      return {
        allowed: false,
        reason: 'Cannot transition to same state',
      };
    }

    // Check if transition is defined in rules
    const allowedTransitions = STATE_TRANSITION_RULES[currentState];
    if (!allowedTransitions || Object.keys(allowedTransitions).length === 0) {
      const legalStates = this.getLegalNextStates(currentState);
      return {
        allowed: false,
        reason: `No transitions allowed from ${currentState}. Legal transitions: ${legalStates.join(', ') || 'none'}`,
      };
    }

    const transitionRule = allowedTransitions[targetState];
    if (!transitionRule) {
      const legalStates = this.getLegalNextStates(currentState);
      return {
        allowed: false,
        reason: `Transition from ${currentState} to ${targetState} is not allowed. Legal transitions: ${legalStates.join(', ')}`,
      };
    }

    // Transition is allowed
    return { allowed: true };
  }

  /**
   * Check if a state is terminal
   * 
   * @param state - State to check
   * @returns True if terminal
   */
  isTerminal(state: IncidentState): boolean {
    return state === 'CLOSED';
  }

  /**
   * Check if a state requires resolution metadata
   * 
   * @param state - State to check
   * @returns True if resolution required
   */
  requiresResolution(state: IncidentState): boolean {
    return state === 'RESOLVED';
  }

  /**
   * Check if a state requires existing resolution
   * 
   * @param state - State to check
   * @returns True if existing resolution required
   */
  requiresExistingResolution(state: IncidentState): boolean {
    return state === 'CLOSED';
  }

  /**
   * Get legal next states from current state
   * 
   * @param currentState - Current state
   * @returns Array of legal next states
   */
  getLegalNextStates(currentState: IncidentState): IncidentState[] {
    const allowedTransitions = STATE_TRANSITION_RULES[currentState];
    if (!allowedTransitions) {
      return [];
    }

    return Object.keys(allowedTransitions) as IncidentState[];
  }

  /**
   * Check if a transition is allowed
   */
  canTransition(
    currentState: IncidentState,
    targetState: IncidentState,
    authority: Authority,
    metadata?: TransitionMetadata
  ): TransitionValidation {
    // Cannot transition from same state to itself
    if (currentState === targetState) {
      return {
        allowed: false,
        reason: 'Cannot transition to same state',
      };
    }

    // Check if transition is defined in rules
    const allowedTransitions = STATE_TRANSITION_RULES[currentState];
    if (!allowedTransitions) {
      return {
        allowed: false,
        reason: `No transitions allowed from ${currentState}`,
      };
    }

    const transitionRule = allowedTransitions[targetState];
    if (!transitionRule) {
      return {
        allowed: false,
        reason: `Transition from ${currentState} to ${targetState} is not allowed`,
      };
    }

    // Check authority level
    if (!hasAuthority(authority.type, transitionRule.minAuthority)) {
      return {
        allowed: false,
        reason: `Insufficient authority: ${authority.type} < ${transitionRule.minAuthority}`,
        requiredAuthority: transitionRule.minAuthority,
      };
    }

    // Check required metadata
    if (transitionRule.requiredMetadata) {
      const missingMetadata = transitionRule.requiredMetadata.filter(
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
    targetState: IncidentState,
    authority: Authority,
    metadata?: TransitionMetadata
  ): Incident {
    // Validate transition
    const validation = this.canTransition(
      incident.state,
      targetState,
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
      state: targetState,
      lastModifiedAt: now, // Real-time (transition timestamp)
      lastModifiedBy: authority,
    };

    // Set state-specific timestamps (real-time for human transitions)
    switch (targetState) {
      case 'ACKNOWLEDGED':
        updated.acknowledgedAt = now;
        break;
      case 'MITIGATING':
        updated.mitigatedAt = now;
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
   * Get all allowed transitions from current state
   */
  getAllowedTransitions(
    currentState: IncidentState,
    authority: Authority
  ): IncidentState[] {
    const allowedTransitions = STATE_TRANSITION_RULES[currentState];
    if (!allowedTransitions) {
      return [];
    }

    return Object.entries(allowedTransitions)
      .filter(([_, rule]) => hasAuthority(authority.type, rule.minAuthority))
      .map(([state]) => state as IncidentState);
  }
}
