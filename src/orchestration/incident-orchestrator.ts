/**
 * Phase 2.3: Incident Orchestrator
 * 
 * Minimal glue layer between CP-6 (promotion) and CP-7 (incident management).
 * 
 * INVARIANTS:
 * - INV-P2.3.1: Deterministic promotion (same inputs → same outputs)
 * - INV-P2.3.2: No promotion bypass (all incidents go through CP-6)
 * - INV-P2.3.3: Frozen component respect (no modifications to CP-5/6/7)
 * - INV-P2.3.4: Idempotent orchestration (replay-safe)
 * - INV-P2.3.5: Event decoupling (failures don't block)
 * - INV-P2.3.6: Authority preservation (audit trail)
 * - INV-P2.3.7: Policy selection immutability (from candidate only)
 * 
 * CONSTRAINTS:
 * - Glue-only (no business logic)
 * - Exactly one call to CP-6
 * - At most one call to CP-7
 * - No retries (Lambda handles retries)
 */

import { randomUUID } from 'crypto';
import type { PromotionEngine } from '../promotion/promotion-engine.js';
import type { IncidentManager } from '../incident/incident-manager.js';
import type { CandidateStore } from '../candidate/candidate-store.js';
import type { PromotionRequest } from '../promotion/promotion.schema.js';
import { computeRequestContextHash } from '../promotion/promotion.schema.js';
import type { OrchestrationStore, OrchestrationAttempt } from './orchestration-store.js';
import type {
  IncidentCreatedEvent,
  CandidateDeferredEvent,
  CandidateSuppressedEvent,
} from './orchestration-event.schema.js';

// === AUTHORITY CONTEXT ===

export interface AuthorityContext {
  authorityType: 'AUTO_ENGINE' | 'HUMAN_OPERATOR' | 'ON_CALL_SRE' | 'EMERGENCY_OVERRIDE';
  authorityId: string;
  sessionId?: string;
  justification?: string;
}

// === ORCHESTRATION RESULT ===

export interface OrchestrationResult {
  success: boolean;
  decision: 'PROMOTE' | 'DEFER' | 'SUPPRESS';
  incidentId?: string;
  decisionId: string;
  reason: string;
  error?: string;
}

// === EVENT EMITTER ===

export interface EventEmitter {
  emit(event: IncidentCreatedEvent | CandidateDeferredEvent | CandidateSuppressedEvent): Promise<void>;
}

// === ORCHESTRATOR CONFIG ===

export interface IncidentOrchestratorConfig {
  promotionEngine: PromotionEngine;
  incidentManager: IncidentManager;
  candidateStore: CandidateStore;
  eventEmitter: EventEmitter;
  orchestrationStore: OrchestrationStore;
}

// === INCIDENT ORCHESTRATOR ===

/**
 * Incident Orchestrator
 * 
 * Minimal wiring between correlation → promotion → incident.
 * Glue-only, no business logic.
 */
export class IncidentOrchestrator {
  private readonly promotionEngine: PromotionEngine;
  private readonly incidentManager: IncidentManager;
  private readonly candidateStore: CandidateStore;
  private readonly eventEmitter: EventEmitter;
  private readonly orchestrationStore: OrchestrationStore;

  constructor(config: IncidentOrchestratorConfig) {
    this.promotionEngine = config.promotionEngine;
    this.incidentManager = config.incidentManager;
    this.candidateStore = config.candidateStore;
    this.eventEmitter = config.eventEmitter;
    this.orchestrationStore = config.orchestrationStore;
  }

