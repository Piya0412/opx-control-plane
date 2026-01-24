import { z } from 'zod';

/**
 * PERMANENT IDEMPOTENCY
 * 
 * CRITICAL INVARIANTS:
 * - "Idempotency records are audit artifacts, not caches."
 * - No TTL - records are permanent
 * - No cleanup jobs
 * - No overwrite paths
 * - No bypass path - idempotency ALWAYS applied
 * 
 * Design Invariant:
 * "If client does not provide Idempotency-Key, the system deterministically generates one."
 */

/**
 * Request Fingerprint
 * 
 * Stores field names and hash instead of full request body.
 * Avoids PII storage and schema evolution issues.
 */
export const RequestFingerprintSchema = z.object({
  fields: z.array(z.string()), // Field names present in request
  hash: z.string().regex(/^[a-f0-9]{64}$/), // SHA-256 of canonical request
});
export type RequestFingerprint = z.infer<typeof RequestFingerprintSchema>;

/**
 * Idempotency Record
 * 
 * Permanent audit artifact stored in opx-idempotency table.
 * NO TTL. NO DELETION. NO OVERWRITE.
 * 
 * Status field tracks operation lifecycle:
 * - IN_PROGRESS: Operation is being executed
 * - COMPLETED: Operation finished, response is stored
 */
export const IdempotencyRecordSchema = z.object({
  idempotencyKey: z.string(), // PK (client-provided or generated)
  requestHash: z.string().regex(/^[a-f0-9]{64}$/), // SHA-256 of canonical request
  status: z.enum(['IN_PROGRESS', 'COMPLETED']),
  principal: z.string(), // Principal ARN who made the request
  createdAt: z.string().datetime(), // When request was made
  completedAt: z.string().datetime().optional(), // When operation completed
  requestFingerprint: RequestFingerprintSchema.optional(), // Field list + hash (NOT full body)
  // Response stored only when COMPLETED
  incidentId: z.string().uuid().optional(), // Result of operation
  response: z.record(z.unknown()).optional(), // Full response payload for replay
});
export type IdempotencyRecord = z.infer<typeof IdempotencyRecordSchema>;
