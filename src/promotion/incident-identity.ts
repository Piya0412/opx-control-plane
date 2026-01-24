/**
 * Phase 3.3: Incident Identity Computation
 * 
 * Deterministic incident identity based on evidence.
 * 
 * CRITICAL: Evidence-derived identity (not time-based)
 * 
 * PROPERTIES:
 * - Deterministic (same evidence → same incident ID)
 * - Collision-resistant (SHA256)
 * - Replay-safe (no time dependency)
 * - Preserves P3-I5: One Authority, One Incident
 */

import { createHash } from 'crypto';

/**
 * Compute deterministic incident ID
 * 
 * Algorithm:
 * incidentId = SHA256(service + evidenceId)
 * 
 * CRITICAL: Evidence-derived only (no time parameter)
 * 
 * Rationale:
 * - Evidence is immutable
 * - Window rounding is not
 * - Evidence already encodes time safely
 * - Preserves P3-I5: One Authority, One Incident
 * 
 * @param service - Service name
 * @param evidenceId - Evidence bundle ID (SHA256)
 * @returns Incident ID (64-character hex string)
 * 
 * @example
 * ```typescript
 * const incidentId = computeIncidentId(
 *   'payment-service',
 *   'a1b2c3d4...' // evidenceId
 * );
 * // Returns: "e5f6g7h8..." (64 chars)
 * ```
 */
export function computeIncidentId(
  service: string,
  evidenceId: string
): string {
  // Validate inputs
  if (!service || service.trim().length === 0) {
    throw new Error('service cannot be empty');
  }
  
  if (!evidenceId || evidenceId.length !== 64) {
    throw new Error('evidenceId must be 64-character SHA256 hex');
  }
  
  // Build deterministic string (evidence-derived only)
  const input = `${service}|${evidenceId}`;
  
  // Compute SHA256 hash
  const hash = createHash('sha256');
  hash.update(input);
  
  return hash.digest('hex');
}
