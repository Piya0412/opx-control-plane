/**
 * CP-6: Promotion Engine (Orchestration)
 * 
 * Orchestrates promotion decision workflow with all corrections applied.
 * 
 * INVARIANTS:
 * - INV-6.1: Single Promotion Authority (only CP-6 emits PROMOTED_INCIDENT)
 * - INV-6.2: Candidate Immutability (never mutates candidates)
 * - INV-6.3: Explicit Authority Declaration (validates authority context)
 * - INV-6.4: Deterministic Outcome (injected currentTime, reproducible)
 * - INV-6.5: Append-Only Audit Trail (every decision audited)
 * - INV-6.6: Audit Failure Must Not Block Decision (decoupled audit)
 */

import { randomUUID } from 'crypto';
import { CandidateStore } from '../candidate/candidate-store.js';
import { IncidentCandidate } from '../candidate/candidate.schema.js';
import { PromotionGate } from './promotion-gate.js';
import { PolicyLoader } from './policy-loader.js';
import { PolicyEvaluator, EvaluationContext } from './policy-evaluator.js';
import { PromotionStore } from './promotion-store.js';
import { AuditEmitter } from './audit-emitter.js';
import { validateAuthorityContext } from './authority.schema.js';
import {
  PromotionRequest,
  PromotionDecision,
  computeDecisionId,
  computeDecisionHash,
} from './promotion.schema.js';

// === INCIDENT SERVICE CLIENT ===

export interface IncidentServiceClient {
  getActiveIncidents(service?: string): Promise<{ service: string; incidentId: string }[]>;
}

// === PROMOTION ENGINE CONFIG ===

export interface PromotionEngineConfig {
  candidateStore: CandidateStore;
  promotionStore: PromotionStore;
  policyLoader: PolicyLoader;
  auditEmitter: AuditEmitter;
  incidentServiceClient?: IncidentServiceClient;
}

/**
 * Promotion Engine
 * 
 * Orchestrates the complete promotion decision workflow.
 */
export class PromotionEngine {
  private readonly candidateStore: CandidateStore;
  private readonly promotionStore: PromotionStore;
  private readonly policyLoader: PolicyLoader;
  private readonly auditEmitter: AuditEmitter;
  private readonly incidentServiceClient?: IncidentServiceClient;
  private readonly gate: PromotionGate;
  private readonly evaluator: PolicyEvaluator;

  constructor(config: PromotionEngineConfig) {
    this.candidateStore = config.candidateStore;
    this.promotionStore = config.promotionStore;
    this.policyLoader = config.policyLoader;
    this.auditEmitter = config.auditEmitter;
    this.incidentServiceClient = config.incidentServiceClient;
    this.gate = new PromotionGate();
    this.evaluator = new PolicyEvaluator();
  }

  /**
   * Process promotion request
   * 
   * Main entry point for promotion decisions.
   * 
   * @param request - Promotion request
   * @param currentTime - Injected current time (for determinism)
   * @returns Promotion decision
   */
  async processPromotionRequest(
    request: PromotionRequest,
    currentTime: string
  ): Promise<PromotionDecision> {
    // Step 1: Gate validation (pure, structural only)
    const gateResult = this.gate.validateRequest(request);
    if (!gateResult.allowed) {
      throw new Error(`Gate validation failed: ${gateResult.reason}`);
    }

    // Step 2: Load candidate (I/O)
    const candidate = await this.loadCandidate(request.candidateId);

    // Step 3: Load policy (I/O)
    const policy = this.policyLoader.loadPolicy(request.policyId, request.policyVersion);

    // Step 4: Validate candidate integrity (I/O)
    await this.validateCandidateIntegrity(candidate);

    // Step 5: Validate authority context
    const authorityValidation = validateAuthorityContext({
      authorityType: request.authorityType,
      authorityId: request.authorityId,
      sessionId: request.sessionId,
      justification: request.justification,
      timestamp: request.requestedAt,
    });

    if (!authorityValidation.valid) {
      throw new Error(`Authority validation failed: ${authorityValidation.reason}`);
    }

    const authority = authorityValidation.context!;

    // Step 6: Build evaluation context
    const evaluationContext = await this.buildEvaluationContext(
      candidate,
      authority,
      policy,
      currentTime
    );

    // Step 7: Evaluate policy (pure)
    const evaluationResult = this.evaluator.evaluate(evaluationContext);

    // Step 8: Build promotion decision
    const decision = this.buildPromotionDecision(
      request,
      evaluationResult,
      policy,
      authority,
      currentTime
    );

    // Step 9: Store decision (idempotent)
    const storeResult = await this.promotionStore.storeDecision(decision);

    if (!storeResult.success && !storeResult.alreadyExists) {
      throw new Error(`Failed to store decision: ${storeResult.error}`);
    }

    // Step 10: Emit audit (decoupled, failure does not block)
    const auditResult = await this.auditEmitter.emitDecisionAudit(decision, evaluationContext);
    
    if (!auditResult.emitted) {
      // Log audit failure but continue (INV-6.6)
      console.warn('Audit emission failed but decision persisted', {
        decisionId: decision.decisionId,
        auditError: auditResult.error,
      });
    }

    return decision;
  }

