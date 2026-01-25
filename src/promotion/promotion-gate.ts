/**
 * Phase 3.3: Promotion Gate
 * 
 * Decides YES/NO on incident creation.
 * 
 * CRITICAL RULES:
 * - evaluatedAt = evidence.bundledAt (determinism)
 * - Incident identity is evidence-derived (not time-based)
 * - Fail-closed on all errors
 * - Binary decision (no "maybe")
 */

import type { EvidenceBundle } from '../evidence/evidence-bundle.schema.js';
import type { CandidateAssessment } from '../confidence/confidence.schema.js';
import type { PromotionResult, RejectionCode } from './promotion.schema.js';
import { PromotionResultSchema, GATE_VERSION, PROMOTION_CONDITIONS } from './promotion.schema.js';
import { computeIncidentId } from './incident-identity.js';
import { ActiveIncidentChecker } from './active-incident-checker.js';
import type { EvidenceStore } from '../evidence/evidence-store.js';

/**
 * Condition Check Result
 */
interface ConditionCheckResult {
  passed: boolean;
  rejectionReason?: string;
  rejectionCode?: RejectionCode;
}

/**
 * Promotion Gate
 * 
 * Evaluates promotion conditions and decides PROMOTE or REJECT.
 */
export class PromotionGate {
  constructor(
    private readonly incidentChecker: ActiveIncidentChecker,
    private readonly evidenceStore: EvidenceStore,
    private readonly gateVersion: string = GATE_VERSION
  ) {}
  
  /**
   * Validate promotion request structure
   * 
   * @param request - Promotion request to validate
   * @returns Validation result
   */
  validateRequest(request: any): { allowed: boolean; reason?: string } {
    // Basic structural validation
    if (!request) {
      return { allowed: false, reason: 'Request is null or undefined' };
    }
    
    if (!request.candidateId || typeof request.candidateId !== 'string') {
      return { allowed: false, reason: 'Invalid or missing candidateId' };
    }
    
    if (!request.policyId || typeof request.policyId !== 'string') {
      return { allowed: false, reason: 'Invalid or missing policyId' };
    }
    
    if (!request.policyVersion || typeof request.policyVersion !== 'string') {
      return { allowed: false, reason: 'Invalid or missing policyVersion' };
    }
    
    // Validate authorityType
    const validAuthorityTypes = ['AUTO_ENGINE', 'HUMAN_OPERATOR', 'ON_CALL_SRE', 'EMERGENCY_OVERRIDE', 'AUTOMATED_SYSTEM'];
    if (!request.authorityType || !validAuthorityTypes.includes(request.authorityType)) {
      return { allowed: false, reason: 'Invalid or missing authorityType' };
    }
    
    if (!request.authorityId || typeof request.authorityId !== 'string') {
      return { allowed: false, reason: 'Invalid or missing authorityId' };
    }
    
    // All validations passed
    return { allowed: true };
  }
  
