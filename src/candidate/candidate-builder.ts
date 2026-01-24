/**
 * CP-5: Candidate Builder
 * 
 * Pure function to build incident candidates.
 * 
 * INVARIANTS:
 * - PURE: No side effects
 * - DETERMINISTIC: Same inputs → same output
 * - ORDER-INDEPENDENT: Detection order doesn't affect result
 * 
 * 🔒 HARDENING #1: Order-independent
 * 🔒 HARDENING #2: Deterministic primary selection
 * 🔒 FIX-A: keyFields included in correlation key
 */

import { DetectionResult } from '../detection/detection-result.js';
import { EvidenceGraph } from '../evidence/evidence-graph.schema.js';
import { NormalizedSignal } from '../normalization/normalized-signal.schema.js';
import {
  IncidentCandidate,
  BlastRadius,
  ConfidenceFactor,
  GenerationStep,
  ResolvedKeyFields,
  CandidateSeverity,
  CANDIDATE_VERSION,
  MAX_TRACE_STEPS,
  computeCandidateId,
  computeCorrelationKey,
} from './candidate.schema.js';
import { CorrelationRule, KeyField } from './correlation-rule.schema.js';

export interface CandidateBuilderInput {
  detections: DetectionResult[];
  graphs: EvidenceGraph[];
  signals: NormalizedSignal[];
  rule: CorrelationRule;
  windowStart: string;
  windowEnd: string;
}

/**
 * Candidate Builder
 * 
 * Builds incident candidates from correlated detections.
 * Pure, deterministic, order-independent.
 */
