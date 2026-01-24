/**
 * CP-7: Deterministic Identity Computation
 * 
 * 🔒 INV-7.3: Incident identity is deterministic
 * Same decisionId → same incidentId
 */

import { createHash } from 'crypto';

/**
 * Compute deterministic incident ID
 * 
 * @param decisionId - Promotion decision ID (from CP-6)
 * @returns 64-character SHA256 hash
 */
export function computeIncidentId(decisionId: string): string {
  return createHash('sha256').update(decisionId).digest('hex');
}
