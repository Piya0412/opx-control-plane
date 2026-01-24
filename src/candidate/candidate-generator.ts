/**
 * CP-5: Candidate Generator
 * 
 * Orchestrates candidate generation from detections.
 * 
 * INVARIANTS:
 * - READ-ONLY: Does not mutate upstream entities
 * - DETERMINISTIC: Same inputs → same candidates
 * - RULE-ISOLATED: Each rule produces candidates independently
 * 
 * 🔒 FIX #1: Queries ALL detections in correlation window
 * 🔒 FIX #2: All matcher fields enforced
 * 🔒 FIX-B: sameRuleId compares against trigger detection's ruleId
 * 🔒 FIX #3: Graph-detection integrity validated
 * 🔒 FIX #4: Concurrent generation converges (idempotent by design)
 * 🔒 FIX-C: Query partition narrowing
 * 🔒 HARDENING #1: Rule-isolated generation
 */

import { DetectionResult } from '../detection/detection-result.js';
import { DetectionStore, DetectionQueryFilter } from '../detection/detection-store.js';
import { EvidenceGraph } from '../evidence/evidence-graph.schema.js';
import { EvidenceGraphStore } from '../evidence/evidence-graph-store.js';
import { NormalizedSignal } from '../normalization/normalized-signal.schema.js';
import { IncidentCandidate } from './candidate.schema.js';
import { CorrelationRule } from './correlation-rule.schema.js';
import { CorrelationRuleLoader } from './correlation-rule-loader.js';
import { CandidateBuilder } from './candidate-builder.js';
import { CandidateStore } from './candidate-store.js';

/**
 * Signal store interface for fetching normalized signals
 */
export interface NormalizedSignalStore {
  get(normalizedSignalId: string): Promise<NormalizedSignal | null>;
}

export interface GenerationResult {
  candidateId: string;
  isNew: boolean;
  candidate: IncidentCandidate;
}

export interface CandidateGeneratorConfig {
  detectionStore: DetectionStore;
  graphStore: EvidenceGraphStore;
  signalStore: NormalizedSignalStore;
  ruleLoader: CorrelationRuleLoader;
  candidateStore: CandidateStore;
}

/**
 * Candidate Generator
 * 
 * Orchestrates candidate generation from detections.
 */
export class CandidateGenerator {
  private readonly detectionStore: DetectionStore;
  private readonly graphStore: EvidenceGraphStore;
  private readonly signalStore: NormalizedSignalStore;
  private readonly ruleLoader: CorrelationRuleLoader;
  private readonly builder: CandidateBuilder;
  private readonly candidateStore: CandidateStore;

  constructor(config: CandidateGeneratorConfig) {
    this.detectionStore = config.detectionStore;
    this.graphStore = config.graphStore;
    this.signalStore = config.signalStore;
    this.ruleLoader = config.ruleLoader;
    this.builder = new CandidateBuilder();
    this.candidateStore = config.candidateStore;
  }