export class CandidateBuilder {
  /**
   * Build candidate from correlated detections
   * 
   * @param input - Builder input
   * @returns Incident candidate
   * @throws if input is invalid
   */
  build(input: CandidateBuilderInput): IncidentCandidate {
    const { detections, graphs, signals, rule, windowStart, windowEnd } = input;
    const trace: GenerationStep[] = [];
    let stepNum = 0;

    // Step 1: Validate inputs
    if (detections.length === 0) {
      throw new Error('Cannot build candidate with zero detections');
    }
    trace.push({
      step: ++stepNum,
      action: 'validate_inputs',
      input: `${detections.length} detections, ${graphs.length} graphs, ${signals.length} signals`,
      output: 'valid',
    });

    // Step 2: Compute window truncation
    const windowTruncated = this.truncateWindow(windowStart, rule.matcher.windowTruncation);
    trace.push({
      step: ++stepNum,
      action: 'truncate_window',
      input: windowStart,
      output: windowTruncated,
      rule: `truncation=${rule.matcher.windowTruncation}`,
    });

    // Step 3: Select primary detection (HARDENING #2)
    const primaryDetection = this.selectPrimaryDetection(detections);
    trace.push({
      step: ++stepNum,
      action: 'select_primary_detection',
      input: `${detections.length} candidates`,
      output: primaryDetection.detectionId,
      rule: 'HIGHEST_SEVERITY_THEN_EARLIEST_THEN_LEXICAL',
    });

    // Step 4: Resolve keyFields (FIX-A)
    const resolvedKeyFields = this.resolveKeyFields(
      detections,
      signals,
      rule,
      windowTruncated,
      primaryDetection
    );
    trace.push({
      step: ++stepNum,
      action: 'resolve_key_fields',
      input: `keyFields=[${rule.keyFields.join(',')}]`,
      output: this.serializeKeyFields(resolvedKeyFields),
      rule: rule.id,
    });

    // Step 5: Compute correlation key (order-independent, includes keyFields)
    const detectionIds = detections.map(d => d.detectionId);
    const correlationKey = computeCorrelationKey(
      detectionIds,
      rule.id,
      rule.version,
      resolvedKeyFields
    );
    trace.push({
      step: ++stepNum,
      action: 'compute_correlation_key',
      input: `${detectionIds.length} detection IDs + keyFields`,
      output: correlationKey.substring(0, 16) + '...',
      rule: `${rule.id}@${rule.version}`,
    });

    // Step 6: Compute confidence
    const { confidence, factors } = this.computeConfidence(detections, rule);
    trace.push({
      step: ++stepNum,
      action: 'compute_confidence',
      input: `${factors.length} factors`,
      output: confidence,
    });

    // Step 7: Estimate blast radius
    const blastRadius = this.estimateBlastRadius(detections, signals);
    trace.push({
      step: ++stepNum,
      action: 'estimate_blast_radius',
      input: `${signals.length} signals`,
      output: `${blastRadius.scope}, impact=${blastRadius.estimatedImpact}`,
    });

    // Step 8: Generate title
    const suggestedTitle = this.generateTitle(primaryDetection, detections.length);
    trace.push({
      step: ++stepNum,
      action: 'generate_title',
      input: primaryDetection.ruleId,
      output: suggestedTitle,
    });

    // Step 9: Compute candidate ID
    const candidateId = computeCandidateId(correlationKey, CANDIDATE_VERSION);
    trace.push({
      step: ++stepNum,
      action: 'compute_candidate_id',
      input: correlationKey.substring(0, 16) + '...',
      output: candidateId.substring(0, 16) + '...',
    });

    return {
      candidateId,
      candidateVersion: CANDIDATE_VERSION,
      correlationKey,
      correlationRule: rule.id,
      correlationRuleVersion: rule.version,
      evidenceGraphIds: graphs.map(g => g.graphId).sort(),
      detectionIds: detectionIds.sort(),
      primaryDetectionId: primaryDetection.detectionId,
      suggestedSeverity: primaryDetection.severity as CandidateSeverity,
      suggestedService: this.extractService(signals),
      suggestedTitle,
      confidence,
      confidenceFactors: factors,
      blastRadius,
      generationTrace: trace.slice(0, MAX_TRACE_STEPS),
      windowStart,
      windowEnd,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Select primary detection
   * 
   * 🔒 HARDENING #2: Total-order deterministic
   * 1. Highest severity (SEV1 > SEV2 > SEV3 > SEV4)
   * 2. If tie → earliest timestamp
   * 3. If tie → lexicographically smallest detectionId
   */
  private selectPrimaryDetection(detections: DetectionResult[]): DetectionResult {
    const severityOrder: Record<string, number> = {
      SEV1: 1,
      SEV2: 2,
      SEV3: 3,
      SEV4: 4,
    };

    return [...detections].sort((a, b) => {
      // 1. Highest severity first
      const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (sevDiff !== 0) return sevDiff;

      // 2. Earliest timestamp
      const timeDiff = a.signalTimestamp.localeCompare(b.signalTimestamp);
      if (timeDiff !== 0) return timeDiff;

      // 3. Lexicographically smallest detectionId
      return a.detectionId.localeCompare(b.detectionId);
    })[0];
  }

  /**
   * Truncate window based on rule configuration
   * Uses UTC methods to ensure deterministic behavior regardless of server timezone
   */
  private truncateWindow(
    timestamp: string,
    truncation: 'minute' | 'hour' | 'day'
  ): string {
    const date = new Date(timestamp);

    switch (truncation) {
      case 'minute':
        date.setUTCSeconds(0, 0);
        break;
      case 'hour':
        date.setUTCMinutes(0, 0, 0);
        break;
      case 'day':
        date.setUTCHours(0, 0, 0, 0);
        break;
    }

    return date.toISOString();
  }

  /**
   * Resolve keyFields from rule declaration
   * 
   * 🔒 FIX-A: keyFields declared in rule MUST affect correlation key
   */
  private resolveKeyFields(
    detections: DetectionResult[],
    signals: NormalizedSignal[],
    rule: CorrelationRule,
    windowTruncated: string,
    primaryDetection: DetectionResult
  ): ResolvedKeyFields {
    const resolved: ResolvedKeyFields = { windowTruncated };

    // Find primary signal
    const primarySignal = signals.find(
      s => s.normalizedSignalId === primaryDetection.normalizedSignalId
    );

    for (const keyField of rule.keyFields) {
      switch (keyField) {
        case 'service':
          resolved.service = primarySignal?.resourceRefs?.[0]?.refValue || 
                            this.extractService(signals);
          break;
        case 'source':
          resolved.source = primarySignal?.source || 'unknown';
          break;
        case 'ruleId':
          resolved.ruleId = primaryDetection.ruleId;
          break;
        case 'signalType':
          resolved.signalType = primarySignal?.signalType || 'unknown';
          break;
        case 'windowTruncated':
          // Already included
          break;
      }
    }

    return resolved;
  }

  /**
   * Serialize key fields for trace output
   */
  private serializeKeyFields(fields: ResolvedKeyFields): string {
    const parts: string[] = [];
    if (fields.service) parts.push(`service=${fields.service}`);
    if (fields.source) parts.push(`source=${fields.source}`);
    if (fields.ruleId) parts.push(`ruleId=${fields.ruleId}`);
    if (fields.signalType) parts.push(`signalType=${fields.signalType}`);
    parts.push(`windowTruncated=${fields.windowTruncated}`);
    return parts.join(', ');
  }

  /**
   * Compute confidence (rule-based)
   */
  private computeConfidence(
    detections: DetectionResult[],
    rule: CorrelationRule
  ): { confidence: 'HIGH' | 'MEDIUM' | 'LOW'; factors: ConfidenceFactor[] } {
    const factors: ConfidenceFactor[] = [];
    let score = 0.5; // Base confidence
    const boosts = rule.confidenceBoost || {};

    // Factor 1: Multiple detections
    if (detections.length > 1 && boosts.multipleDetections) {
      const boost = Math.min(boosts.multipleDetections, detections.length * 0.05);
      score += boost;
      factors.push({
        factor: 'multiple_detections',
        weight: boost,
        evidence: `${detections.length} detections correlated`,
      });
    }

    // Factor 2: High severity rule
    const hasHighSeverity = detections.some(
      d => d.severity === 'SEV1' || d.severity === 'SEV2'
    );
    if (hasHighSeverity && boosts.highSeverityRule) {
      score += boosts.highSeverityRule;
      factors.push({
        factor: 'high_severity_rule',
        weight: boosts.highSeverityRule,
        evidence: 'At least one SEV1/SEV2 detection',
      });
    }

    // Factor 3: High confidence detections
    const highConfCount = detections.filter(d => d.confidence === 'HIGH').length;
    if (highConfCount > 0 && boosts.highConfidenceDetections) {
      const boost = Math.min(boosts.highConfidenceDetections, highConfCount * 0.1);
      score += boost;
      factors.push({
        factor: 'high_confidence_detections',
        weight: boost,
        evidence: `${highConfCount} high-confidence detections`,
      });
    }

    // Clamp and convert
    score = Math.min(1, Math.max(0, score));
    const confidence: 'HIGH' | 'MEDIUM' | 'LOW' =
      score >= 0.8 ? 'HIGH' : score >= 0.5 ? 'MEDIUM' : 'LOW';

    return { confidence, factors };
  }

  /**
   * Estimate blast radius (structural)
   */
  private estimateBlastRadius(
    detections: DetectionResult[],
    signals: NormalizedSignal[]
  ): BlastRadius {
    const services = new Set<string>();
    const resources = new Set<string>();

    for (const signal of signals) {
      // Extract service from resource refs
      for (const ref of signal.resourceRefs || []) {
        if (ref.refType === 'name' || ref.refType === 'id') {
          services.add(ref.refValue);
        }
      }
      // Also use source as a service indicator
      services.add(signal.source);

      // Collect resources
      for (const ref of signal.resourceRefs || []) {
        if (ref.refType === 'aws-arn') {
          resources.add(ref.refValue);
        }
      }
    }

    // Determine scope
    const hasInfraSignal = signals.some(s => 
      s.signalType.toLowerCase().includes('infrastructure')
    );
    const scope: BlastRadius['scope'] =
      services.size > 1
        ? 'MULTI_SERVICE'
        : hasInfraSignal
        ? 'INFRASTRUCTURE'
        : 'SINGLE_SERVICE';

    // Estimate impact from severity
    const severityOrder: Record<string, number> = {
      SEV1: 1,
      SEV2: 2,
      SEV3: 3,
      SEV4: 4,
    };
    const maxSeverity = Math.min(
      ...detections.map(d => severityOrder[d.severity] || 4)
    );

    const estimatedImpact: BlastRadius['estimatedImpact'] =
      maxSeverity === 1
        ? 'CRITICAL'
        : maxSeverity === 2
        ? 'HIGH'
        : services.size > 1
        ? 'MEDIUM'
        : 'LOW';

    return {
      scope,
      affectedServices: Array.from(services).slice(0, 50).sort(),
      affectedResources: Array.from(resources).slice(0, 20).sort(),
      estimatedImpact,
    };
  }

  /**
   * Generate suggested title
   */
  private generateTitle(primary: DetectionResult, count: number): string {
    const suffix = count > 1 ? ` (+${count - 1} related)` : '';
    return `[${primary.severity}] ${primary.ruleId} detected${suffix}`;
  }

  /**
   * Extract primary service from signals
   */
  private extractService(signals: NormalizedSignal[]): string {
    if (signals.length === 0) return 'unknown';

    // Count sources as services
    const counts = new Map<string, number>();
    for (const s of signals) {
      counts.set(s.source, (counts.get(s.source) || 0) + 1);
    }

    // Return most common
    let maxService = signals[0].source;
    let maxCount = 0;
    for (const [service, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        maxService = service;
      }
    }

    return maxService;
  }
}
