/**
 * Phase 3.1: Signal Summary Computation
 * 
 * Compute aggregated signal statistics from detections.
 * 
 * PROPERTIES:
 * - Pure function (no I/O)
 * - Deterministic
 * - Handles edge cases
 */

import type { DetectionSummary, SignalSummary } from './evidence-bundle.schema.js';

/**
 * Compute signal summary from detections
 * 
 * Aggregates:
 * 1. Total signal count (sum of all signalIds)
 * 2. Severity distribution (count by severity)
 * 3. Time spread (max - min detectedAt in milliseconds)
 * 4. Unique rules (distinct ruleId count)
 * 
 * @param detections - Array of detection summaries
 * @returns Signal summary
 * 
 * @example
 * ```typescript
 * const summary = computeSignalSummary([
 *   { detectionId: '1', ruleId: 'rule-a', severity: 'CRITICAL', signalIds: ['s1', 's2'], detectedAt: '2026-01-21T10:00:00Z' },
 *   { detectionId: '2', ruleId: 'rule-b', severity: 'HIGH', signalIds: ['s3'], detectedAt: '2026-01-21T10:02:00Z' }
 * ]);
 * // Returns: { signalCount: 3, severityDistribution: { CRITICAL: 1, HIGH: 1 }, timeSpread: 120000, uniqueRules: 2 }
 * ```
 */
export function computeSignalSummary(detections: DetectionSummary[]): SignalSummary {
  // Validate input
  if (!detections || detections.length === 0) {
    throw new Error('detections cannot be empty');
  }
  
  // 1. Signal count: sum of all signalIds
  const signalCount = detections.reduce(
    (sum, detection) => sum + detection.signalIds.length,
    0
  );
  
  // 2. Severity distribution: count by severity
  const severityDistribution: Record<string, number> = {};
  for (const detection of detections) {
    const severity = detection.severity;
    severityDistribution[severity] = (severityDistribution[severity] || 0) + 1;
  }
  
  // 3. Time spread: max - min detectedAt in milliseconds
  const timestamps = detections.map(d => new Date(d.detectedAt).getTime());
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const timeSpread = maxTime - minTime;
  
  // 4. Unique rules: distinct ruleId count
  const uniqueRuleIds = new Set(detections.map(d => d.ruleId));
  const uniqueRules = uniqueRuleIds.size;
  
  return {
    signalCount,
    severityDistribution,
    timeSpread,
    uniqueRules,
  };
}
