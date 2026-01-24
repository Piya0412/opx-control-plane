import {
  DynamoDBClient,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { ZodError } from 'zod';
import {
  EventStoreRecord,
  EventStoreRecordSchema,
  ReplayResult,
  ReplayIntegrityError,
} from '../domain/event-store.js';
import {
  Incident,
  IncidentSchema,
  TimelineEntry,
  IncidentState,
} from '../domain/incident.js';
import { computeStateHash } from '../utils/hash.js';
import { IncidentService } from '../controller/incident-service.js';

const dynamodb = new DynamoDBClient({});
const EVENTS_TABLE_NAME = process.env.INCIDENT_EVENTS_TABLE_NAME!;

/**
 * Replay Service
 * 
 * CRITICAL INVARIANTS:
 * - "Events are facts. Facts are immutable."
 * - "Event store is the only authoritative history."
 * - "Replay failure indicates system integrity violation."
 * 
 * Replay Properties:
 * - Reads ONLY from opx-incident-events (not EventBridge, not logs)
 * - Deterministic reducer (pure function)
 * - Hash verification at every step
 * - Fails closed on any mismatch
 * - Works offline from live system
 * 
 * Gap Detection:
 * - eventSeq must start at 1
 * - Every eventSeq must equal previous + 1
 * - No gaps, no duplicates
 */
export class ReplayService {
  private incidentService: IncidentService;

  constructor() {
    this.incidentService = new IncidentService();
  }

  /**
   * Replay incident from authoritative event store
   * 
   * Reconstructs incident state from events and verifies integrity.
   * 
   * FAIL-CLOSED: Any integrity violation throws ReplayIntegrityError.
   */
  async replayIncident(incidentId: string): Promise<ReplayResult> {
    // Query events from authoritative event store
    const events = await this.queryEvents(incidentId);

    if (events.length === 0) {
      throw new ReplayIntegrityError('No events found for incident', { incidentId });
    }

    // ENFORCE: eventSeq must start at 1
    if (events[0].eventSeq !== 1) {
      throw new ReplayIntegrityError(
        `First event must have eventSeq=1, got ${events[0].eventSeq}`,
        { incidentId, firstEventSeq: events[0].eventSeq }
      );
    }

    let state: Incident | null = null;
    let expectedSeq = 1;

    // Apply events sequentially with gap detection
    for (const event of events) {
      // ENFORCE: Every eventSeq must equal previous + 1
      if (event.eventSeq !== expectedSeq) {
        throw new ReplayIntegrityError(
          `eventSeq gap detected: expected ${expectedSeq}, got ${event.eventSeq}`,
          {
            incidentId,
            expectedSeq,
            actualSeq: event.eventSeq,
          }
        );
      }

      // Apply event (deterministic reducer)
      state = this.applyEvent(state, event);

      // Recompute state hash
      const computedHash = computeStateHash(state);

      // ENFORCE: Hash must match
      if (computedHash !== event.stateHashAfter) {
        throw new ReplayIntegrityError(
          `Hash mismatch at eventSeq ${event.eventSeq}`,
          {
            incidentId,
            eventSeq: event.eventSeq,
            expected: event.stateHashAfter,
            actual: computedHash,
          }
        );
      }

      expectedSeq++;
    }

    if (!state) {
      throw new ReplayIntegrityError('Replay produced null state', { incidentId });
    }

    // Compare final state with current state
    const currentIncident = await this.incidentService.getIncident(incidentId);
    const currentHash = computeStateHash(currentIncident);
    const replayedHash = computeStateHash(state);

    if (currentHash !== replayedHash) {
      throw new ReplayIntegrityError(
        'Final state hash mismatch between current and replayed state',
        {
          incidentId,
          currentHash,
          replayedHash,
        }
      );
    }

    return {
      success: true,
      incidentId,
      events,
      finalState: state,
      finalHash: replayedHash,
      eventCount: events.length,
    };
  }

  /**
   * Query events from authoritative event store
   * 
   * Reads ONLY from opx-incident-events table.
   * Ordered by eventSeq (strictly monotonic).
   */
  private async queryEvents(incidentId: string): Promise<EventStoreRecord[]> {
    const result = await dynamodb.send(new QueryCommand({
      TableName: EVENTS_TABLE_NAME,
      KeyConditionExpression: 'incidentId = :incidentId',
      ExpressionAttributeValues: {
        ':incidentId': { S: incidentId },
      },
      ScanIndexForward: true, // ORDER BY eventSeq ASC
    }));

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map(item => {
      const data = unmarshall(item);
      try {
        return EventStoreRecordSchema.parse(data);
      } catch (error) {
        // If Zod validation fails on event store data, this indicates corruption
        // Convert to ReplayIntegrityError (409) instead of validation error (400)
        if (error instanceof ZodError) {
          throw new ReplayIntegrityError(
            `Event store data corruption detected`,
            { 
              incidentId: data.incidentId, 
              eventSeq: data.eventSeq,
              validationErrors: error.issues.map(i => ({
                path: i.path.join('.'),
                message: i.message,
              })),
            }
          );
        }
        throw error;
      }
    });
  }

  /**
   * Apply event to state (deterministic reducer)
   * 
   * Pure function: same event + same state → same result.
   * No side effects. No external calls.
   */
  private applyEvent(state: Incident | null, event: EventStoreRecord): Incident {
    switch (event.eventType) {
      case 'INCIDENT_CREATED':
        return this.applyIncidentCreated(event);

      case 'STATE_CHANGED':
        if (!state) {
          throw new ReplayIntegrityError(
            'STATE_CHANGED event without prior INCIDENT_CREATED',
            { eventSeq: event.eventSeq }
          );
        }
        return this.applyStateChanged(state, event);

      case 'SIGNAL_ADDED':
        if (!state) {
          throw new ReplayIntegrityError(
            'SIGNAL_ADDED event without prior INCIDENT_CREATED',
            { eventSeq: event.eventSeq }
          );
        }
        return this.applySignalAdded(state, event);

      case 'APPROVED':
      case 'REJECTED':
        if (!state) {
          throw new ReplayIntegrityError(
            `${event.eventType} event without prior INCIDENT_CREATED`,
            { eventSeq: event.eventSeq }
          );
        }
        return this.applyApprovalEvent(state, event);

      default:
        // For other event types, return state unchanged
        return state!;
    }
  }

  /**
   * Apply INCIDENT_CREATED event
   */
  private applyIncidentCreated(event: EventStoreRecord): Incident {
    // Use entryId from metadata if available, otherwise generate (for backwards compatibility)
    const entryId = (event.metadata?.entryId as string) ?? crypto.randomUUID();
    
    const timelineEntry: TimelineEntry = {
      entryId,
      timestamp: event.timestamp,
      type: 'CREATED',
      actor: event.actor,
      newState: event.toState as IncidentState | undefined,
    };

    const incident: Incident = {
      incidentId: event.incidentId,
      service: (event.metadata?.service as string) ?? 'unknown',
      severity: (event.metadata?.severity as 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4') ?? 'SEV3',
      state: (event.toState as IncidentState) ?? 'CREATED',
      title: (event.metadata?.title as string) ?? 'Untitled',
      description: event.metadata?.description as string | undefined,
      signals: [],
      timeline: [timelineEntry],
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
      createdBy: event.actor,
      version: 1,
      eventSeq: event.eventSeq,
    };

    return IncidentSchema.parse(incident);
  }

  /**
   * Apply STATE_CHANGED event
   */
  private applyStateChanged(state: Incident, event: EventStoreRecord): Incident {
    // Use entryId from metadata if available, otherwise generate (for backwards compatibility)
    const entryId = (event.metadata?.entryId as string) ?? crypto.randomUUID();
    
    const timelineEntry: TimelineEntry = {
      entryId,
      timestamp: event.timestamp,
      type: 'STATE_CHANGED',
      actor: event.actor,
      previousState: event.fromState as IncidentState | undefined,
      newState: event.toState as IncidentState | undefined,
      data: { reason: event.decision },
    };

    return {
      ...state,
      state: (event.toState as IncidentState) ?? state.state,
      timeline: [...state.timeline, timelineEntry],
      updatedAt: event.timestamp,
      version: state.version + 1,
      eventSeq: event.eventSeq,
    };
  }

  /**
   * Apply SIGNAL_ADDED event
   */
  private applySignalAdded(state: Incident, event: EventStoreRecord): Incident {
    // Signal data would be in event.metadata
    // For now, return state unchanged
    return {
      ...state,
      updatedAt: event.timestamp,
      version: state.version + 1,
      eventSeq: event.eventSeq,
    };
  }

  /**
   * Apply APPROVED or REJECTED event
   */
  private applyApprovalEvent(state: Incident, event: EventStoreRecord): Incident {
    // Use entryId from metadata if available, otherwise generate (for backwards compatibility)
    const entryId = (event.metadata?.entryId as string) ?? crypto.randomUUID();
    
    const timelineEntry: TimelineEntry = {
      entryId,
      timestamp: event.timestamp,
      type: event.eventType === 'APPROVED' ? 'APPROVED' : 'REJECTED',
      actor: event.actor,
      previousState: event.fromState as IncidentState | undefined,
      newState: event.toState as IncidentState | undefined,
      data: { reason: event.decision },
    };

    return {
      ...state,
      state: (event.toState as IncidentState) ?? state.state,
      timeline: [...state.timeline, timelineEntry],
      updatedAt: event.timestamp,
      version: state.version + 1,
      eventSeq: event.eventSeq,
    };
  }
}
