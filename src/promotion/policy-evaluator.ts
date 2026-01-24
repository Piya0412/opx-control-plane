/**
 * CP-6: Policy Evaluator (Pure)
 * 
 * Pure policy evaluation engine for deterministic promotion decisions.
 * 
 * 🔒 INV-6.4: Deterministic Outcome
 * - currentTime is injected, not read from system
 * - All inputs are explicit
 * - No external calls
 * - Same inputs → same output (testable)
 */

import { IncidentCandidate } from '../candidate/candidate.schema.js';
import { AuthorityContext, checkAuthorityPermission } from './authority.schema.js';
import { PromotionPolicy } from './policy.schema.js';
import { PromotionDecisionType, computeDecisionHash } from './promotion.schema.js';

// === EVALUATION CONTEXT ===

export interface EvaluationContext {
  candidate: IncidentCandidate;
  authority: AuthorityContext;
  policy: PromotionPolicy;
  currentTime: string; // ISO timestamp, injected for determinism
  existingPromotions: string[]; // candidateIds already promoted
  activeIncidents: { service: string; incidentId: string }[];
}

// === EVALUATION STEP ===

export interface EvaluationStep {
  step: number;
  check: string;
  input: string;
  result: 'PASS' | 'FAIL' | 'SKIP';
  impact: 'CONTINUE' | 'REJECT' | 'DEFER';
  details?: string;
}

// === EVALUATION RESULT ===

export interface EvaluationResult {
  decision: PromotionDecisionType;
  reason: string;
  evaluationTrace: EvaluationStep[];
}

/**
 * Policy Evaluator
 * 
 * Pure function for evaluating promotion policies.
 */
export class PolicyEvaluator {
  /**
   * Evaluate promotion policy
   * 
   * Pure function - no side effects, deterministic output.
   * 
   * @param context - Evaluation context
   * @returns Evaluation result
   */
  evaluate(context: EvaluationContext): EvaluationResult {
    const trace: EvaluationStep[] = [];
    let stepNum = 0;

    // Step 1: Check duplicate promotion
    const duplicateCheck = this.checkDuplicatePromotion(
      context.candidate.candidateId,
      context.existingPromotions,
      ++stepNum
    );
    trace.push(duplicateCheck);

    if (duplicateCheck.impact === 'REJECT') {
      return {
        decision: 'REJECT',
        reason: 'Candidate already promoted',
        evaluationTrace: trace,
      };
    }

    // Step 2: Check candidate freshness
    const freshnessCheck = this.checkCandidateFreshness(
      context.candidate,
      context.policy,
      context.currentTime,
      ++stepNum
    );
    trace.push(freshnessCheck);

    if (freshnessCheck.impact === 'REJECT') {
      return {
        decision: 'REJECT',
        reason: 'Candidate is stale',
        evaluationTrace: trace,
      };
    }

    // Step 3: Check eligibility
    const eligibilityCheck = this.checkEligibility(
      context.candidate,
      context.policy,
      ++stepNum
    );
    trace.push(eligibilityCheck);

    if (eligibilityCheck.impact === 'REJECT') {
      return {
        decision: 'REJECT',
        reason: 'Candidate does not meet eligibility criteria',
        evaluationTrace: trace,
      };
    }

    // Step 4: Check authority permission
    const authorityCheck = this.checkAuthorityPermission(
      context.authority,
      context.candidate,
      context.policy,
      ++stepNum
    );
    trace.push(authorityCheck);

    if (authorityCheck.impact === 'REJECT') {
      return {
        decision: 'REJECT',
        reason: 'Authority not permitted for this candidate',
        evaluationTrace: trace,
      };
    }

    // Step 5: Check deferral conditions
    const deferralCheck = this.checkDeferralConditions(
      context.candidate,
      context.policy,
      context.activeIncidents,
      ++stepNum
    );
    trace.push(deferralCheck);

    if (deferralCheck.impact === 'DEFER') {
      return {
        decision: 'DEFER',
        reason: 'Deferral conditions met',
        evaluationTrace: trace,
      };
    }

    // All checks passed - PROMOTE
    return {
      decision: 'PROMOTE',
      reason: 'All policy conditions satisfied',
      evaluationTrace: trace,
    };
  }

  /**
   * Check if candidate was already promoted
   */
  private checkDuplicatePromotion(
    candidateId: string,
    existingPromotions: string[],
    step: number
  ): EvaluationStep {
    const isDuplicate = existingPromotions.includes(candidateId);

    return {
      step,
      check: 'duplicate_promotion',
      input: `candidateId=${candidateId}, existing=${existingPromotions.length}`,
      result: isDuplicate ? 'FAIL' : 'PASS',
      impact: isDuplicate ? 'REJECT' : 'CONTINUE',
      details: isDuplicate ? 'Candidate already promoted' : undefined,
    };
  }

