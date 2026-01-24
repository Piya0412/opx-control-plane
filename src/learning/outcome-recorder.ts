/**
 * Phase 4 - Step 3: Outcome Recorder
 * 
 * Orchestrates outcome recording with validation.
 * 
 * RULES:
 * - CLOSED incidents only
 * - Human authorities only
 * - Append-only storage
 * - Idempotent recording
 */

import type { ValidationGate } from './validation-gate';
import type { OutcomeStore } from './outcome-store';
import type { IncidentStore } from '../incident/incident-store';
import type { Authority } from '../incident/incident.schema';
import type { IncidentOutcome, OutcomeRequest } from './outcome.schema';
import { computeOutcomeId } from './outcome-id';

/**
 * Record Result
 * 
 * Result of outcome recording operation.
 */
export interface RecordResult {
  success: boolean;
  outcomeId: string;
  created: boolean; // true if new, false if duplicate
  outcome: IncidentOutcome;
}

/**
 * Incident Not Found Error
 * 
 * Thrown when incident ID not found in store.
 */
export class IncidentNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IncidentNotFoundError';
  }
}

/**
 * Outcome Recorder
 * 
 * Orchestrates outcome recording flow:
 * 1. Load incident
 * 2. Validate submission
 * 3. Build outcome
 * 4. Store outcome (idempotent)
 * 5. Return result
 */
export class OutcomeRecorder {
  constructor(
    private readonly validationGate: ValidationGate,
    private readonly outcomeStore: OutcomeStore,
    private readonly incidentStore: IncidentStore
  ) {}
  
  /**
   * Record outcome for closed incident
   * 
   * Flow:
   * 1. Load incident from store
   * 2. Validate submission (gate)
   * 3. Build outcome
   * 4. Store outcome (idempotent)
   * 5. Return result
   * 
   * @throws IncidentNotFoundError if incident not found
   * @throws ValidationError if validation fails
   * @throws Error if storage fails
   */
  async recordOutcome(
    incidentId: string,
    outcomeRequest: OutcomeRequest,
    authority: Authority
  ): Promise<RecordResult> {
    // Step 1: Load incident
    const incident = await this.incidentStore.getIncident(incidentId);
    
    if (!incident) {
      throw new IncidentNotFoundError(
        `Incident not found: ${incidentId}`
      );
    }
    
    // Step 2 & 3: Build outcome (validates and throws ValidationError if invalid)
    // LOCKED NOTE: buildOutcome generates timestamps once per call
    const outcome = this.validationGate.buildOutcome(
      incident,
      outcomeRequest,
      authority
    );
    
    // Step 4: Store outcome (idempotent)
    const created = await this.outcomeStore.recordOutcome(outcome);
    
    // Step 5: Return result
    return {
      success: true,
      outcomeId: outcome.outcomeId,
      created,
      outcome,
    };
  }
  
  /**
   * Get outcome by incident ID
   * 
   * @returns Outcome or null if not found
   */
  async getOutcomeByIncident(
    incidentId: string
  ): Promise<IncidentOutcome | null> {
    return this.outcomeStore.getOutcomeByIncident(incidentId);
  }
  
  /**
   * List outcomes with filters
   * 
   * @param filters - Optional filters (service, date range, etc.)
   * @returns Array of outcomes
   */
  async listOutcomes(
    filters?: {
      service?: string;
      startDate?: string;
      endDate?: string;
      truePositive?: boolean;
      falsePositive?: boolean;
    }
  ): Promise<IncidentOutcome[]> {
    return this.outcomeStore.listOutcomes(filters);
  }
}
