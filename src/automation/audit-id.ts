/**
 * Phase 5 - Step 1: Audit ID Generation
 * 
 * Deterministic audit ID generation using SHA256.
 * 
 * RULES:
 * - auditId = SHA256(operationType + ":" + startTime + ":" + version)
 * - Same inputs → same ID (idempotent)
 * - No UUID randomness
 */

import { createHash } from 'crypto';
import type { OperationType } from './automation-audit.schema';

/**
 * Compute deterministic audit ID
 * 
 * auditId = SHA256(operationType + ":" + startTime + ":" + version)
 * 
 * This ensures:
 * - Idempotent audit creation
 * - Replay safety
 * - No UUID randomness
 * - Consistent with Phase 4 deterministic IDs
 * 
 * @param operationType - Type of operation
 * @param startTime - ISO-8601 start time
 * @param version - Version string (e.g., "1.0.0")
 * @returns 64-character hex string (SHA256)
 */
export function computeAuditId(
  operationType: OperationType,
  startTime: string,
  version: string
): string {
  const input = `${operationType}:${startTime}:${version}`;
  return createHash('sha256').update(input).digest('hex');
}
