/**
 * CP-6: Audit Emitter (Decoupled from Success Path)
 * 
 * Emits audit events for promotion decisions.
 * 
 * 🔒 CORRECTION 3: Audit emission MUST be decoupled from success path
 * 🔒 INV-6.6: Audit Failure Must Not Block Decision
 * - Decision persistence succeeds even if audit fails
 * - Failure recorded locally (log + metric)
 * - Background re-emission allowed
 */

import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { randomUUID } from 'crypto';
import { PromotionDecision, PromotionAuditRecord } from './promotion.schema.js';
import { EvaluationContext } from './policy-evaluator.js';

// === AUDIT EVENT ===

export interface AuditEvent {
  eventType: 'PROMOTION_DECISION';
  eventId: string;
  timestamp: string;
  payload: PromotionAuditRecord;
}

// === AUDIT EMIT RESULT ===

export interface AuditEmitResult {
  emitted: boolean;
  eventId?: string;
  error?: string;
}

export interface AuditEmitterConfig {
  eventBusName: string;
  region?: string;
}

/**
 * Audit Emitter
 * 
 * Emits promotion decision audit events to EventBridge.
 */
export class AuditEmitter {
  private readonly client: EventBridgeClient;
  private readonly eventBusName: string;

  constructor(config: AuditEmitterConfig) {
    this.client = new EventBridgeClient({
      region: config.region || process.env.AWS_REGION || 'us-east-1',
    });
    this.eventBusName = config.eventBusName;
  }

  /**
   * Emit decision audit event
   * 
   * 🔒 CORRECTION 3: Audit failure MUST NOT block decision persistence
   * Returns result, does not throw.
   * 
   * @param decision - Promotion decision
   * @param context - Evaluation context
   * @returns Audit emit result
   */
  async emitDecisionAudit(
    decision: PromotionDecision,
    context: EvaluationContext
  ): Promise<AuditEmitResult> {
    try {
      // Build audit record
      const auditRecord = this.buildAuditRecord(decision, context);
      
      // Create audit event
      const auditEvent: AuditEvent = {
        eventType: 'PROMOTION_DECISION',
        eventId: auditRecord.auditId,
        timestamp: auditRecord.createdAt,
        payload: auditRecord,
      };

      // Emit to EventBridge
      await this.client.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: 'opx.promotion',
              DetailType: 'Promotion Decision',
              Detail: JSON.stringify(auditEvent),
              EventBusName: this.eventBusName,
              Time: new Date(auditEvent.timestamp),
            },
          ],
        })
      );

      return {
        emitted: true,
        eventId: auditEvent.eventId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // 🔒 INV-6.6: Log failure for background retry, but don't throw
      this.logAuditFailure(decision, error as Error);

      return {
        emitted: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Build audit record from decision and context
   * 
   * @param decision - Promotion decision
   * @param context - Evaluation context
   * @returns Audit record
   */
  private buildAuditRecord(
    decision: PromotionDecision,
    context: EvaluationContext
  ): PromotionAuditRecord {
    return {
      // Audit identity
      auditId: randomUUID(),
      
      // Decision reference
      decisionId: decision.decisionId,
      requestId: decision.requestId,
      candidateId: decision.candidateId,
      
      // Decision summary
      decision: decision.decision,
      reason: decision.reason,
      
      // Policy snapshot (serialized policy used)
      policySnapshot: JSON.stringify({
        id: context.policy.id,
        version: context.policy.version,
        description: context.policy.description,
        eligibility: context.policy.eligibility,
        authorityRestrictions: context.policy.authorityRestrictions,
        deferralConditions: context.policy.deferralConditions,
        rejectionConditions: context.policy.rejectionConditions,
      }),
      
      // Input snapshot (serialized inputs)
      inputSnapshot: JSON.stringify({
        candidateId: context.candidate.candidateId,
        candidateVersion: context.candidate.candidateVersion,
        suggestedSeverity: context.candidate.suggestedSeverity,
        suggestedService: context.candidate.suggestedService,
        confidence: context.candidate.confidence,
        detectionCount: context.candidate.detectionIds.length,
        blastRadius: context.candidate.blastRadius,
        currentTime: context.currentTime,
        existingPromotions: context.existingPromotions.length,
        activeIncidents: context.activeIncidents.length,
      }),
      
      // Authority context
      authorityContext: {
        authorityType: context.authority.authorityType,
        authorityId: context.authority.authorityId,
        justification: context.authority.justification,
        sessionId: context.authority.sessionId,
        timestamp: context.authority.timestamp,
      },
      
      // Audit timestamp
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Log audit failure for background retry
   * 
   * 🔒 INV-6.6: Failure recorded locally, decision still succeeds
   * 
   * @param decision - Promotion decision
   * @param error - Audit error
   */
  private logAuditFailure(decision: PromotionDecision, error: Error): void {
    console.error('Audit emission failed', {
      decisionId: decision.decisionId,
      candidateId: decision.candidateId,
      decision: decision.decision,
      error: error.message,
      timestamp: new Date().toISOString(),
    });

    // In production, this would also:
    // 1. Emit CloudWatch metric for audit failures
    // 2. Add to retry queue for background re-emission
    // 3. Alert on high failure rates
    
    // Example metric emission (commented out for now):
    // await this.cloudWatchClient.putMetricData({
    //   Namespace: 'OPX/Promotion',
    //   MetricData: [{
    //     MetricName: 'AuditEmissionFailure',
    //     Value: 1,
    //     Unit: 'Count',
    //     Dimensions: [{
    //       Name: 'Decision',
    //       Value: decision.decision,
    //     }],
    //   }],
    // });
  }

  /**
   * Emit multiple audit events (batch)
   * 
   * @param decisions - Array of decisions with contexts
   * @returns Array of emit results
   */
  async emitBatchAudit(
    decisions: Array<{ decision: PromotionDecision; context: EvaluationContext }>
  ): Promise<AuditEmitResult[]> {
    const results: AuditEmitResult[] = [];

    // Process in parallel but limit concurrency
    const batchSize = 10;
    for (let i = 0; i < decisions.length; i += batchSize) {
      const batch = decisions.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(({ decision, context }) => this.emitDecisionAudit(decision, context))
      );
      results.push(...batchResults);
    }

    return results;
  }
}