  /**
   * Evaluate promotion decision
   * 
   * @param candidateId - Candidate ID
   * @param evidenceId - Evidence bundle ID
   * @param assessment - Confidence assessment
   * @returns Promotion result
   */
  async evaluate(
    candidateId: string,
    evidenceId: string,
    assessment: CandidateAssessment
  ): Promise<PromotionResult> {
    try {
      // 1. Retrieve evidence bundle
      const evidence = await this.evidenceStore.getEvidence(evidenceId);
      if (!evidence) {
        return this.buildRejectResult(
          candidateId,
          evidenceId,
          assessment,
          'Evidence bundle not found',
          'EVIDENCE_NOT_FOUND'
        );
      }
      
      // 2. Check confidence threshold
      const confidenceCheck = this.checkConfidenceThreshold(assessment);
      if (!confidenceCheck.passed) {
        return this.buildRejectResult(
          candidateId,
          evidenceId,
          assessment,
          confidenceCheck.rejectionReason!,
          confidenceCheck.rejectionCode!,
          evidence
        );
      }
      
      // 3. Check minimum detections
      const detectionCheck = this.checkMinimumDetections(evidence);
      if (!detectionCheck.passed) {
        return this.buildRejectResult(
          candidateId,
          evidenceId,
          assessment,
          detectionCheck.rejectionReason!,
          detectionCheck.rejectionCode!,
          evidence
        );
      }
      
      // 4. Compute incident identity (evidence-derived)
      const incidentId = computeIncidentId(evidence.service, evidenceId);
      
      // 5. Check for active incident
      const hasActive = await this.incidentChecker.hasActiveIncident(incidentId);
      if (hasActive) {
        return this.buildRejectResult(
          candidateId,
          evidenceId,
          assessment,
          `Active incident already exists: ${incidentId}`,
          'ACTIVE_INCIDENT_EXISTS',
          evidence,
          incidentId
        );
      }
      
      // 6. All checks passed → PROMOTE
      return this.buildPromoteResult(
        candidateId,
        evidenceId,
        incidentId,
        assessment,
        evidence
      );
    } catch (error) {
      // Fail-closed: unexpected errors → REJECT
      return this.buildRejectResult(
        candidateId,
        evidenceId,
        assessment,
        `Gate internal error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GATE_INTERNAL_ERROR'
      );
    }
  }
  
  /**
   * Check confidence threshold
   */
  private checkConfidenceThreshold(assessment: CandidateAssessment): ConditionCheckResult {
    const { confidenceBand, confidenceScore } = assessment;
    const { minConfidenceBand, minConfidenceScore } = PROMOTION_CONDITIONS;
    
    // Check band
    const bandOrder = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
    const currentBandRank = bandOrder[confidenceBand as keyof typeof bandOrder];
    const minBandRank = bandOrder[minConfidenceBand as keyof typeof bandOrder];
    
    if (currentBandRank < minBandRank || confidenceScore < minConfidenceScore) {
      return {
        passed: false,
        rejectionReason: `Confidence too low: ${confidenceBand} (${confidenceScore.toFixed(2)}) < ${minConfidenceBand} (${minConfidenceScore})`,
        rejectionCode: 'CONFIDENCE_TOO_LOW',
      };
    }
    
    return { passed: true };
  }
  
  /**
   * Check minimum detections
   */
  private checkMinimumDetections(evidence: EvidenceBundle): ConditionCheckResult {
    const detectionCount = evidence.detections.length;
    const { minDetections } = PROMOTION_CONDITIONS;
    
    if (detectionCount < minDetections) {
      return {
        passed: false,
        rejectionReason: `Insufficient detections: ${detectionCount} < ${minDetections}`,
        rejectionCode: 'INSUFFICIENT_DETECTIONS',
      };
    }
    
    return { passed: true };
  }
  
  /**
   * Build PROMOTE result
   */
  private buildPromoteResult(
    candidateId: string,
    evidenceId: string,
    incidentId: string,
    assessment: CandidateAssessment,
    evidence: EvidenceBundle
  ): PromotionResult {
    const result: PromotionResult = {
      decision: 'PROMOTE',
      incidentId,
      candidateId,
      evidenceId,
      confidenceScore: assessment.confidenceScore,
      confidenceBand: assessment.confidenceBand,
      evidenceWindow: {
        start: evidence.windowStart,
        end: evidence.windowEnd,
      },
      evaluatedAt: evidence.bundledAt, // CRITICAL: Use evidence timestamp
      gateVersion: this.gateVersion,
    };
    
    // Validate (fail-closed)
    const validated = PromotionResultSchema.safeParse(result);
    if (!validated.success) {
      throw new Error(`Promotion result validation failed: ${validated.error.message}`);
    }
    
    return validated.data;
  }
  
  /**
   * Build REJECT result
   */
  private buildRejectResult(
    candidateId: string,
    evidenceId: string,
    assessment: CandidateAssessment,
    rejectionReason: string,
    rejectionCode: RejectionCode,
    evidence?: EvidenceBundle,
    existingIncidentId?: string
  ): PromotionResult {
    const result: PromotionResult = {
      decision: 'REJECT',
      rejectionReason,
      rejectionCode,
      candidateId,
      evidenceId,
      confidenceScore: assessment.confidenceScore,
      confidenceBand: assessment.confidenceBand,
      evidenceWindow: evidence ? {
        start: evidence.windowStart,
        end: evidence.windowEnd,
      } : {
        start: new Date().toISOString(),
        end: new Date().toISOString(),
      },
      evaluatedAt: evidence ? evidence.bundledAt : new Date().toISOString(), // Use evidence if available
      gateVersion: this.gateVersion,
      // Include existing incident ID if rejection is due to duplicate
      ...(existingIncidentId && { incidentId: existingIncidentId }),
    };
    
    // Validate (fail-closed)
    const validated = PromotionResultSchema.safeParse(result);
    if (!validated.success) {
      throw new Error(`Promotion result validation failed: ${validated.error.message}`);
    }
    
    return validated.data;
  }
}
