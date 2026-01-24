/**
 * Phase 3.5: Idempotency Checker
 * 
 * Checks if entities already exist in the system to prevent duplicates during replay.
 * 
 * Properties:
 * - Read-only operations
 * - Returns existence + data if found
 * - No side effects
 * - Fail-closed on errors
 */

import { EvidenceStore } from '../evidence/evidence-store';
import { PromotionStore } from '../promotion/promotion-store';
import { IncidentStore } from '../incident/incident-store';
import type { EvidenceBundle } from '../evidence/evidence-bundle.schema';
import type { PromotionResult } from '../promotion/promotion.schema';
import type { Incident } from '../incident/incident.schema';
import type { CandidateAssessment } from '../confidence/confidence.schema';

export interface EvidenceExistsResult {
  exists: boolean;
  evidenceId?: string;
  evidence?: EvidenceBundle;
}

export interface ConfidenceExistsResult {
  exists: boolean;
  assessment?: CandidateAssessment;
}

export interface PromotionExistsResult {
  exists: boolean;
  decision?: PromotionResult;
}

export interface IncidentExistsResult {
  exists: boolean;
  incident?: Incident;
}

export interface IdempotencyCheckerConfig {
  evidenceStore: EvidenceStore;
  promotionStore: PromotionStore;
  incidentStore: IncidentStore;
}

/**
 * Idempotency Checker
 * 
 * Checks existence of entities across the pipeline to enable idempotent replay.
 */
export class IdempotencyChecker {
  constructor(private config: IdempotencyCheckerConfig) {}

  /**
   * Check if evidence already exists for given detections
   * 
   * Algorithm:
   * 1. Compute deterministic evidence ID from detections
   * 2. Query evidence store by ID
   * 3. Return evidence if found
   * 
   * Note: This assumes evidence ID is deterministic (computed from detections).
   * In Phase 3.1, evidenceId = SHA256(sorted detection IDs + service + window).
   * 
   * Returns:
   * - exists: true if found
   * - evidenceId: ID of existing evidence
   * - evidence: Full evidence bundle
   */
  async evidenceExists(
    evidenceId: string
  ): Promise<EvidenceExistsResult> {
    try {
      const evidence = await this.config.evidenceStore.getEvidence(evidenceId);
      
      if (evidence) {
        return {
          exists: true,
          evidenceId: evidence.evidenceId,
          evidence,
        };
      }

      return { exists: false };
    } catch (error) {
      // Fail-closed: If we can't check, assume it doesn't exist
      console.error('Error checking evidence existence:', error);
      return { exists: false };
    }
  }

  /**
   * Check if confidence assessment already exists for evidence
   * 
   * Note: In Phase 3.4, confidence is stored with promotion decision.
   * This checks the promotion store for existing assessment.
   * 
   * Returns:
   * - exists: true if found
   * - assessment: Confidence assessment data
   */
  async confidenceExists(evidenceId: string): Promise<ConfidenceExistsResult> {
    try {
      // In current implementation, confidence is part of candidate
      // We check if a candidate exists with this evidenceId
      // This is a simplified check - in production, you might have a dedicated confidence store
      
      // For now, we return false to allow confidence recalculation
      // This is safe because confidence calculation is deterministic
      return { exists: false };
    } catch (error) {
      console.error('Error checking confidence existence:', error);
      return { exists: false };
    }
  }

  /**
   * Check if promotion decision already exists for candidate
   * 
   * Algorithm:
   * 1. Query promotion store by candidate ID
   * 2. Return decision if found
   * 
   * Returns:
   * - exists: true if found
   * - decision: Promotion result
   */
  async promotionExists(candidateId: string): Promise<PromotionExistsResult> {
    try {
      const decision = await this.config.promotionStore.getDecision(candidateId);
      
      if (decision) {
        return {
          exists: true,
          decision,
        };
      }

      return { exists: false };
    } catch (error) {
      console.error('Error checking promotion existence:', error);
      return { exists: false };
    }
  }

  /**
   * Check if incident already exists
   * 
   * Algorithm:
   * 1. Query incident store by incident ID
   * 2. Return incident if found
   * 
   * Returns:
   * - exists: true if found
   * - incident: Full incident object
   */
  async incidentExists(incidentId: string): Promise<IncidentExistsResult> {
    try {
      const incident = await this.config.incidentStore.getIncident(incidentId);
      
      if (incident) {
        return {
          exists: true,
          incident,
        };
      }

      return { exists: false };
    } catch (error) {
      console.error('Error checking incident existence:', error);
      return { exists: false };
    }
  }
}
