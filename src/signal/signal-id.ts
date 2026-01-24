/**
 * Signal Identity Functions
 * 
 * Phase 2.1: Signal Ingestion
 * 
 * CORRECTION 2: SignalId uses identityWindow (rounded time bucket)
 * 
 * INV-P2.4: Must be deterministic and replayable
 */

import * as crypto from 'crypto';
import type { SignalSource, SignalType, SignalSeverity } from './signal-event.schema';

/**
 * Round timestamp to identity window (1-minute buckets)
 * 
 * CORRECTION 2: This ensures same alarm within same minute → same signalId
 * 
 * Example:
 *   2026-01-17T10:23:45.123Z → 2026-01-17T10:23Z
 *   2026-01-17T10:23:47.456Z → 2026-01-17T10:23Z
 *   (Both produce same identity window → same signalId)
 * 
 * @param observedAt - ISO 8601 timestamp
 * @returns Identity window in format YYYY-MM-DDTHH:MMZ
 */
export function computeIdentityWindow(observedAt: string): string {
  const date = new Date(observedAt);
  date.setSeconds(0, 0); // Zero out seconds and milliseconds
  return date.toISOString().slice(0, 16) + 'Z'; // Format: YYYY-MM-DDTHH:MMZ
}

/**
 * Compute deterministic signalId based on semantic identity
 * 
 * INV-P2.4: Must be deterministic and replayable
 * CORRECTION 2: Uses identityWindow (rounded time bucket) instead of raw timestamp
 * 
 * This ensures:
 * - Same alarm/event → same signalId
 * - Reliable deduplication
 * - Correlation stability
 * - Replay fidelity
 * 
 * @param source - Signal source
 * @param signalType - Signal type
 * @param service - Service name
 * @param severity - Severity level
 * @param identityWindow - Rounded time bucket (NOT raw timestamp)
 * @param metadata - Source-specific metadata
 * @returns SHA-256 hash (64 hex characters)
 */
export function computeSignalId(
  source: SignalSource,
  signalType: SignalType,
  service: string,
  severity: SignalSeverity,
  identityWindow: string,
  metadata: Record<string, unknown>
): string {
  const input = {
    source,
    signalType,
    service,
    severity,
    identityWindow, // Rounded time bucket, NOT raw timestamp
    // Normalize metadata for determinism (sort keys)
    metadata: JSON.stringify(metadata, Object.keys(metadata || {}).sort()),
  };
  
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex');
  
  return hash;
}
