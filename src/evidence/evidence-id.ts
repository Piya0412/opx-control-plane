/**
 * Phase 3.1: Evidence ID Computation
 * 
 * Deterministic evidence identity based on detections and time window.
 * 
 * PROPERTIES:
 * - Order-independent (sorted)
 * - Deterministic (same inputs → same output)
 * - Collision-resistant (SHA256)
 */

import { createHash } from 'crypto';

/**
 * Compute deterministic evidence ID
 * 
 * Algorithm:
 * 1. Sort detection IDs lexicographically
 * 2. Concatenate: sorted(detectionIds).join(',') + windowStart + windowEnd
 * 3. Return SHA256(concatenated)
 * 
 * @param detectionIds - Array of detection IDs
 * @param windowStart - ISO-8601 timestamp
 * @param windowEnd - ISO-8601 timestamp
 * @returns 64-character hex string (SHA256)
 * 
 * @example
 * ```typescript
 * const id = computeEvidenceId(
 *   ['det-123', 'det-456'],
 *   '2026-01-21T10:00:00.000Z',
 *   '2026-01-21T10:05:00.000Z'
 * );
 * // Returns: "a1b2c3d4..." (64 chars)
 * ```
 */
export function computeEvidenceId(
  detectionIds: string[],
  windowStart: string,
  windowEnd: string
): string {
  // Validate inputs
  if (!detectionIds || detectionIds.length === 0) {
    throw new Error('detectionIds cannot be empty');
  }
  
  if (!windowStart || !windowEnd) {
    throw new Error('windowStart and windowEnd are required');
  }
  
  // Sort detection IDs for order-independence
  const sortedIds = [...detectionIds].sort();
  
  // Build deterministic string
  const input = `${sortedIds.join(',')}|${windowStart}|${windowEnd}`;
  
  // Compute SHA256 hash
  const hash = createHash('sha256');
  hash.update(input);
  
  return hash.digest('hex');
}
