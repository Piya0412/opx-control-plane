/**
 * Phase 2.3: Orchestration Event Schema Tests
 */

import { describe, it, expect } from 'vitest';
import {
  IncidentCreatedEventSchema,
  CandidateDeferredEventSchema,
  CandidateSuppressedEventSchema,
  OrchestrationFailedEventSchema,
  parseOrchestrationEvent,
  validateOrchestrationEvent,
  type IncidentCreatedEvent,
  type CandidateDeferredEvent,
  type CandidateSuppressedEvent,
  type OrchestrationFailedEvent,
} from '../../src/orchestration/orchestration-event.schema';

describe('IncidentCreatedEvent', () => {
  it('validates correct event', () => {
    const event: IncidentCreatedEvent = {
      eventType: 'IncidentCreated',
      incidentId: 'a'.repeat(64),
      candidateId: 'b'.repeat(64),
      decisionId: 'c'.repeat(64),
      severity: 'SEV1',
      service: 'lambda',
      createdAt: '2026-01-19T00:00:00Z',
    };

    const result = IncidentCreatedEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('rejects invalid incidentId length', () => {
    const event = {
      eventType: 'IncidentCreated',
      incidentId: 'short',
      candidateId: 'b'.repeat(64),
      decisionId: 'c'.repeat(64),
      severity: 'SEV1',
      service: 'lambda',
      createdAt: '2026-01-19T00:00:00Z',
    };

    const result = IncidentCreatedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects invalid severity', () => {
    const event = {
      eventType: 'IncidentCreated',
      incidentId: 'a'.repeat(64),
      candidateId: 'b'.repeat(64),
      decisionId: 'c'.repeat(64),
      severity: 'SEV5',
      service: 'lambda',
      createdAt: '2026-01-19T00:00:00Z',
    };

    const result = IncidentCreatedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects extra fields', () => {
    const event = {
      eventType: 'IncidentCreated',
      incidentId: 'a'.repeat(64),
      candidateId: 'b'.repeat(64),
      decisionId: 'c'.repeat(64),
      severity: 'SEV1',
      service: 'lambda',
      createdAt: '2026-01-19T00:00:00Z',
      extraField: 'not allowed',
    };

    const result = IncidentCreatedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});

describe('CandidateDeferredEvent', () => {
  it('validates correct event', () => {
    const event: CandidateDeferredEvent = {
      eventType: 'CandidateDeferred',
      candidateId: 'a'.repeat(64),
      decisionId: 'b'.repeat(64),
      reason: 'Active incident already exists for this service',
      deferredAt: '2026-01-19T00:00:00Z',
    };

    const result = CandidateDeferredEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('rejects empty reason', () => {
    const event = {
      eventType: 'CandidateDeferred',
      candidateId: 'a'.repeat(64),
      decisionId: 'b'.repeat(64),
      reason: '',
      deferredAt: '2026-01-19T00:00:00Z',
    };

    const result = CandidateDeferredEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects reason exceeding max length', () => {
    const event = {
      eventType: 'CandidateDeferred',
      candidateId: 'a'.repeat(64),
      decisionId: 'b'.repeat(64),
      reason: 'x'.repeat(2049),
      deferredAt: '2026-01-19T00:00:00Z',
    };

    const result = CandidateDeferredEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});

describe('CandidateSuppressedEvent', () => {
  it('validates correct event', () => {
    const event: CandidateSuppressedEvent = {
      eventType: 'CandidateSuppressed',
      candidateId: 'a'.repeat(64),
      decisionId: 'b'.repeat(64),
      reason: 'Suppressed by policy: maintenance window active',
      suppressedAt: '2026-01-19T00:00:00Z',
    };

    const result = CandidateSuppressedEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('rejects invalid datetime', () => {
    const event = {
      eventType: 'CandidateSuppressed',
      candidateId: 'a'.repeat(64),
      decisionId: 'b'.repeat(64),
      reason: 'Suppressed by policy',
      suppressedAt: 'not-a-datetime',
    };

    const result = CandidateSuppressedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});

describe('OrchestrationFailedEvent', () => {
  it('validates correct event', () => {
    const event: OrchestrationFailedEvent = {
      eventType: 'OrchestrationFailed',
      candidateId: 'a'.repeat(64),
      error: 'Candidate not found in store',
      failedAt: '2026-01-19T00:00:00Z',
    };

    const result = OrchestrationFailedEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('rejects error exceeding max length', () => {
    const event = {
      eventType: 'OrchestrationFailed',
      candidateId: 'a'.repeat(64),
      error: 'x'.repeat(2049),
      failedAt: '2026-01-19T00:00:00Z',
    };

    const result = OrchestrationFailedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});

describe('parseOrchestrationEvent', () => {
  it('parses valid IncidentCreated event', () => {
    const event = {
      eventType: 'IncidentCreated',
      incidentId: 'a'.repeat(64),
      candidateId: 'b'.repeat(64),
      decisionId: 'c'.repeat(64),
      severity: 'SEV2',
      service: 'dynamodb',
      createdAt: '2026-01-19T00:00:00Z',
    };

    const parsed = parseOrchestrationEvent(event);
    expect(parsed.eventType).toBe('IncidentCreated');
    expect(parsed.incidentId).toBe('a'.repeat(64));
  });

  it('throws on invalid event', () => {
    const event = {
      eventType: 'InvalidType',
      candidateId: 'a'.repeat(64),
    };

    expect(() => parseOrchestrationEvent(event)).toThrow();
  });
});

describe('validateOrchestrationEvent', () => {
  it('returns success for valid event', () => {
    const event = {
      eventType: 'CandidateDeferred',
      candidateId: 'a'.repeat(64),
      decisionId: 'b'.repeat(64),
      reason: 'Deferred by policy',
      deferredAt: '2026-01-19T00:00:00Z',
    };

    const result = validateOrchestrationEvent(event);
    expect(result.success).toBe(true);
    expect(result.event).toBeDefined();
    expect(result.event?.eventType).toBe('CandidateDeferred');
  });

  it('returns error for invalid event', () => {
    const event = {
      eventType: 'CandidateDeferred',
      candidateId: 'short',
      decisionId: 'b'.repeat(64),
      reason: 'Deferred by policy',
      deferredAt: '2026-01-19T00:00:00Z',
    };

    const result = validateOrchestrationEvent(event);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.event).toBeUndefined();
  });
});
