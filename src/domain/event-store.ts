import { z } from 'zod';

/**
 * AUTHORITATIVE EVENT STORE
 * 
 * CRITICAL INVARIANTS:
 * - "Events are facts. Facts are immutable."
 * - "Event store is the only authoritative history."
 * - "Replay failure indicates system integrity violation."
 * 
 * EventBridge is fan-out only, NOT source of truth.
 */

/**
 * Event Types in the Authoritative Event Store
 */
export const EventStoreEventTypeSchema = z.enum([
  'INCIDENT_CREATED',
  'STATE_CHANGED',
  'SIGNAL_ADDED',
  'APPROVAL_REQUESTED',
  'APPROVED',
  'REJECTED',
]);
export type EventStoreEventType = z.infer<typeof EventStoreEventTypeSchema>;

/**
 * Authoritative Event Record
 * 
 * Stored in opx-incident-events table.
 * IMMUTABLE - No UpdateItem allowed, only PutItem with attribute_not_exists.
 */
export const EventStoreRecordSchema = z.object({
  // Primary Key
  incidentId: z.string().uuid(),
  eventSeq: z.number().int().positive(), // Strictly monotonic, starts at 1
  
  // Event Data
  eventType: EventStoreEventTypeSchema,
  fromState: z.string().optional(), // Previous state (if applicable)
  toState: z.string().optional(),   // New state (if applicable)
  actor: z.string(),                // Principal ARN
  decision: z.string(),             // Reason/justification
  timestamp: z.string().datetime(), // ISO 8601
  
  // State Hash (MANDATORY)
  stateHashAfter: z.string().regex(/^[a-f0-9]{64}$/), // SHA-256 hex
  
  // Optional metadata
  metadata: z.record(z.unknown()).optional(),
});
export type EventStoreRecord = z.infer<typeof EventStoreRecordSchema>;

/**
 * Replay Result
 */
export interface ReplayResult {
  success: true;
  incidentId: string;
  events: EventStoreRecord[];
  finalState: any;
  finalHash: string;
  eventCount: number;
}

/**
 * Replay Integrity Error
 * 
 * Thrown when replay detects system integrity violation:
 * - Hash mismatch
 * - eventSeq gap
 * - Missing events
 * 
 * Extends OpxError to ensure proper 409 status code handling.
 */
import { OpxError } from './errors.js';

export class ReplayIntegrityError extends OpxError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(
      message,
      'REPLAY_INTEGRITY_VIOLATION',
      409,
      details
    );
    this.name = 'ReplayIntegrityError';
  }
}
