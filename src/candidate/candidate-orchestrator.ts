/**
 * Phase 2.2 Week 3: Candidate Orchestrator
 * 
 * GLUE CODE ONLY - Connects correlation engine to CP-5
 * 
 * Responsibilities:
 * 1. Convert correlation results → candidate builder input
 * 2. Translate Phase 2.2 CorrelationRule → CP-5 CorrelationRule
 * 3. Compute deterministic candidate hash
 * 4. Template substitution (minimal, explicit)
 * 5. Call CP-5 candidate store
 * 
 * NOT RESPONSIBLE FOR:
 * - Signal ingestion
 * - Correlation logic
 * - Promotion decisions
 * - Incident creation
 */

import { createHash } from 'crypto';
import { CandidateBuilder } from './candidate-builder.js';
import { CandidateStore } from './candidate-store.js';
import type { CorrelationRule as Phase22CorrelationRule } from '../correlation/correlation-rule.schema.js';
import type { CorrelationRule as CP5CorrelationRule } from './correlation-rule.schema.js';
import type { SignalEvent } from '../signal/signal-event.schema.js';
import type { DetectionResult } from '../detection/detection-result.js';
import type { EvidenceGraph } from '../evidence/evidence-graph.schema.js';
import type { NormalizedSignal } from '../normalization/normalized-signal.schema.js';
import { ConfidenceCalculator } from '../confidence/confidence-calculator.js';
import type { CandidateAssessment } from '../confidence/confidence.schema.js';
import { EvidenceBuilder } from '../evidence/evidence-builder.js';
import type { DetectionSummary, NormalizedSeverity } from '../evidence/evidence-bundle.schema.js';

/**
 * Correlation context from correlation engine
 */
export interface CorrelationContext {
  rule: Phase22CorrelationRule;
  signals: SignalEvent[];
  windowStart: string;
  windowEnd: string;
  groupKey: Record<string, string>;
}

/**
 * Candidate generation result
 */
export interface CandidateGenerationResult {
  success: boolean;
  candidateId?: string;
  alreadyExists?: boolean;
  error?: string;
  confidence?: CandidateAssessment; // Phase 3.2: Attached in-memory only
}

/**
 * Template variables for title/description generation
 */
interface TemplateVariables {
  service: string;
  severity: string;
  signalCount: number;
  windowStart: string;
  windowEnd: string;
}

/**
 * Candidate Orchestrator
 * 
 * Glue layer between correlation engine and CP-5.
 * Deterministic, idempotent, replay-safe.
 */
export class CandidateOrchestrator {
  private readonly builder: CandidateBuilder;
  private readonly store: CandidateStore;
  private readonly confidenceCalculator: ConfidenceCalculator;
  private readonly evidenceBuilder: EvidenceBuilder;

  constructor(store: CandidateStore) {
    this.builder = new CandidateBuilder();
    this.store = store;
    this.confidenceCalculator = new ConfidenceCalculator(); // Phase 3.2
    this.evidenceBuilder = new EvidenceBuilder(); // Phase 3.2
  }

