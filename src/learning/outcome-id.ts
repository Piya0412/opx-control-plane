/**
 * Phase 4 - Step 3: Outcome ID Generation
 * 
 * Deterministic outcome ID generation.
 */

import { createHash } from 'crypto';

/**
 * Compute deterministic outcome ID
 * 
 * outcomeId = SHA256(incidentId + ":" + closedAt)
 * 
 * LOCKED RULE: Same inputs → same output (deterministic)
 * 
 * @param incidentId - Incident ID (64 chars)
 * @param closedAt - Incident closed timestamp (ISO-8601)
 * @returns Outcome ID (64 char hex string)
 */
export function computeOutcomeId(
  incidentId: string,
  closedAt: string
): string {
  if (!incidentId || incidentId.length !== 64) {
    throw new Error('incidentId must be 64 characters');
  }
  
  if (!closedAt) {
    throw new Error('closedAt is required');
  }
  
  const input = `${incidentId}:${closedAt}`;
  const hash = createHash('sha256');
  hash.update(input);
  return hash.digest('hex');
}