  /**
   * Load candidate from store
   */
  private async loadCandidate(candidateId: string): Promise<IncidentCandidate> {
    const candidate = await this.candidateStore.get(candidateId);
    
    if (!candidate) {
      throw new Error(`Candidate not found: ${candidateId}`);
    }

    return candidate;
  }

  /**
   * Validate candidate integrity
   * 
   * 🔒 INV-6.2: Candidate Immutability - we only validate, never mutate
   */
  private async validateCandidateIntegrity(candidate: IncidentCandidate): Promise<void> {
    // Basic integrity checks
    if (!candidate.candidateId || candidate.candidateId.length !== 64) {
      throw new Error(`Invalid candidate ID format: ${candidate.candidateId}`);
    }

    if (!candidate.correlationKey || candidate.correlationKey.length !== 64) {
      throw new Error(`Invalid correlation key format: ${candidate.correlationKey}`);
    }

    if (candidate.detectionIds.length === 0) {
      throw new Error('Candidate has no detection IDs');
    }

    if (candidate.evidenceGraphIds.length === 0) {
      throw new Error('Candidate has no evidence graph IDs');
    }

    // Additional integrity checks could be added here
    // e.g., verify detection IDs exist, verify graph IDs exist, etc.
  }

  /**
   * Build evaluation context
   */
  private async buildEvaluationContext(
    candidate: IncidentCandidate,
    authority: any,
    policy: any,
    currentTime: string
  ): Promise<EvaluationContext> {
    // Fetch existing promotions for duplicate check
    const existingPromotions = await this.getExistingPromotions();

    // Fetch active incidents for deferral check
    const activeIncidents = await this.getActiveIncidents(candidate.suggestedService);

    return {
      candidate,
      authority,
      policy,
      currentTime, // Injected for determinism
      existingPromotions,
      activeIncidents,
    };
  }

  /**
   * Get existing promotions for duplicate check
   */
  private async getExistingPromotions(): Promise<string[]> {
    try {
      // Get recent decisions and filter for PROMOTE decisions
      const decisions = await this.promotionStore.listDecisions(1000);
      return decisions
        .filter(d => d.decision === 'PROMOTE')
        .map(d => d.candidateId);
    } catch (error) {
      console.error('Failed to fetch existing promotions', { error });
      return []; // Fail open for this check
    }
  }

  /**
   * Get active incidents for deferral check
   */
  private async getActiveIncidents(service?: string): Promise<{ service: string; incidentId: string }[]> {
    if (!this.incidentServiceClient) {
      return []; // No incident service configured
    }

    try {
      return await this.incidentServiceClient.getActiveIncidents(service);
    } catch (error) {
      console.error('Failed to fetch active incidents', { error });
      return []; // Fail open for this check
    }
  }

  /**
   * Build promotion decision
   * 
   * 🔒 CORRECTION 1: decisionId excludes authorityId
   */
  private buildPromotionDecision(
    request: PromotionRequest,
    evaluationResult: any,
    policy: any,
    authority: any,
    currentTime: string
  ): PromotionDecision {
    // 🔒 CORRECTION 1: Identity excludes authorityId
    const decisionId = computeDecisionId(
      request.candidateId,
      request.policyId,
      request.policyVersion,
      request.requestContextHash
    );

    const decisionHash = computeDecisionHash(
      evaluationResult.decision,
      evaluationResult.reason,
      policy.version,
      request.candidateId
    );

    return {
      // IDENTITY (deterministic, idempotent)
      decisionId,
      
      // Request reference
      requestId: request.requestId,
      candidateId: request.candidateId,
      
      // Decision
      decision: evaluationResult.decision,
      reason: evaluationResult.reason,
      
      // Policy (pinned)
      policyId: request.policyId,
      policyVersion: request.policyVersion,
      
      // ATTRIBUTION (auditable, NOT part of identity)
      authorityType: request.authorityType,
      authorityId: request.authorityId,
      justification: request.justification,
      sessionId: request.sessionId,
      
      // Integrity
      decisionHash,
      
      // Timestamp (from injected currentTime, NOT Date.now())
      decidedAt: currentTime,
    };
  }

  /**
   * Check if candidate was already promoted
   * 
   * @param candidateId - Candidate ID
   * @returns True if already promoted
   */
  async isAlreadyPromoted(candidateId: string): Promise<boolean> {
    return await this.promotionStore.isAlreadyPromoted(candidateId);
  }

  /**
   * Get promotion decision by candidate
   * 
   * @param candidateId - Candidate ID
   * @returns Decision or null
   */
  async getPromotionDecision(candidateId: string): Promise<PromotionDecision | null> {
    return await this.promotionStore.getDecisionByCandidate(candidateId);
  }

  /**
   * List recent decisions by authority
   * 
   * @param authorityId - Authority ID
   * @param limit - Maximum results
   * @returns Array of decisions
   */
  async listDecisionsByAuthority(authorityId: string, limit = 100): Promise<PromotionDecision[]> {
    return await this.promotionStore.listDecisionsByAuthority(authorityId, limit);
  }
}