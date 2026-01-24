/**
 * Phase 2.3: Candidate Event Schema
 * 
 * Schema for CandidateCreated events from Phase 2.2.
 * 
 * INVARIANTS:
 * - Events are immutable once emitted
 * - Schema validation is fail-closed
 * - All fields are required (no optionals)
 */

import { z } from 'zod';

/**
 * CandidateCreated event from Phase 2.2
 * 
 * Emitted by: Candidate Orchestrator (Phase 2.2)
 * Consumed by: Candidate Event Handler (Phase 2.3)
 */
export const CandidateCreatedEventSchema = z.object({
  eventType: z.literal('CandidateCreated'),
  candidateId: z.string().length(64),
  correlationRuleId: z.string().min(1),
  correlationRuleVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  signalCount: z.number().int().positive(),
  severity: z.enum(['SEV1', 'SEV2', 'SEV3', 'SEV4']),
  service: z.string().min(1),
  createdAt: z.string().datetime(),
}).strict();

export type CandidateCreatedEvent = z.infer<typeof CandidateCreatedEventSchema>;

/**
 * Validate CandidateCreated event
 * 
 * @param data - Raw event data
 * @returns Validation result
 */
export function validateCandidateCreatedEvent(data: unknown): {
  success: boolean;
  event?: CandidateCreatedEvent;
  error?: string;
} {
  const result = CandidateCreatedEventSchema.safeParse(data);
  
  if (result.success) {
    return { success: true, event: result.data };
  }
  
  return {
    success: false,
    error: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
  };
}