  /**
   * Process candidate through promotion and incident creation
   * 
   * Algorithm (FROZEN):
   * 1. Load candidate from CP-5
   * 2. Extract policy ID from candidate (INV-P2.3.7)
   * 3. Build promotion request
   * 4. Call CP-6 (exactly once)
   * 5. Handle decision:
   *    - PROMOTE → call CP-7 (at most once)
   *    - DEFER → log and return
   *    - SUPPRESS → log and return
   * 6. Emit events (fire-and-forget)
   * 7. Log to orchestration store (fire-and-forget)
   * 
   * @param candidateId - Candidate ID
   * @param authority - Authority context
   * @param currentTime - Injected current time (for determinism)
   * @returns Orchestration result
   */
  async processCandidate(
    candidateId: string,
    authority: AuthorityContext,
    currentTime: string
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const attemptId = randomUUID();

    try {
      // Step 1: Load candidate from CP-5
      const candidate = await this.candidateStore.get(candidateId);
      if (!candidate) {
        throw new Error(`Candidate not found: ${candidateId}`);
      }

      // Step 2: Extract policy ID from candidate (INV-P2.3.7)
      if (!candidate.policyId || !candidate.policyVersion) {
        throw new Error(`Candidate missing policy metadata: ${candidateId}`);
      }

      // Step 3: Build promotion request
      const promotionRequest: PromotionRequest = {
        requestId: randomUUID(),
        candidateId,
        policyId: candidate.policyId,
        policyVersion: candidate.policyVersion,
        authorityType: authority.authorityType,
        authorityId: authority.authorityId,
        justification: authority.justification,
        sessionId: authority.sessionId,
        requestContextHash: computeRequestContextHash(
          candidateId,
          candidate.policyId,
          candidate.policyVersion
        ),
        requestedAt: currentTime,
      };

      // Step 4: Call CP-6 (exactly once)
      const decision = await this.promotionEngine.processPromotionRequest(
        promotionRequest,
        currentTime
      );

      // Step 5: Handle decision
      let incidentId: string | undefined;
      let result: OrchestrationResult;

      if (decision.decision === 'PROMOTE') {
        // PROMOTE → call CP-7 (at most once)
        const incident = await this.incidentManager.createIncidentFromPromotion(
          decision,
          currentTime
        );
        incidentId = incident.incidentId;

        result = {
          success: true,
          decision: 'PROMOTE',
          incidentId,
          decisionId: decision.decisionId,
          reason: decision.reason,
        };

        // Emit IncidentCreated event (fire-and-forget)
        this.emitIncidentCreatedEvent({
          eventType: 'IncidentCreated',
          incidentId: incident.incidentId, // Use incident.incidentId directly (guaranteed to be string)
          candidateId,
          decisionId: decision.decisionId,
          severity: candidate.suggestedSeverity,
          service: candidate.suggestedService,
          createdAt: currentTime,
        });
      } else if (decision.decision === 'DEFER') {
        // DEFER → log and return
        result = {
          success: true,
          decision: 'DEFER',
          decisionId: decision.decisionId,
          reason: decision.reason,
        };

        // Emit CandidateDeferred event (fire-and-forget)
        this.emitCandidateDeferredEvent({
          eventType: 'CandidateDeferred',
          candidateId,
          decisionId: decision.decisionId,
          reason: decision.reason,
          deferredAt: currentTime,
        });
      } else {
        // SUPPRESS (REJECT) → log and return
        result = {
          success: true,
          decision: 'SUPPRESS',
          decisionId: decision.decisionId,
          reason: decision.reason,
        };

        // Emit CandidateSuppressed event (fire-and-forget)
        this.emitCandidateSuppressedEvent({
          eventType: 'CandidateSuppressed',
          candidateId,
          decisionId: decision.decisionId,
          reason: decision.reason,
          suppressedAt: currentTime,
        });
      }

      // Step 6: Log to orchestration store (fire-and-forget)
      const durationMs = Date.now() - startTime;
      this.logOrchestrationAttempt({
        candidateId,
        attemptId,
        authorityType: authority.authorityType,
        authorityId: authority.authorityId,
        policyId: candidate.policyId,
        policyVersion: candidate.policyVersion,
        decision: result.decision,
        decisionId: decision.decisionId,
        incidentId,
        reason: decision.reason,
        startedAt: currentTime,
        completedAt: new Date().toISOString(),
        durationMs,
        status: 'success',
        ttl: 0, // Will be set by store
      });

      return result;
    } catch (error) {
      // Log error attempt (fire-and-forget)
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logOrchestrationAttempt({
        candidateId,
        attemptId,
        authorityType: authority.authorityType,
        authorityId: authority.authorityId,
        policyId: 'unknown',
        policyVersion: 'unknown',
        decision: 'SUPPRESS',
        decisionId: 'error',
        reason: errorMessage,
        startedAt: currentTime,
        completedAt: new Date().toISOString(),
        durationMs,
        status: 'error',
        error: errorMessage,
        ttl: 0,
      });

      // Re-throw for Lambda retry
      throw error;
    }
  }

  /**
   * Emit IncidentCreated event (fire-and-forget)
   * 
   * INV-P2.3.5: Event emission failure must not block orchestration
   */
  private emitIncidentCreatedEvent(event: IncidentCreatedEvent): void {
    this.eventEmitter.emit(event).catch((error: unknown) => {
      console.warn('Failed to emit IncidentCreated event', {
        incidentId: event.incidentId,
        candidateId: event.candidateId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Emit CandidateDeferred event (fire-and-forget)
   * 
   * INV-P2.3.5: Event emission failure must not block orchestration
   */
  private emitCandidateDeferredEvent(event: CandidateDeferredEvent): void {
    this.eventEmitter.emit(event).catch((error: unknown) => {
      console.warn('Failed to emit CandidateDeferred event', {
        candidateId: event.candidateId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Emit CandidateSuppressed event (fire-and-forget)
   * 
   * INV-P2.3.5: Event emission failure must not block orchestration
   */
  private emitCandidateSuppressedEvent(event: CandidateSuppressedEvent): void {
    this.eventEmitter.emit(event).catch((error: unknown) => {
      console.warn('Failed to emit CandidateSuppressed event', {
        candidateId: event.candidateId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Log orchestration attempt (fire-and-forget)
   * 
   * INV-P2.3.5: Logging failure must not block orchestration
   */
  private logOrchestrationAttempt(attempt: OrchestrationAttempt): void {
    this.orchestrationStore.logAttempt(attempt).catch((error: unknown) => {
      console.warn('Failed to log orchestration attempt', {
        candidateId: attempt.candidateId,
        attemptId: attempt.attemptId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}
