/**
 * Phase 3.4: Candidate Event Handler (Updated)
 * 
 * Lambda handler for CandidateCreated events from Phase 2.2.
 * Now integrates Phase 3.4 Incident Creation.
 * 
 * INVARIANTS:
 * - Fail-fast: Any error throws immediately
 * - No orchestration logic: Pure delegation
 * - Authority locked: AUTO_ENGINE only
 * - Schema validation upfront: Reject malformed events
 * - Idempotency inherited: No deduplication layer
 * 
 * CONSTRAINTS:
 * - No error swallowing
 * - No partial handling
 * - No retry logic (Lambda handles retries)
 * - No branching on severity/service
 * 
 * PHASE 3.4 CHANGES:
 * - Creates incidents from PROMOTE decisions
 * - Uses IncidentManager for incident creation
 * - Emits IncidentCreated events
 */

import type { Context } from 'aws-lambda';
import { CandidateCreatedEventSchema, type CandidateCreatedEvent } from './candidate-event.schema.js';
import type { PromotionGate } from '../promotion/promotion-gate.js';
import type { CandidateStore } from '../candidate/candidate-store.js';
import type { PromotionStore } from '../promotion/promotion-store.js';
import type { IncidentManager } from '../incident/incident-manager.js';
import type { EvidenceStore } from '../evidence/evidence-store.js';
import type { Authority } from '../incident/incident.schema.js';

// === EVENTBRIDGE EVENT TYPE ===

export interface EventBridgeEvent<TDetailType extends string, TDetail> {
  version: string;
  id: string;
  'detail-type': TDetailType;
  source: string;
  account: string;
  time: string;
  region: string;
  resources: string[];
  detail: TDetail;
}

// === HANDLER CONFIG ===

export interface CandidateEventHandlerConfig {
  promotionGate: PromotionGate;
  candidateStore: CandidateStore;
  promotionStore: PromotionStore;
  incidentManager: IncidentManager;
  evidenceStore: EvidenceStore;
}

// === MODULE STATE ===

let promotionGate: PromotionGate | null = null;
let candidateStore: CandidateStore | null = null;
let promotionStore: PromotionStore | null = null;
let incidentManager: IncidentManager | null = null;
let evidenceStore: EvidenceStore | null = null;

/**
 * Initialize handler (called once at cold start)
 * 
 * @param config - Handler configuration
 */
export function initializeHandler(config: CandidateEventHandlerConfig): void {
  promotionGate = config.promotionGate;
  candidateStore = config.candidateStore;
  promotionStore = config.promotionStore;
  incidentManager = config.incidentManager;
  evidenceStore = config.evidenceStore;
}

/**
 * Handle CandidateCreated event
 * 
 * FAIL-FAST: Any error throws immediately for Lambda retry
 * 
 * Algorithm (Phase 3.4):
 * 1. Extract event.detail
 * 2. Validate CandidateCreatedEventSchema (fail-fast on invalid)
 * 3. Load candidate from store
 * 4. Load evidence bundle
 * 5. Compute confidence assessment from evidence
 * 6. Call promotion gate (fail-fast on error)
 * 7. Handle decision:
 *    - PROMOTE → create incident (Phase 3.4)
 *    - REJECT → log rejection reason
 * 8. Store promotion decision
 * 9. Return (success)
 * 
 * @param event - EventBridge event containing CandidateCreated
 * @param context - Lambda context
 */
