import { z } from 'zod';

/**
 * Incident Severity Levels
 */
export const SeveritySchema = z.enum(['SEV1', 'SEV2', 'SEV3', 'SEV4']);
export type Severity = z.infer<typeof SeveritySchema>;

/**
 * Incident States - FIXED state machine
 * 
 * CREATED → ANALYZING → DECIDED → WAITING_FOR_HUMAN → CLOSED
 * 
 * This is deterministic. No AI involvement. No heuristics.
 */
export const IncidentStateSchema = z.enum([
  'CREATED',
  'ANALYZING',
  'DECIDED',
  'WAITING_FOR_HUMAN',
  'CLOSED',
]);
export type IncidentState = z.infer<typeof IncidentStateSchema>;

/**
 * Valid state transitions - deterministic and fixed
 */
export const VALID_TRANSITIONS: Record<IncidentState, IncidentState[]> = {
  CREATED: ['ANALYZING'],
  ANALYZING: ['DECIDED'],
  DECIDED: ['WAITING_FOR_HUMAN'],
  WAITING_FOR_HUMAN: ['CLOSED', 'ANALYZING'], // Can re-analyze if rejected
  CLOSED: [], // Terminal state
} as const;

/**
 * Signal attached to an incident
 */
export const SignalSchema = z.object({
  signalId: z.string().uuid(),
  type: z.enum(['ALARM', 'METRIC', 'LOG', 'TRACE', 'MANUAL']),
  source: z.string(),
  timestamp: z.string().datetime(),
  data: z.record(z.unknown()),
});
export type Signal = z.infer<typeof SignalSchema>;

/**
 * Timeline entry - append-only audit trail
 */
export const TimelineEntrySchema = z.object({
  entryId: z.string().uuid(),
  timestamp: z.string().datetime(),
  type: z.enum([
    'CREATED',
    'STATE_CHANGED',
    'SIGNAL_ADDED',
    'APPROVAL_REQUESTED',
    'APPROVED',
    'REJECTED',
    'COMMENT_ADDED',
  ]),
  actor: z.string(), // Principal who performed the action
  previousState: IncidentStateSchema.optional(),
  newState: IncidentStateSchema.optional(),
  data: z.record(z.unknown()).optional(),
});
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

/**
 * Core Incident Schema
 * 
 * This is the authoritative incident object.
 * Strict schema - no blobs, no arbitrary data.
 */
export const IncidentSchema = z.object({
  incidentId: z.string().uuid(),
  service: z.string().min(1).max(256),
  severity: SeveritySchema,
  state: IncidentStateSchema,
  title: z.string().min(1).max(512),
  description: z.string().max(4096).optional(),
  signals: z.array(SignalSchema),
  timeline: z.array(TimelineEntrySchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string(),
  version: z.number().int().positive(),
  eventSeq: z.number().int().nonnegative(), // Current event sequence number
});
export type Incident = z.infer<typeof IncidentSchema>;

/**
 * Create Incident Request
 */
export const CreateIncidentRequestSchema = z.object({
  service: z.string().min(1).max(256),
  severity: SeveritySchema,
  title: z.string().min(1).max(512),
  description: z.string().max(4096).optional(),
  signals: z.array(SignalSchema).optional(),
});
export type CreateIncidentRequest = z.infer<typeof CreateIncidentRequestSchema>;

/**
 * Transition Request
 */
export const TransitionRequestSchema = z.object({
  targetState: IncidentStateSchema,
  reason: z.string().min(1).max(1024),
});
export type TransitionRequest = z.infer<typeof TransitionRequestSchema>;

/**
 * Approval Request
 */
export const ApprovalRequestSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().min(1).max(1024),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

/**
 * Validate if a state transition is allowed
 * 
 * This is DETERMINISTIC. Same input always produces same output.
 * No AI. No heuristics. No confidence scores.
 */
export function isValidTransition(
  currentState: IncidentState,
  targetState: IncidentState
): boolean {
  const allowedTransitions = VALID_TRANSITIONS[currentState];
  return allowedTransitions.includes(targetState);
}

/**
 * Get allowed transitions from current state
 */
export function getAllowedTransitions(currentState: IncidentState): IncidentState[] {
  return [...VALID_TRANSITIONS[currentState]];
}
