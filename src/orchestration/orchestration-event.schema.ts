/**
 * Phase 2.3: Orchestration Event Schema
 * 
 * Events emitted by the orchestration layer.
 * 
 * INVARIANTS:
 * - Events are observability, not authority
 * - Event emission failure must not block orchestration
 * - Events are immutable once emitted
 */

import { z } from 'zod';

// === INCIDENT CREATED EVENT ===

/**
 * Emitted when an incident is created from a candidate
 */
export const IncidentCreatedEventSchema = z.object({
  eventType: z.literal('IncidentCreated'),
  incidentId: z.string().length(64),
  candidateId: z.string().length(64),
  decisionId: z.string().length(64),
  severity: z.enum(['SEV1', 'SEV2', 'SEV3', 'SEV4']),
  service: z.string().min(1),
  createdAt: z.string().datetime(),
}).strict();

export type IncidentCreatedEvent = z.infer<typeof IncidentCreatedEventSchema>;

// === CANDIDATE DEFERRED EVENT ===

/**
 * Emitted when a candidate is deferred (not promoted)
 */
export const CandidateDeferredEventSchema = z.object({
  eventType: z.literal('CandidateDeferred'),
  candidateId: z.string().length(64),
  decisionId: z.string().length(64),
  reason: z.string().min(1).max(2048),
  deferredAt: z.string().datetime(),
}).strict();

export type CandidateDeferredEvent = z.infer<typeof CandidateDeferredEventSchema>;

// === CANDIDATE SUPPRESSED EVENT ===

/**
 * Emitted when a candidate is suppressed (explicitly rejected)
 */
export const CandidateSuppressedEventSchema = z.object({
  eventType: z.literal('CandidateSuppressed'),
  candidateId: z.string().length(64),
  decisionId: z.string().length(64),
  reason: z.string().min(1).max(2048),
  suppressedAt: z.string().datetime(),
}).strict();

export type CandidateSuppressedEvent = z.infer<typeof CandidateSuppressedEventSchema>;

// === ORCHESTRATION FAILED EVENT ===

/**
 * Emitted when orchestration fails (for observability)
 */
export const OrchestrationFailedEventSchema = z.object({
  eventType: z.literal('OrchestrationFailed'),
  candidateId: z.string().length(64),
  error: z.string().min(1).max(2048),
  failedAt: z.string().datetime(),
}).strict();

export type OrchestrationFailedEvent = z.infer<typeof OrchestrationFailedEventSchema>;

// === UNION TYPE ===

export const OrchestrationEventSchema = z.discriminatedUnion('eventType', [
  IncidentCreatedEventSchema,
  CandidateDeferredEventSchema,
  CandidateSuppressedEventSchema,
  OrchestrationFailedEventSchema,
]);

export type OrchestrationEvent = z.infer<typeof OrchestrationEventSchema>;

// === VALIDATION HELPERS ===

/**
 * Parse and validate orchestration event
 * 
 * @param data - Raw event data
 * @returns Validated event
 * @throws if validation fails
 */
export function parseOrchestrationEvent(data: unknown): OrchestrationEvent {
  return OrchestrationEventSchema.parse(data);
}

/**
 * Validate orchestration event (safe parse)
 * 
 * @param data - Raw event data
 * @returns Validation result
 */
export function validateOrchestrationEvent(data: unknown): {
  success: boolean;
  event?: OrchestrationEvent;
  error?: string;
} {
  const result = OrchestrationEventSchema.safeParse(data);
  
  if (result.success) {
    return { success: true, event: result.data };
  }
  
  return {
    success: false,
    error: result.error.errors.map(e => e.message).join(', '),
  };
}
