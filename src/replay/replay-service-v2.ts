/**
 * Phase 3.5: Replay Service (V2)
 * 
 * Simplified replay service focused on idempotency verification.
 * 
 * GUARANTEES:
 * - Idempotent incident creation
 * - No duplicate incidents for same evidence
 * - Deterministic outcomes
 * 
 * SCOPE (Phase 3.5):
 * - Verify idempotency of existing pipeline
 * - Test replay scenarios
 * - Document replay behavior
 * 
 * Note: Full orchestration replay deferred to Phase 4.
 */

import { IdempotencyChecker } from './idempotency-checker';
import type { EvidenceBundle } from '../evidence/evidence-bundle.schema';
import type { PromotionResult } from '../promotion/promotion.schema';
import type { Incident } from '../incident/incident.schema';

export interface ReplayVerificationResult {
  success: boolean;
  evidenceExists: boolean;
  promotionExists: boolean;
  incidentExists: boolean;
  evidenceId?: string;
  incidentId?: string;
  promotionDecision?: string;
  message: string;
}

export interface ReplayServiceV2Config {
  idempotencyChecker: IdempotencyChecker;
}

/**
 * Replay Service V2
 * 
 * Verifies idempotency of the incident creation pipeline.
 */
export class ReplayServiceV2 {
  constructor(private config: ReplayServiceV2Config) {}

  /**
   * Verify evidence idempotency
   * 
   * Checks if evidence already exists for replay scenario.
   */
  async verifyEvidenceIdempotency(evidenceId: string): Promise<ReplayVerificationResult> {
    const evidenceCheck = await this.config.idempotencyChecker.evidenceExists(evidenceId);

    return {
      success: true,
      evidenceExists: evidenceCheck.exists,
      promotionExists: false,
      incidentExists: false,
      evidenceId: evidenceCheck.evidenceId,
      message: evidenceCheck.exists
        ? 'Evidence already exists (idempotent)'
        : 'Evidence does not exist',
    };
  }

  /**
   * Verify promotion idempotency
   * 
   * Checks if promotion decision already exists for replay scenario.
   */
  async verifyPromotionIdempotency(candidateId: string): Promise<ReplayVerificationResult> {
    const promotionCheck = await this.config.idempotencyChecker.promotionExists(candidateId);

    return {
      success: true,
      evidenceExists: false,
      promotionExists: promotionCheck.exists,
      incidentExists: false,
      promotionDecision: promotionCheck.decision?.decision,
      incidentId: promotionCheck.decision?.incidentId,
      message: promotionCheck.exists
        ? `Promotion already decided: ${promotionCheck.decision?.decision}`
        : 'Promotion does not exist',
    };
  }

  /**
   * Verify incident idempotency
   * 
   * Checks if incident already exists for replay scenario.
   */
  async verifyIncidentIdempotency(incidentId: string): Promise<ReplayVerificationResult> {
    const incidentCheck = await this.config.idempotencyChecker.incidentExists(incidentId);

    return {
      success: true,
      evidenceExists: false,
      promotionExists: false,
      incidentExists: incidentCheck.exists,
      incidentId: incidentCheck.incident?.incidentId,
      evidenceId: incidentCheck.incident?.evidenceId,
      message: incidentCheck.exists
        ? `Incident already exists: ${incidentCheck.incident?.state}`
        : 'Incident does not exist',
    };
  }

  /**
   * Verify full pipeline idempotency
   * 
   * Checks all stages of the pipeline for existing data.
   */
  async verifyFullPipeline(
    evidenceId: string,
    candidateId: string,
    incidentId: string
  ): Promise<ReplayVerificationResult> {
    const evidenceCheck = await this.config.idempotencyChecker.evidenceExists(evidenceId);
    const promotionCheck = await this.config.idempotencyChecker.promotionExists(candidateId);
    const incidentCheck = await this.config.idempotencyChecker.incidentExists(incidentId);

    const allExist = evidenceCheck.exists && promotionCheck.exists && incidentCheck.exists;

    return {
      success: true,
      evidenceExists: evidenceCheck.exists,
      promotionExists: promotionCheck.exists,
      incidentExists: incidentCheck.exists,
      evidenceId,
      incidentId,
      promotionDecision: promotionCheck.decision?.decision,
      message: allExist
        ? 'Full pipeline is idempotent (all stages exist)'
        : 'Pipeline incomplete (some stages missing)',
    };
  }
}