  /**
   * Check candidate freshness
   */
  private checkCandidateFreshness(
    candidate: IncidentCandidate,
    policy: PromotionPolicy,
    currentTime: string,
    step: number
  ): EvaluationStep {
    const candidateTime = new Date(candidate.createdAt);
    const currentTimeDate = new Date(currentTime);
    const ageMinutes = (currentTimeDate.getTime() - candidateTime.getTime()) / (1000 * 60);
    const isStale = ageMinutes > policy.eligibility.maxAgeMinutes;

    return {
      step,
      check: 'candidate_freshness',
      input: `age=${ageMinutes.toFixed(1)}min, max=${policy.eligibility.maxAgeMinutes}min`,
      result: isStale ? 'FAIL' : 'PASS',
      impact: isStale ? 'REJECT' : 'CONTINUE',
      details: isStale ? `Candidate is ${ageMinutes.toFixed(1)} minutes old` : undefined,
    };
  }

  /**
   * Check candidate eligibility
   */
  private checkEligibility(
    candidate: IncidentCandidate,
    policy: PromotionPolicy,
    step: number
  ): EvaluationStep {
    const eligibility = policy.eligibility;
    const failures: string[] = [];

    // Check confidence
    const confidenceOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    if (confidenceOrder[candidate.confidence] < confidenceOrder[eligibility.minConfidence]) {
      failures.push(`confidence ${candidate.confidence} < ${eligibility.minConfidence}`);
    }

    // Check severity
    if (!eligibility.allowedSeverities.includes(candidate.suggestedSeverity)) {
      failures.push(`severity ${candidate.suggestedSeverity} not in ${eligibility.allowedSeverities.join(',')}`);
    }

    // Check detection count
    if (candidate.detectionIds.length < eligibility.minDetections) {
      failures.push(`detections ${candidate.detectionIds.length} < ${eligibility.minDetections}`);
    }

    // Check blast radius scope (if specified)
    if (eligibility.requiredBlastRadiusScope) {
      if (!eligibility.requiredBlastRadiusScope.includes(candidate.blastRadius.scope)) {
        failures.push(`blast radius ${candidate.blastRadius.scope} not in ${eligibility.requiredBlastRadiusScope.join(',')}`);
      }
    }

    const passed = failures.length === 0;

    return {
      step,
      check: 'eligibility',
      input: `confidence=${candidate.confidence}, severity=${candidate.suggestedSeverity}, detections=${candidate.detectionIds.length}`,
      result: passed ? 'PASS' : 'FAIL',
      impact: passed ? 'CONTINUE' : 'REJECT',
      details: passed ? undefined : failures.join('; '),
    };
  }

  /**
   * Check authority permission
   */
  private checkAuthorityPermission(
    authority: AuthorityContext,
    candidate: IncidentCandidate,
    policy: PromotionPolicy,
    step: number
  ): EvaluationStep {
    const failures: string[] = [];

    // Check if authority type is allowed by policy
    if (!policy.authorityRestrictions.allowedAuthorities.includes(authority.authorityType)) {
      failures.push(`authority ${authority.authorityType} not allowed by policy`);
    }

    // Check severity-specific overrides
    if (policy.authorityRestrictions.severityOverrides) {
      const severityAuthorities = policy.authorityRestrictions.severityOverrides[candidate.suggestedSeverity];
      if (severityAuthorities && !severityAuthorities.includes(authority.authorityType)) {
        failures.push(`authority ${authority.authorityType} not allowed for ${candidate.suggestedSeverity}`);
      }
    }

    // Check trust level permission
    const trustCheck = checkAuthorityPermission(authority.authorityType, candidate.suggestedSeverity);
    if (!trustCheck.allowed) {
      failures.push(trustCheck.reason!);
    }

    const passed = failures.length === 0;

    return {
      step,
      check: 'authority_permission',
      input: `authority=${authority.authorityType}, severity=${candidate.suggestedSeverity}`,
      result: passed ? 'PASS' : 'FAIL',
      impact: passed ? 'CONTINUE' : 'REJECT',
      details: passed ? undefined : failures.join('; '),
    };
  }

  /**
   * Check deferral conditions
   */
  private checkDeferralConditions(
    candidate: IncidentCandidate,
    policy: PromotionPolicy,
    activeIncidents: { service: string; incidentId: string }[],
    step: number
  ): EvaluationStep {
    const deferralReasons: string[] = [];

    // Check pending incident for service
    if (policy.deferralConditions.pendingIncidentForService) {
      const hasActiveIncident = activeIncidents.some(
        incident => incident.service === candidate.suggestedService
      );
      if (hasActiveIncident) {
        deferralReasons.push(`active incident exists for service ${candidate.suggestedService}`);
      }
    }

    // Note: Cooldown check would require additional context (recent promotions for same correlation)
    // This is handled at the engine level, not in pure evaluation

    const shouldDefer = deferralReasons.length > 0;

    return {
      step,
      check: 'deferral_conditions',
      input: `service=${candidate.suggestedService}, activeIncidents=${activeIncidents.length}`,
      result: shouldDefer ? 'FAIL' : 'PASS',
      impact: shouldDefer ? 'DEFER' : 'CONTINUE',
      details: shouldDefer ? deferralReasons.join('; ') : undefined,
    };
  }

  /**
   * Compute deterministic decision hash
   * 
   * @param context - Evaluation context
   * @param result - Evaluation result
   * @returns Decision hash
   */
  computeDecisionHash(context: EvaluationContext, result: EvaluationResult): string {
    return computeDecisionHash(
      result.decision,
      result.reason,
      context.policy.version,
      context.candidate.candidateId
    );
  }
}