export async function handleCandidateCreated(
  event: EventBridgeEvent<'CandidateCreated', CandidateCreatedEvent>,
  context: Context
): Promise<void> {
  if (!promotionGate || !candidateStore || !promotionStore || !incidentManager || !evidenceStore) {
    throw new Error('Handler not initialized - call initializeHandler() first');
  }

  // Step 1: Extract event detail
  const detail = event.detail;

  // Step 2: Validate schema (fail-fast on invalid)
  const validationResult = CandidateCreatedEventSchema.safeParse(detail);
  if (!validationResult.success) {
    const errorMessage = validationResult.error.errors
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    throw new Error(`Invalid CandidateCreated event: ${errorMessage}`);
  }

  const candidateEvent = validationResult.data;

  // Step 3: Load candidate from store
  const candidate = await candidateStore.get(candidateEvent.candidateId);
  if (!candidate) {
    throw new Error(`Candidate not found: ${candidateEvent.candidateId}`);
  }

  // Step 4: Extract evidence ID from candidate
  // Phase 3.1: Evidence bundle ID is stored in candidate
  const evidenceId = candidate.evidenceGraphIds[0]; // Use first evidence graph ID as evidence ID
  if (!evidenceId) {
    throw new Error(`Candidate missing evidence ID: ${candidateEvent.candidateId}`);
  }

  // Step 5: Build confidence assessment from candidate
  // Phase 3.2: Confidence was computed but not persisted
  // For Phase 3.3, we use the confidence factors from candidate
  const assessment = {
    candidateId: candidate.candidateId,
    evidenceId,
    confidenceScore: mapConfidenceToScore(candidate.confidence),
    confidenceBand: candidate.confidence,
    assessedAt: candidate.createdAt,
    modelVersion: 'v1.0.0',
    factors: extractFactorsFromCandidate(candidate),
    reasons: extractReasonsFromCandidate(candidate),
  };

  // Step 6: Call promotion gate (fail-fast on error)
  const result = await promotionGate.evaluate(
    candidateEvent.candidateId,
    evidenceId,
    assessment
  );

  // Step 7: Handle decision
  if (result.decision === 'PROMOTE') {
    // Phase 3.4: Create incident from promotion
    
    // Load evidence bundle
    const evidence = await evidenceStore.getEvidence(evidenceId);
    if (!evidence) {
      throw new Error(`Evidence not found: ${evidenceId}`);
    }
    
    // Define authority (AUTO_ENGINE for automated promotion)
    const authority: Authority = {
      type: 'AUTO_ENGINE',
      principal: 'arn:aws:lambda:us-east-1:123456789012:function:opx-candidate-event-handler',
    };
    
    // Create incident
    const incident = await incidentManager.createIncident(
      result,
      evidence,
      candidateEvent.candidateId,
      authority
    );
    
    console.log('Incident created from promotion', {
      candidateId: candidateEvent.candidateId,
      incidentId: incident.incidentId,
      state: incident.state,
      severity: incident.severity,
      confidenceScore: result.confidenceScore,
      confidenceBand: result.confidenceBand,
      requestId: context.requestId,
    });
  } else {
    console.log('Candidate rejected', {
      candidateId: candidateEvent.candidateId,
      rejectionReason: result.rejectionReason,
      rejectionCode: result.rejectionCode,
      confidenceScore: result.confidenceScore,
      confidenceBand: result.confidenceBand,
      requestId: context.requestId,
    });
  }

  // Step 8: Store promotion decision
  await promotionStore.recordDecision(result);

  // Success - Lambda will not retry
}

/**
 * Map confidence enum to score
 */
function mapConfidenceToScore(confidence: string): number {
  switch (confidence) {
    case 'HIGH':
      return 0.8;
    case 'MEDIUM':
      return 0.5;
    case 'LOW':
      return 0.3;
    default:
      return 0.0;
  }
}

/**
 * Extract factors from candidate
 */
function extractFactorsFromCandidate(candidate: any): Record<string, number> {
  const factors: Record<string, number> = {};
  
  for (const factor of candidate.confidenceFactors || []) {
    factors[factor.factor] = factor.weight;
  }
  
  return factors;
}

/**
 * Extract reasons from candidate
 */
function extractReasonsFromCandidate(candidate: any): string[] {
  return (candidate.confidenceFactors || []).map((f: any) => f.evidence);
}

/**
 * Lambda handler entry point
 * 
 * @param event - EventBridge event
 * @param context - Lambda context
 */
export const handler = async (
  event: EventBridgeEvent<'CandidateCreated', CandidateCreatedEvent>,
  context: Context
): Promise<void> => {
  return handleCandidateCreated(event, context);
};
