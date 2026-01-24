import { z } from 'zod';
import type { IncidentState } from './incident.js';

/**
 * Audit Event Types
 * 
 * Every action in the system produces an audit event.
 * These events are immutable and enable full replay.
 */
export const AuditEventTypeSchema = z.enum([
  'INCIDENT_CREATED',
  'INCIDENT_STATE_CHANGED',
  'INCIDENT_SIGNAL_ADDED',
  'INCIDENT_APPROVAL_REQUESTED',
  'INCIDENT_APPROVED',
  'INCIDENT_REJECTED',
  'INCIDENT_CLOSED',
  'TRANSITION_REJECTED', // Invalid transition attempted
]);
export type AuditEventType = z.infer<typeof AuditEventTypeSchema>;

/**
 * Audit Event Schema
 * 
 * Immutable record of every action in the system.
 * Used for compliance, debugging, and replay.
 */
export const AuditEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: AuditEventTypeSchema,
  timestamp: z.string().datetime(),
  source: z.literal('opx.control-plane'),
  
  // Principal who triggered the event
  actor: z.object({
    principalId: z.string(),
    principalType: z.enum(['USER', 'SYSTEM', 'SERVICE']),
  }),
  
  // Resource affected
  resource: z.object({
    resourceType: z.literal('INCIDENT'),
    resourceId: z.string().uuid(),
  }),
  
  // Event-specific data
  detail: z.object({
    previousState: z.string().optional(),
    newState: z.string().optional(),
    reason: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
  
  // Version for schema evolution
  version: z.literal('1.0'),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

/**
 * Create an audit event
 */
export function createAuditEvent(params: {
  eventType: AuditEventType;
  actor: { principalId: string; principalType: 'USER' | 'SYSTEM' | 'SERVICE' };
  incidentId: string;
  previousState?: IncidentState;
  newState?: IncidentState;
  reason?: string;
  metadata?: Record<string, unknown>;
}): AuditEvent {
  return {
    eventId: crypto.randomUUID(),
    eventType: params.eventType,
    timestamp: new Date().toISOString(),
    source: 'opx.control-plane',
    actor: params.actor,
    resource: {
      resourceType: 'INCIDENT',
      resourceId: params.incidentId,
    },
    detail: {
      previousState: params.previousState,
      newState: params.newState,
      reason: params.reason,
      metadata: params.metadata,
    },
    version: '1.0',
  };
}
