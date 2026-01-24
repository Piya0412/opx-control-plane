/**
 * Correlation Engine
 * 
 * Phase 2.2: Signal Correlation — Week 2
 * 
 * DESIGN LOCK v1.0.0 — FROZEN
 * 
 * MANDATORY CONSTRAINTS:
 * - One signal → one evaluation pass
 * - Rule-first execution order
 * - No batch correlation
 * - No signal mutation
 * - No caching
 * - No optimizations
 * 
 * DECISION LOCK 4: Scalability Under High Signal Volume
 * - Shard by rule, not by signal
 * - One correlation execution per incoming signal
 * - Rule-first evaluation
 * - Window queries scoped by rule + filter keys
 */

import type { SignalEvent } from '../signal/signal-event.schema.js';
import type { CorrelationRule } from './correlation-rule.schema.js';
import {
  signalMatchesRule,
  computeGroupKey,
  normalizeGroupKey,
  computeWindowBoundaries,
} from './correlation-rule.schema.js';

/**
 * Grouped signals result
 */
export interface GroupedSignals {
  groupKey: Record<string, string>;
  normalizedGroupKey: string;
  signals: SignalEvent[];
}

/**
 * Correlation result for a single rule
 */
export interface CorrelationResult {
  ruleId: string;
  ruleVersion: string;
  matched: boolean;
  thresholdMet: boolean;
  groupedSignals?: GroupedSignals[];
}

/**
 * Correlation evaluation result
 */
export interface EvaluationResult {
  signalId: string;
  evaluatedRules: number;
  matchedRules: number;
  thresholdMetRules: number;
  results: CorrelationResult[];
}

/**
 * Signal query interface
 * 
 * Abstraction for querying signals within time windows.
 * Implementation will use SignalStore in production.
 */
export interface SignalQuery {
  /**
   * Query signals within time window
   * 
   * MANDATORY: Queries must be scoped by:
   * - Time window (start, end)
   * - Service (if rule groups by service)
   * - Severity (if rule groups by severity)
   * 
   * @param params Query parameters
   * @returns Array of signals
   */
  querySignalsInWindow(params: {
    start: string;
    end: string;
    service?: string;
    severity?: string;
  }): Promise<SignalEvent[]>;
}

/**
 * Correlation Engine
 * 
 * DESIGN LOCK v1.0.0 — FROZEN
 * 
 * Orchestrates rule evaluation for a single signal.
 * 
 * Flow:
 * 1. Receive signal
 * 2. Load enabled rules
 * 3. For each rule:
 *    a. Check if signal matches rule filters
 *    b. If match:
 *       - Compute time window
 *       - Query signals in window
 *       - Group signals by groupKey
 *       - Evaluate threshold
 *       - Return result
 * 4. Return evaluation results
 * 
 * MANDATORY CONSTRAINTS:
 * - One signal → one evaluation pass
 * - Rule-first execution order
 * - No batch correlation
 * - No signal mutation
 * - No caching
 * - Deterministic execution
 */
export class CorrelationEngine {
  constructor(
    private readonly signalQuery: SignalQuery
  ) {}

  /**
   * Evaluate signal against all rules
   * 
   * MANDATORY: One signal → one evaluation pass
   * 
   * @param signal - Signal to evaluate
   * @param rules - Enabled correlation rules
   * @returns Evaluation result
   */
  async evaluateSignal(
    signal: SignalEvent,
    rules: CorrelationRule[]
  ): Promise<EvaluationResult> {
    const results: CorrelationResult[] = [];
    let matchedRules = 0;
    let thresholdMetRules = 0;

    // MANDATORY: Rule-first execution order
    for (const rule of rules) {
      try {
        const result = await this.evaluateSignalAgainstRule(signal, rule);
        results.push(result);

        if (result.matched) {
          matchedRules++;
        }

        if (result.thresholdMet) {
          thresholdMetRules++;
        }
      } catch (error) {
        // DECISION LOCK 5: Failure Handling
        // Rule evaluation error → Log error, skip rule, continue
        console.error('Rule evaluation failed', {
          ruleId: rule.ruleId,
          ruleVersion: rule.ruleVersion,
          signalId: signal.signalId,
          error: error instanceof Error ? error.message : String(error),
        });

        // Record failed evaluation
        results.push({
          ruleId: rule.ruleId,
          ruleVersion: rule.ruleVersion,
          matched: false,
          thresholdMet: false,
        });
      }
    }

    return {
      signalId: signal.signalId,
      evaluatedRules: rules.length,
      matchedRules,
      thresholdMetRules,
      results,
    };
  }