  /**
   * Generate candidate from correlation result
   * 
   * STEP 3.2: Deterministic hash computation
   * STEP 3.3: Template substitution
   * STEP 3.4: Wire to CP-5
   * 
   * @param context - Correlation context
   * @param detections - Detection results
   * @param graphs - Evidence graphs
   * @param signals - Normalized signals
   * @returns Generation result
   */
  async generateCandidate(
    context: CorrelationContext,
    detections: DetectionResult[],
    graphs: EvidenceGraph[],
    signals: NormalizedSignal[]
  ): Promise<CandidateGenerationResult> {
    try {
      // STEP 3.2: Compute deterministic candidate hash
      const candidateHash = this.computeCandidateHash({
        ruleId: context.rule.ruleId,
        ruleVersion: context.rule.ruleVersion,
        signalIds: context.signals.map(s => s.signalId).sort(),
        groupKey: context.groupKey,
        windowStart: context.windowStart,
      });

      // STEP 3.3: Prepare template variables
      const templateVars = this.extractTemplateVariables(context);

      // Translate Phase 2.2 rule → CP-5 rule
      const cp5Rule = this.translateRule(context.rule);

      // Build candidate using CP-5 builder
      const candidate = this.builder.build({
        detections,
        graphs,
        signals,
        rule: cp5Rule,
        windowStart: context.windowStart,
        windowEnd: context.windowEnd,
      });

      // Apply template substitution to title
      const substitutedTitle = this.substituteTemplate(
        candidate.suggestedTitle,
        templateVars
      );

      // Update candidate with substituted title, hash, and default policy
      const finalCandidate = {
        ...candidate,
        candidateId: candidateHash,
        suggestedTitle: substitutedTitle,
        policyId: 'default',  // TODO: Load from policy loader in Phase 2.3+
        policyVersion: '1.0.0',
      };

      // Phase 3.2: Build evidence bundle and assess confidence (in-memory only)
      let confidenceAssessment: CandidateAssessment | undefined;
      try {
        // Convert detections to detection summaries for evidence bundle
        const detectionSummaries: DetectionSummary[] = detections.map(d => ({
          detectionId: d.detectionId,
          ruleId: d.ruleId,
          ruleVersion: d.ruleVersion,
          severity: this.mapToNormalizedSeverity(d.severity), // Map raw severity to normalized
          confidence: d.confidence,
          detectedAt: d.detectedAt,
          signalIds: d.signalIds,
        }));

        // Build evidence bundle
        const evidenceBundle = this.evidenceBuilder.buildBundle(
          detectionSummaries,
          templateVars.service,
          context.windowStart,
          context.windowEnd
        );

        // Assess confidence
        confidenceAssessment = this.confidenceCalculator.assess(evidenceBundle);
      } catch (error) {
        // Confidence assessment is optional - don't fail candidate generation
        // Log error but continue (fail-open for confidence, fail-closed for candidate)
        console.warn('Confidence assessment failed:', error);
      }

      // STEP 3.4: Store in CP-5 (idempotent)
      // ❌ NO confidence persistence in Phase 3.2
      const storeResult = await this.store.store(finalCandidate);

      return {
        success: storeResult.success,
        candidateId: candidateHash,
        alreadyExists: storeResult.alreadyExists,
        error: storeResult.error,
        confidence: confidenceAssessment, // Attached in-memory only
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Translate Phase 2.2 CorrelationRule → CP-5 CorrelationRule
   * 
   * This is the glue layer's job - translate between schemas.
   * 
   * Phase 2.2 rule has: ruleId, ruleVersion, filters, timeWindow, groupBy, threshold
   * CP-5 rule expects: id, version, matcher, keyFields, primarySelection
   * 
   * @param phase22Rule - Phase 2.2 correlation rule
   * @returns CP-5 correlation rule
   */
  private translateRule(phase22Rule: Phase22CorrelationRule): CP5CorrelationRule {
    // Parse duration (e.g., "PT5M" → 5 minutes)
    const durationMatch = phase22Rule.timeWindow.duration.match(/^PT(\d+)([HMS])$/);
    if (!durationMatch) {
      throw new Error(`Invalid duration format: ${phase22Rule.timeWindow.duration}`);
    }

    const value = parseInt(durationMatch[1], 10);
    const unit = durationMatch[2];
    let windowMinutes: number;

    switch (unit) {
      case 'H':
        windowMinutes = value * 60;
        break;
      case 'M':
        windowMinutes = value;
        break;
      case 'S':
        windowMinutes = Math.ceil(value / 60);
        break;
      default:
        throw new Error(`Unsupported duration unit: ${unit}`);
    }

    // Determine window truncation based on duration
    let windowTruncation: 'minute' | 'hour' | 'day';
    if (windowMinutes >= 1440) {
      windowTruncation = 'day';
    } else if (windowMinutes >= 60) {
      windowTruncation = 'hour';
    } else {
      windowTruncation = 'minute';
    }

    // Build keyFields from groupBy
    const keyFields: Array<'service' | 'source' | 'ruleId' | 'signalType' | 'windowTruncated'> = [];
    if (phase22Rule.groupBy.service) {
      keyFields.push('service');
    }
    if (phase22Rule.groupBy.severity) {
      // Note: CP-5 doesn't have 'severity' as a keyField, so we skip it
      // This is a known limitation of the translation
    }
    if (phase22Rule.groupBy.identityWindow) {
      keyFields.push('windowTruncated');
    }

    // Ensure at least one keyField
    if (keyFields.length === 0) {
      keyFields.push('service'); // Default fallback
    }

    return {
      id: phase22Rule.ruleId,
      version: phase22Rule.ruleVersion,
      description: phase22Rule.description || phase22Rule.ruleName,
      matcher: {
        sameService: phase22Rule.groupBy.service,
        sameSource: false,
        sameRuleId: false,
        signalTypes: phase22Rule.filters.signalType,
        severities: phase22Rule.filters.severity as Array<'SEV1' | 'SEV2' | 'SEV3' | 'SEV4'> | undefined,
        windowMinutes,
        windowTruncation,
        minDetections: phase22Rule.threshold.minSignals,
        maxDetections: phase22Rule.threshold.maxSignals || 100,
      },
      keyFields,
      primarySelection: 'HIGHEST_SEVERITY_THEN_EARLIEST_THEN_LEXICAL' as const,
    };
  }

  /**
   * STEP 3.2: Compute deterministic candidate hash
   * 
   * Hash includes:
   * - ruleId
   * - ruleVersion (for rule evolution)
   * - sorted signalIds (order-independent)
   * - groupKey (correlation context)
   * - windowStart (time bucket)
   * 
   * Guarantees:
   * - Same signals → same candidate
   * - Replay-safe
   * - No duplicate candidates
   * 
   * @param params - Hash parameters
   * @returns SHA-256 hash (64 hex chars)
   */
  private computeCandidateHash(params: {
    ruleId: string;
    ruleVersion: string;
    signalIds: string[];
    groupKey: Record<string, string>;
    windowStart: string;
  }): string {
    const { ruleId, ruleVersion, signalIds, groupKey, windowStart } = params;

    // Canonical representation (order-independent)
    const canonical = {
      ruleId,
      ruleVersion,
      signalIds: signalIds.sort(), // Already sorted by caller, but explicit
      groupKey: this.canonicalizeGroupKey(groupKey),
      windowStart,
    };

    const hash = createHash('sha256');
    hash.update(JSON.stringify(canonical));
    return hash.digest('hex');
  }

  /**
   * Canonicalize group key (sorted keys)
   * 
   * @param groupKey - Group key object
   * @returns Canonical string representation
   */
  private canonicalizeGroupKey(groupKey: Record<string, string>): string {
    const sortedKeys = Object.keys(groupKey).sort();
    const pairs = sortedKeys.map(k => `${k}=${groupKey[k]}`);
    return pairs.join('&');
  }

  /**
   * STEP 3.3: Extract template variables from correlation context
   * 
   * @param context - Correlation context
   * @returns Template variables
   */
  private extractTemplateVariables(context: CorrelationContext): TemplateVariables {
    // Extract service from first signal (all should match if grouped by service)
    const service = context.signals[0]?.service || 'unknown';

    // Extract severity (highest in group)
    const severity = this.getHighestSeverity(context.signals);

    return {
      service,
      severity,
      signalCount: context.signals.length,
      windowStart: context.windowStart,
      windowEnd: context.windowEnd,
    };
  }

  /**
   * Get highest severity from signals
   * 
   * @param signals - Signal events
   * @returns Highest severity
   */
  private getHighestSeverity(signals: SignalEvent[]): string {
    const severityOrder = { SEV1: 0, SEV2: 1, SEV3: 2, SEV4: 3 };
    let highest = 'SEV4';
    let highestRank = 3;

    for (const signal of signals) {
      const rank = severityOrder[signal.severity as keyof typeof severityOrder];
      if (rank !== undefined && rank < highestRank) {
        highest = signal.severity;
        highestRank = rank;
      }
    }

    return highest;
  }

  /**
   * STEP 3.3: Template substitution (minimal, explicit)
   * 
   * Allowed variables ONLY:
   * - {{service}}
   * - {{severity}}
   * - {{signalCount}}
   * - {{windowStart}}
   * - {{windowEnd}}
   * 
   * No conditionals. No logic. No defaults.
   * If variable missing → fail closed.
   * 
   * @param template - Template string
   * @param vars - Template variables
   * @returns Substituted string
   * @throws if variable missing
   */
  private substituteTemplate(template: string, vars: TemplateVariables): string {
    let result = template;

    // Define allowed substitutions
    const substitutions: Record<string, string> = {
      '{{service}}': vars.service,
      '{{severity}}': vars.severity,
      '{{signalCount}}': vars.signalCount.toString(),
      '{{windowStart}}': vars.windowStart,
      '{{windowEnd}}': vars.windowEnd,
    };

    // Apply substitutions
    for (const [placeholder, value] of Object.entries(substitutions)) {
      result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }

    // Check for unresolved variables (fail closed)
    const unresolvedMatch = result.match(/{{([^}]+)}}/);
    if (unresolvedMatch) {
      throw new Error(`Unresolved template variable: ${unresolvedMatch[0]}`);
    }

    return result;
  }

  /**
   * Phase 3.2: Map raw severity to NormalizedSeverity
   * 
   * Maps SEV1/SEV2/SEV3/SEV4/SEV5 → CRITICAL/HIGH/MEDIUM/LOW/INFO
   * 
   * @param rawSeverity - Raw severity (SEV1-SEV5)
   * @returns Normalized severity
   */
  private mapToNormalizedSeverity(rawSeverity: string): NormalizedSeverity {
    switch (rawSeverity) {
      case 'SEV1':
        return 'CRITICAL';
      case 'SEV2':
        return 'HIGH';
      case 'SEV3':
        return 'MEDIUM';
      case 'SEV4':
        return 'LOW';
      case 'SEV5':
        return 'INFO';
      default:
        throw new Error(`Unknown severity: ${rawSeverity}`);
    }
  }
}
