/**
 * Phase 3.5: Idempotency Key Strategy
 * 
 * Deterministic key generation for idempotency checks across the pipeline.
 * 
 * Properties:
 * - Deterministic: Same inputs → same key
 * - Collision-resistant: Different inputs → different keys
 * - Namespaced: EVIDENCE:, CONFIDENCE:, PROMOTION:, INCIDENT:
 * - Pure functions: No side effects
 */

import { createHash } from 'crypto';

/**
 * Compute evidence idempotency key
 * 
 * Key format: EVIDENCE:{SHA256(sorted(detectionIds))}
 * 
 * Same detections (regardless of order) → same key
 */
export function computeEvidenceKey(detectionIds: string[]): string {
  // Sort to ensure order-independence
  const sorted = [...detectionIds].sort();
  
  // Concatenate with delimiter
  const input = sorted.join('|');
  
  // Hash for collision resistance
  const hash = createHash('sha256').update(input).digest('hex');
  
  return `EVIDENCE:${hash}`;
}

/**
 * Compute confidence idempotency key
 * 
 * Key format: CONFIDENCE:{evidenceId}
 * 
 * Same evidence → same key
 */
export function computeConfidenceKey(evidenceId: string): string {
  return `CONFIDENCE:${evidenceId}`;
}

/**
 * Compute promotion idempotency key
 * 
 * Key format: PROMOTION:{candidateId}
 * 
 * Same candidate → same key
 */
export function computePromotionKey(candidateId: string): string {
  return `PROMOTION:${candidateId}`;
}

/**
 * Compute incident idempotency key
 * 
 * Key format: INCIDENT:{incidentId}
 * 
 * Same incident → same key
 */
export function computeIncidentKey(incidentId: string): string {
  return `INCIDENT:${incidentId}`;
}

/**
 * Extract ID from idempotency key
 * 
 * Reverses the key format to get the original ID.
 */
export function extractIdFromKey(key: string): string {
  const parts = key.split(':');
  if (parts.length !== 2) {
    throw new Error(`Invalid idempotency key format: ${key}`);
  }
  return parts[1];
}

/**
 * Get key namespace
 * 
 * Returns the namespace prefix (EVIDENCE, CONFIDENCE, etc.)
 */
export function getKeyNamespace(key: string): string {
  const parts = key.split(':');
  if (parts.length !== 2) {
    throw new Error(`Invalid idempotency key format: ${key}`);
  }
  return parts[0];
}