  /**
   * Evaluate signal against a single rule
   * 
   * MANDATORY: Deterministic execution
   * 
   * @param signal - Signal to evaluate
   * @param rule - Correlation rule
   * @returns Correlation result
   */
  private async evaluateSignalAgainstRule(
    signal: SignalEvent,
    rule: CorrelationRule
  ): Promise<CorrelationResult> {
    // Step 1: Check if signal matches rule filters
    const matched = signalMatchesRule(signal, rule);

    if (!matched) {
      return {
        ruleId: rule.ruleId,
        ruleVersion: rule.ruleVersion,
        matched: false,
        thresholdMet: false,
      };
    }

    // Step 2: Compute time window boundaries
    const { start, end } = computeWindowBoundaries(
      signal.observedAt,
      rule.timeWindow
    );

    // Step 3: Query signals within time window
    // DECISION LOCK 4: Window queries scoped by rule + filter keys
    const windowSignals = await this.querySignalsForRule(
      signal,
      rule,
      start,
      end
    );

    // Step 4: Group signals by groupKey
    const groupedSignals = this.groupSignals(windowSignals, rule);

    // Step 5: Evaluate threshold for each group
    const thresholdMet = groupedSignals.some(group =>
      this.evaluateThreshold(group.signals, rule)
    );

    return {
      ruleId: rule.ruleId,
      ruleVersion: rule.ruleVersion,
      matched: true,
      thresholdMet,
      groupedSignals,
    };
  }

  /**
   * Query signals for rule within time window
   * 
   * DECISION LOCK 4: Window queries scoped by rule + filter keys
   * 
   * Queries are scoped by:
   * - Time window (start, end)
   * - Service (if rule groups by service)
   * - Severity (if rule groups by severity)
   * 
   * @param signal - Current signal
   * @param rule - Correlation rule
   * @param start - Window start
   * @param end - Window end
   * @returns Signals in window
   */
  private async querySignalsForRule(
    signal: SignalEvent,
    rule: CorrelationRule,
    start: string,
    end: string
  ): Promise<SignalEvent[]> {
    // Build query parameters based on groupBy criteria
    const queryParams: {
      start: string;
      end: string;
      service?: string;
      severity?: string;
    } = {
      start,
      end,
    };

    // DECISION LOCK 4: Partition keys derived from groupBy
    if (rule.groupBy.service) {
      queryParams.service = signal.service;
    }

    if (rule.groupBy.severity) {
      queryParams.severity = signal.severity;
    }

    // Query signals
    const signals = await this.signalQuery.querySignalsInWindow(queryParams);

    // Filter signals by rule filters (additional filtering beyond query)
    // This ensures signals match ALL rule filters, not just groupBy dimensions
    return signals.filter(s => signalMatchesRule(s, rule));
  }

  /**
   * Group signals by groupKey
   * 
   * MANDATORY: Deterministic grouping
   * 
   * @param signals - Signals to group
   * @param rule - Correlation rule
   * @returns Grouped signals
   */
  private groupSignals(
    signals: SignalEvent[],
    rule: CorrelationRule
  ): GroupedSignals[] {
    // Group signals by normalized groupKey
    const groups = new Map<string, SignalEvent[]>();

    for (const signal of signals) {
      const groupKey = computeGroupKey(signal, rule);
      const normalizedKey = normalizeGroupKey(groupKey);

      if (!groups.has(normalizedKey)) {
        groups.set(normalizedKey, []);
      }

      groups.get(normalizedKey)!.push(signal);
    }

    // Convert to array of GroupedSignals
    const result: GroupedSignals[] = [];

    for (const [normalizedKey, groupSignals] of groups.entries()) {
      // Compute groupKey from first signal (all signals in group have same groupKey)
      const groupKey = computeGroupKey(groupSignals[0], rule);

      result.push({
        groupKey,
        normalizedGroupKey: normalizedKey,
        signals: groupSignals,
      });
    }

    // MANDATORY: Deterministic ordering
    // Sort by normalized group key for consistent results
    result.sort((a, b) => a.normalizedGroupKey.localeCompare(b.normalizedGroupKey));

    return result;
  }

  /**
   * Evaluate threshold for grouped signals
   * 
   * MANDATORY: Count-only threshold evaluation
   * 
   * @param signals - Grouped signals
   * @param rule - Correlation rule
   * @returns True if threshold met
   */
  private evaluateThreshold(
    signals: SignalEvent[],
    rule: CorrelationRule
  ): boolean {
    const count = signals.length;

    // Check minimum threshold
    if (count < rule.threshold.minSignals) {
      return false;
    }

    // Check maximum threshold (if specified)
    if (rule.threshold.maxSignals && count > rule.threshold.maxSignals) {
      return false;
    }

    return true;
  }
}

/**
 * Filter signals by time window
 * 
 * MANDATORY: Window boundaries are [start, end) (inclusive-start, exclusive-end)
 * 
 * @param signals - Signals to filter
 * @param start - Window start (inclusive)
 * @param end - Window end (exclusive)
 * @returns Filtered signals
 */
export function filterSignalsByWindow(
  signals: SignalEvent[],
  start: string,
  end: string
): SignalEvent[] {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();

  return signals.filter(signal => {
    const observedTime = new Date(signal.observedAt).getTime();
    // [start, end) — inclusive-start, exclusive-end
    return observedTime >= startTime && observedTime < endTime;
  });
}

