/**
 * Phase 3.4: Incident Event Schemas
 * 
 * Events emitted during incident lifecycle.
 */

import { z } from 'zod';
import { IncidentStateSchema, AuthoritySchema, NormalizedSeveritySchema } from './incident.schema';

/**
 * IncidentCreated Event
 * 
 * Emitted when an incident is created from promotion.
 */
export const IncidentCreatedEventSchema = z.object({
  eventType: z.literal('IncidentCreated'),
  incidentId: z.string().length(64),
  service: z.string(),
  severity: NormalizedSeveritySchema,
  state: z.literal('OPEN'),
  evidenceId: z.string().length(64),
  candidateId: z.string().length(64),
  confidenceScore: z.number().min(0).max(1),
  openedAt: z.string().datetime(),
  createdBy: AuthoritySchema,
});

export type IncidentCreatedEvent = z.infer<typeof IncidentCreatedEventSchema>;

/**
 * StateTransitioned Event
 * 
 * Emitted when an incident transitions to a new state.
 */
export const StateTransitionedEventSchema = z.object({
  eventType: z.literal('StateTransitioned'),
  incidentId: z.string().length(64),
  fromState: IncidentStateSchema,
  toState: IncidentStateSchema,
  transitionedAt: z.string().datetime(),
  transitionedBy: AuthoritySchema,
  metadata: z.record(z.unknown()).optional(),
});

export type StateTransitionedEvent = z.infer<typeof StateTransitionedEventSchema>;
