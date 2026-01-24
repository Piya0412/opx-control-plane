/**
 * CP-2: Normalization Engine
 * 
 * Stateless orchestrator for signal normalization.
 * 
 * EXECUTION FLOW:
 * 1. Validate CP-1 signal (schema only)
 * 2. Apply pure normalization rules
 * 3. Build NormalizedSignal object
 * 4. Return normalized signal
 * 
 * INVARIANTS:
 * - Stateless (no memory between calls)
 * - Deterministic (same input → same output)
 * - Non-blocking (failures swallowed)
 * - Pure (no side effects)
 */

import { Signal, SignalSchema } from '../signals/signal-types.js';
import {
  NormalizedSignal,
  NormalizationResult,
} from './normalized-signal.schema.js';
import {
  computeNormalizedSignalId,
  canonicalizeTimestamp,
  canonicalizeSignalType,
  extractResourceRefs,
  extractEnvironmentRefs,
  extractEvidenceRefs,
} from './normalization.rules.js';
import { NORMALIZATION_VERSION } from './normalization.version.js';

/**
 * Normalization Engine
 * 
 * Stateless service for normalizing CP-1 signals.
 */
export class NormalizationEngine {
  /**
   * Normalize a CP-1 signal
   * 
   * Pure function: same input → same output
   * 
   * @param signal - CP-1 Signal (read-only)
   * @returns Normalization result
   */
  async normalize(signal: Signal): Promise<NormalizationResult> {
    try {
      // 1. Validate CP-1 signal (schema only)
      const validated = SignalSchema.parse(signal);
      
      // 2. Apply pure normalization rules
      const canonicalTimestamp = canonicalizeTimestamp(validated.timestamp);
      const canonicalSignalType = canonicalizeSignalType(validated.signalType);
      
      const normalizedSignalId = computeNormalizedSignalId(
        validated.signalId,
        canonicalSignalType,
        canonicalTimestamp
      );
      
      const resourceRefs = extractResourceRefs(validated);
      const environmentRefs = extractEnvironmentRefs(validated);
      const evidenceRefs = extractEvidenceRefs(validated);
      
      // 3. Build NormalizedSignal object
      const normalizedSignal: NormalizedSignal = {
        normalizedSignalId,
        sourceSignalId: validated.signalId,
        signalType: canonicalSignalType,
        source: validated.source,
        severity: validated.severity,
        confidence: validated.confidence,
        timestamp: canonicalTimestamp,
        resourceRefs,
        environmentRefs,
        evidenceRefs,
        normalizationVersion: NORMALIZATION_VERSION,
        normalizedAt: new Date().toISOString(),
      };
      
      // 4. Return result
      return {
        success: true,
        normalizedSignalId,
        normalizedSignal,
      };
      
    } catch (error) {
      // Swallow error (non-blocking)
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = this.classifyError(error);
      
      console.warn('Normalization failed (swallowed)', {
        signalId: signal.signalId,
        errorCode,
        error: errorMessage,
      });
      
      return {
        success: false,
        error: {
          code: errorCode,
          message: errorMessage,
        },
      };
    }
  }
  
  /**
   * Classify error for metrics
   * Bounded set for low cardinality
   */
  private classifyError(error: unknown): string {
    if (error instanceof Error) {
      if (error.name === 'ZodError') return 'VALIDATION_ERROR';
      if (error.message.includes('timestamp')) return 'TIMESTAMP_ERROR';
      if (error.message.includes('signalType')) return 'SIGNAL_TYPE_ERROR';
    }
    return 'UNKNOWN_ERROR';
  }
}
