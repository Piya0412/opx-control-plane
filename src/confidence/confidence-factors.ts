/**
 * Phase 3.2: Confidence Factor Computations
 * 
 * Pure functions for computing confidence factors.
 * 
 * RULES:
 * - All functions are pure (no I/O, no side effects)
 * - All functions are deterministic
 * - All return values in [0, 1]
 * - No date/time usage (use timestamps from inputs)
 * - No shared mutable state
 */

import type { DetectionSummary } from '../evidence/evidence-bundle.schema.js';

/**
 * Compute detection count score
 * 
 * More detections = higher confidence.
 * 
 * @param count - Number of detections
 * @returns Score in [0, 1]
 * 
 * @example
 * computeDetectionCountScore(1) // 0.3 (low)
 * computeDetectionCountScore(2) // 0.5 (moderate)
 * computeDetectionCountScore(3) // 0.7 (high)
 * computeDetectionCountScore(4) // 0.9 (very high)
 */
export function computeDetectionCountScore(count: number): number {
  if (count <= 0) {
    throw new Error('Detection count must be positive');
  }
  
  if (count === 1) return 0.3;
  if (count === 2) return 0.5;
  if (count === 3) return 0.7;
  return 0.9; // 4+
}

/**
 * Compute severity score
 * 
 * Weighted average of detection severities.
 * Uses NormalizedSeverity (CRITICAL/HIGH/MEDIUM/LOW/INFO).
 * 
 * @param detections - Array of detection summaries
 * @returns Score in [0, 1]
 * 
 * @example
 * computeSeverityScore([{ severity: 'CRITICAL', ... }]) // 1.0
 * computeSeverityScore([{ severity: 'HIGH', ... }]) // 0.7
 * computeSeverityScore([{ severity: 'MEDIUM', ... }]) // 0.4
 */
export function computeSeverityScore(detections: DetectionSummary[]): number {
  if (detections.length === 0) {
    throw new Error('Detections array cannot be empty');
  }
  
  // Severity weights (using NormalizedSeverity)
  const weights: Record<string, number> = {
    CRITICAL: 1.0,
    HIGH: 0.7,
    MEDIUM: 0.4,
    LOW: 0.2,
    INFO: 0.1,
  };
  
  // Weighted average
  const totalWeight = detections.reduce((sum, detection) => {
    const weight = weights[detection.severity];
    if (weight === undefined) {
      throw new Error(`Unknown severity: ${detection.severity}`);
    }
    return sum + weight;
  }, 0);
  
  return totalWeight / detections.length;
}

/**
 * Compute rule diversity score
 * 
 * Conservative stepwise scoring based on unique rules.
 * Prevents overconfidence from repetition.
 * 
 * @param detections - Array of detection summaries
 * @returns Score in [0, 1]
 * 
 * @example
 * computeRuleDiversityScore([{ ruleId: 'a', ... }]) // 0.3 (single rule)
 * computeRuleDiversityScore([{ ruleId: 'a', ... }, { ruleId: 'b', ... }]) // 0.6 (two rules)
 * computeRuleDiversityScore([{ ruleId: 'a', ... }, { ruleId: 'b', ... }, { ruleId: 'c', ... }]) // 1.0 (3+ rules)
 */
export function computeRuleDiversityScore(detections: DetectionSummary[]): number {
  if (detections.length === 0) {
    throw new Error('Detections array cannot be empty');
  }
  
  const uniqueRules = new Set(detections.map(d => d.ruleId)).size;
  
  // Conservative stepwise scoring
  if (uniqueRules === 1) return 0.3;  // Single rule = low confidence
  if (uniqueRules === 2) return 0.6;  // Two rules = moderate confidence
  return 1.0;                          // 3+ rules = high confidence
}

/**
 * Compute temporal density score
 * 
 * How clustered detections are within the time window.
 * Clustered = sustained issue, spread = transient.
 * 
 * ⚠️ WARNING: Can be misleading in very short windows.
 * This is supporting evidence only, not primary signal.
 * 
 * @param detections - Array of detection summaries
 * @param windowDurationMs - Window duration in milliseconds
 * @returns Score in [0, 1]
 * 
 * @example
 * // All detections at same time
 * computeTemporalDensityScore([...], 300000) // ~1.0
 * 
 * // Detections spread across window
 * computeTemporalDensityScore([...], 300000) // ~0.0
 */
export function computeTemporalDensityScore(
  detections: DetectionSummary[],
  windowDurationMs: number
): number {
  if (detections.length === 0) {
    throw new Error('Detections array cannot be empty');
  }
  
  if (windowDurationMs <= 0) {
    throw new Error('Window duration must be positive');
  }
  
  // Single detection = maximum density
  if (detections.length === 1) {
    return 1.0;
  }
  
  // Extract timestamps (no Date.now() - use input data only)
  const timestamps = detections.map(d => new Date(d.detectedAt).getTime());
  
  // Calculate time spread
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const timeSpread = maxTime - minTime;
  
  // Density = how much of window is NOT covered
  const density = 1 - (timeSpread / windowDurationMs);
  
  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, density));
}

/**
 * Compute signal volume score
 * 
 * More signals = more observations = higher confidence.
 * 
 * @param signalCount - Total number of signals
 * @returns Score in [0, 1]
 * 
 * @example
 * computeSignalVolumeScore(1) // 0.3
 * computeSignalVolumeScore(3) // 0.5
 * computeSignalVolumeScore(8) // 0.7
 * computeSignalVolumeScore(15) // 0.9
 */
export function computeSignalVolumeScore(signalCount: number): number {
  if (signalCount <= 0) {
    throw new Error('Signal count must be positive');
  }
  
  if (signalCount <= 2) return 0.3;
  if (signalCount <= 5) return 0.5;
  if (signalCount <= 10) return 0.7;
  return 0.9; // 11+
}