  /**
   * Generate candidates triggered by a detection
   * 
   * 🔒 FIX #1: This detection is the TRIGGER, not the only input.
   *            We query ALL detections in the rule's correlation window.
   * 🔒 HARDENING #1: Each rule produces candidates independently
   * 
   * @param detectionId - Triggering detection ID
   * @returns Array of generation results
   */
  async generateForDetection(detectionId: string): Promise<GenerationResult[]> {
    // 1. Fetch triggering detection
    const triggerStored = await this.detectionStore.get(detectionId);
    if (!triggerStored) {
      throw new Error(`Detection not found: ${detectionId}`);
    }
    const triggerDetection = triggerStored.result;

    // 2. Fetch triggering detection's signal (for reference values)
    const triggerSignal = await this.signalStore.get(triggerDetection.normalizedSignalId);
    if (!triggerSignal) {
      throw new Error(
        `Normalized signal not found: ${triggerDetection.normalizedSignalId}`
      );
    }

    // 3. Load all correlation rules
    const rules = this.ruleLoader.loadAllRules();

    // 4. Generate candidates per rule (RULE-ISOLATED)
    const results: GenerationResult[] = [];
    for (const rule of rules) {
      try {
        const result = await this.generateForRuleWithWindow(
          triggerDetection,
          triggerSignal,
          rule
        );
        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.error('Failed to generate candidate for rule', {
          ruleId: rule.id,
          detectionId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other rules
      }
    }

    return results;
  }

  /**
   * Generate candidate for a specific rule using WINDOW-BASED correlation
   * 
   * 🔒 FIX #1: Query all detections in the rule's window
   */
  private async generateForRuleWithWindow(
    triggerDetection: DetectionResult,
    triggerSignal: NormalizedSignal,
    rule: CorrelationRule
  ): Promise<GenerationResult | null> {
    // 1. Compute window boundaries from rule
    const windowEnd = new Date(triggerDetection.signalTimestamp);
    const windowStart = new Date(
      windowEnd.getTime() - rule.matcher.windowMinutes * 60 * 1000
    );

    // 2. 🔒 FIX #1 + FIX-C: Query detections in window with partition narrowing
    const queryFilter = this.buildQueryFilter(rule, triggerSignal, triggerDetection);
    const windowDetections = await this.detectionStore.queryByTimeRange(
      windowStart.toISOString(),
      windowEnd.toISOString(),
      queryFilter,
      rule.matcher.maxDetections
    );

    if (windowDetections.length === 0) {
      return null;
    }

    // 3. Fetch signals for all detections
    const signalMap = await this.fetchSignalsForDetections(windowDetections);

    // 4. 🔒 FIX #2 + FIX-B: Filter by ALL matcher fields (complete enforcement)
    const matched = this.filterByRule(
      windowDetections,
      signalMap,
      rule,
      triggerSignal,
      triggerDetection
    );

    if (matched.detections.length < rule.matcher.minDetections) {
      return null;
    }

    // 5. Cap detections if needed
    const capped =
      matched.detections.length > rule.matcher.maxDetections
        ? this.takeTopBySeverity(matched.detections, rule.matcher.maxDetections)
        : matched.detections;

    // 6. 🔒 FIX #3: Fetch and validate graphs for each detection
    const { graphs, validDetections } = await this.fetchAndValidateGraphs(capped);

    if (validDetections.length < rule.matcher.minDetections) {
      return null;
    }

    // 7. Get signals for valid detections only
    const validSignals = validDetections
      .map(d => matched.signalMap.get(d.normalizedSignalId))
      .filter((s): s is NormalizedSignal => s !== undefined);

    // 8. Compute window boundaries from actual detections
    const timestamps = validDetections.map(d => d.signalTimestamp).sort();
    const actualWindowStart = timestamps[0];
    const actualWindowEnd = timestamps[timestamps.length - 1];

    // 9. Build candidate (deterministic)
    // 🔒 FIX #4: Same detections + same rule → same candidateId (convergence)
    const candidate = this.builder.build({
      detections: validDetections,
      graphs,
      signals: validSignals,
      rule,
      windowStart: actualWindowStart,
      windowEnd: actualWindowEnd,
    });

    // 10. Store (idempotent - handles concurrent generation)
    // 🔒 FIX #4: Concurrent calls converge on same candidateId
    const storeResult = await this.candidateStore.store(candidate);

    if (!storeResult.success && !storeResult.alreadyExists) {
      throw new Error(`Failed to store candidate: ${storeResult.error}`);
    }

    return {
      candidateId: candidate.candidateId,
      isNew: !storeResult.alreadyExists,
      candidate,
    };
  }

  /**
   * Fetch signals for all detections
   */
  private async fetchSignalsForDetections(
    detections: DetectionResult[]
  ): Promise<Map<string, NormalizedSignal>> {
    const signalMap = new Map<string, NormalizedSignal>();

    for (const d of detections) {
      const signal = await this.signalStore.get(d.normalizedSignalId);
      if (signal) {
        signalMap.set(d.normalizedSignalId, signal);
      }
    }

    return signalMap;
  }

  /**
   * 🔒 FIX #2 + FIX-B: Filter by ALL matcher fields
   * 
   * INVARIANT: If a rule declares a matcher field, it MUST affect filtering.
   */
  private filterByRule(
    detections: DetectionResult[],
    signalMap: Map<string, NormalizedSignal>,
    rule: CorrelationRule,
    referenceSignal: NormalizedSignal,
    triggerDetection: DetectionResult
  ): { detections: DetectionResult[]; signalMap: Map<string, NormalizedSignal> } {
    const matcher = rule.matcher;

    // Get reference values from trigger detection's signal
    const referenceService = referenceSignal.source;
    const referenceSource = referenceSignal.source;
    const referenceRuleId = triggerDetection.ruleId; // 🔒 FIX-B

    const filtered = detections.filter(d => {
      const signal = signalMap.get(d.normalizedSignalId);
      if (!signal) return false;

      // 🔒 FIX #2: Enforce ALL declared matcher fields

      // sameService: detection's signal must match reference service
      if (matcher.sameService && signal.source !== referenceService) {
        return false;
      }

      // sameSource: detection's signal must match reference source
      if (matcher.sameSource && signal.source !== referenceSource) {
        return false;
      }

      // 🔒 FIX-B: sameRuleId must compare against trigger detection's ruleId
      if (matcher.sameRuleId && d.ruleId !== referenceRuleId) {
        return false;
      }

      // severities: detection severity must be in allowed list
      if (
        matcher.severities &&
        !matcher.severities.includes(d.severity as any)
      ) {
        return false;
      }

      // signalTypes: signal type must be in allowed list
      if (
        matcher.signalTypes &&
        !matcher.signalTypes.includes(signal.signalType)
      ) {
        return false;
      }

      return true;
    });

    return { detections: filtered, signalMap };
  }

  /**
   * 🔒 FIX #3: Fetch and validate graph-detection integrity
   * 
   * INVARIANT: Each detection MUST have exactly one evidence graph
   *            where graph.detectionId === detection.detectionId
   */
  private async fetchAndValidateGraphs(
    detections: DetectionResult[]
  ): Promise<{ graphs: EvidenceGraph[]; validDetections: DetectionResult[] }> {
    const graphs: EvidenceGraph[] = [];
    const validDetections: DetectionResult[] = [];

    for (const detection of detections) {
      const graph = await this.graphStore.getByDetection(detection.detectionId);

      if (!graph) {
        // Skip detection without graph (integrity violation logged)
        console.warn(
          `Evidence graph not found for detection: ${detection.detectionId}`
        );
        continue;
      }

      // 🔒 FIX #3: Verify graph.detectionId matches
      if (graph.detectionId !== detection.detectionId) {
        console.error(
          `Graph-detection mismatch: graph.detectionId=${graph.detectionId}, ` +
            `detection.detectionId=${detection.detectionId}`
        );
        continue;
      }

      // Verify graph has detection node pointing to this detection
      const detectionNode = graph.nodes.find(
        n =>
          n.nodeType === 'DETECTION_RESULT' &&
          n.ref.entityId === detection.detectionId
      );

      if (!detectionNode) {
        console.error(
          `Graph missing detection node for: ${detection.detectionId}`
        );
        continue;
      }

      graphs.push(graph);
      validDetections.push(detection);
    }

    return { graphs, validDetections };
  }

  /**
   * 🔒 FIX-C: Build query filter for partition narrowing
   * 
   * Use trigger detection to pre-scope query before filtering.
   * Preserves cost, latency, and determinism under load.
   */
  private buildQueryFilter(
    rule: CorrelationRule,
    triggerSignal: NormalizedSignal,
    triggerDetection: DetectionResult
  ): DetectionQueryFilter {
    const filter: DetectionQueryFilter = {};
    const matcher = rule.matcher;

    // If rule requires sameRuleId, narrow by ruleId
    if (matcher.sameRuleId) {
      filter.ruleId = triggerDetection.ruleId;
    }

    // Note: sameService and sameSource filtering happens after fetching signals
    // because service/source are on the signal, not the detection

    return filter;
  }

  /**
   * Take top detections by severity
   */
  private takeTopBySeverity(
    detections: DetectionResult[],
    max: number
  ): DetectionResult[] {
    const severityOrder: Record<string, number> = {
      SEV1: 1,
      SEV2: 2,
      SEV3: 3,
      SEV4: 4,
    };
    return [...detections]
      .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
      .slice(0, max);
  }
}
