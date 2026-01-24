/**
 * Phase 2.2 Week 4: Correlation Executor
 * 
 * MINIMAL WIRING ONLY
 * 
 * Connects CorrelationEngine → CandidateOrchestrator
 * 
 * ONE CALL SITE:
 * if (result.thresholdMet) {
 *   await orchestrator.generateCandidate(...)
 * }
 * 
 * NO:
 * - Retries
 * - Logging
 * - Metrics
 * - State
 * - Branching logic
 */

import { CorrelationEngine } from './correlation-engine.js';
import { CandidateOrchestrator, type CorrelationContext } from '../candidate/candidate-orchestrator.js';
import { computeWindowBoundaries } from './correlation-rule.schema.js';
import type { SignalEvent } from '../signal/signal-event.schema.js';
import type { CorrelationRule } from './correlation-rule.schema.js';
import type { EvaluationResult } from './correlation-engine.js';
import type { DetectionResult } from '../detection/detection-result.js';
import type { EvidenceGraph } from '../evidence/evidence-graph.schema.js';
import type { NormalizedSignal } from '../normalization/normalized-signal.schema.js';

/**
 * Data provider interface
 * 
 * Abstraction for fetching detections, graphs, and normalized signals.
 * Implementation will query from stores.
 */
export interface CorrelationDataProvider {
  /**
   * Fetch detections for signals
   */
  getDetections(signalIds: string[]): Promise<DetectionResult[]>;

  /**
   * Fetch evidence graphs for detections
   */
  getGraphs(detectionIds: string[]): Promise<EvidenceGraph[]>;

  /**
   * Fetch normalized signals
   */
  getNormalizedSignals(signalIds: string[]): Promise<NormalizedSignal[]>;
}

/**
 * Execution result
 */
export interface ExecutionResult {
  evaluation: EvaluationResult;
  candidatesGenerated: number;
  candidateIds: string[];
}

/**
 * Correlation Executor
 * 
 * Minimal wrapper that wires correlation → candidate generation.
 * 
 * DESIGN LOCK: Stateless, deterministic, rule-driven
 */
export class CorrelationExecutor {
  constructor(
    private readonly engine: CorrelationEngine,
    private readonly orchestrator: CandidateOrchestrator,
    private readonly dataProvider: CorrelationDataProvider
  ) {}

  /**
   * Execute correlation and generate candidates
   * 
   * MINIMAL WIRING:
   * 1. Evaluate signal against rules
   * 2. For each threshold-met result → generate candidate
   * 
   * @param signal - Signal to evaluate
   * @param rules - Enabled correlation rules
   * @returns Execution result
   */
  async execute(
    signal: SignalEvent,
    rules: CorrelationRule[]
  ): Promise<ExecutionResult> {
    // Step 1: Evaluate signal (correlation engine)
    const evaluation = await this.engine.evaluateSignal(signal, rules);

    // Step 2: Generate candidates for threshold-met results
    const candidateIds: string[] = [];

    for (const result of evaluation.results) {
      // MINIMAL WIRING: One call site only
      if (result.thresholdMet && result.groupedSignals) {
        const rule = rules.find(r => r.ruleId === result.ruleId)!;

        for (const group of result.groupedSignals) {
          // Compute window boundaries from signal and rule
          const { start, end } = computeWindowBoundaries(signal.observedAt, rule.timeWindow);

          // Fetch required data
          const signalIds = group.signals.map(s => s.signalId);
          const detections = await this.dataProvider.getDetections(signalIds);
          const detectionIds = detections.map(d => d.detectionId);
          const graphs = await this.dataProvider.getGraphs(detectionIds);
          const normalizedSignals = await this.dataProvider.getNormalizedSignals(signalIds);

          // Build correlation context
          const context: CorrelationContext = {
            rule,
            signals: group.signals,
            windowStart: start,
            windowEnd: end,
            groupKey: group.groupKey,
          };

          // Generate candidate
          const candidateResult = await this.orchestrator.generateCandidate(
            context,
            detections,
            graphs,
            normalizedSignals
          );

          if (candidateResult.success && candidateResult.candidateId) {
            candidateIds.push(candidateResult.candidateId);
          } else {
            // TEMP LOG for Step 8 debugging
            console.error('Candidate generation failed', {
              ruleId: rule.ruleId,
              signalCount: group.signals.length,
              error: candidateResult.error,
            });
          }
        }
      }
    }

    return {
      evaluation,
      candidatesGenerated: candidateIds.length,
      candidateIds,
    };
  }
}
