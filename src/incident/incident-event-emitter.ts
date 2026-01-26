/**
 * Incident Event Emitter
 * 
 * Emits incident lifecycle events to EventBridge.
 * 
 * CRITICAL RULES:
 * - Event emission is best-effort (non-blocking)
 * - Failures do NOT fail the operation
 * - Events are for downstream consumers only
 * - DynamoDB is source of truth, not EventBridge
 */

import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { Incident, Authority } from './incident.schema.js';
import type { IncidentCreatedEvent, StateTransitionedEvent } from './incident-event.schema.js';

export class IncidentEventEmitter {
  constructor(
    private readonly eventBridgeClient: EventBridgeClient,
    private readonly eventBusName: string
  ) {}

  /**
   * Emit IncidentCreated event
   * 
   * Triggered when an incident is created from promotion.
   * Downstream consumers: Phase 6 intelligence layer
   * 
   * @param incident - Created incident
   * @returns Promise<void> (best-effort, non-blocking)
   */
  async emitIncidentCreated(incident: Incident): Promise<void> {
    try {
      const event: IncidentCreatedEvent = {
        eventType: 'IncidentCreated',
        incidentId: incident.incidentId,
        service: incident.service,
        severity: incident.severity,
        state: 'OPEN', // Always OPEN when created
        evidenceId: incident.evidenceId,
        candidateId: incident.candidateId,
        confidenceScore: incident.confidenceScore,
        openedAt: incident.openedAt || incident.createdAt,
        createdBy: incident.createdBy,
      };

      await this.eventBridgeClient.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: 'opx.incident',
              DetailType: 'IncidentCreated',
              Detail: JSON.stringify(event),
              EventBusName: this.eventBusName,
            },
          ],
        })
      );

      console.log('IncidentCreated event emitted', {
        incidentId: incident.incidentId,
        service: incident.service,
        severity: incident.severity,
      });
    } catch (error) {
      // Best-effort: log warning but DO NOT throw
      console.warn('Failed to emit IncidentCreated event (non-blocking)', {
        incidentId: incident.incidentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Emit StateTransitioned event
   * 
   * Triggered when an incident transitions to a new state.
   * Downstream consumers: Monitoring, analytics, Phase 6 (for state changes)
   * 
   * @param incident - Incident after transition
   * @param fromState - Previous state
   * @param authority - Authority that performed transition
   * @returns Promise<void> (best-effort, non-blocking)
   */
  async emitStateTransitioned(
    incident: Incident,
    fromState: string,
    authority: Authority
  ): Promise<void> {
    try {
      const event: StateTransitionedEvent = {
        eventType: 'StateTransitioned',
        incidentId: incident.incidentId,
        fromState: fromState as any,
        toState: incident.status,
        transitionedAt: incident.lastModifiedAt,
        transitionedBy: authority,
      };

      await this.eventBridgeClient.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: 'opx.incident',
              DetailType: 'StateTransitioned',
              Detail: JSON.stringify(event),
              EventBusName: this.eventBusName,
            },
          ],
        })
      );

      console.log('StateTransitioned event emitted', {
        incidentId: incident.incidentId,
        fromState,
        toState: incident.status,
      });
    } catch (error) {
      // Best-effort: log warning but DO NOT throw
      console.warn('Failed to emit StateTransitioned event (non-blocking)', {
        incidentId: incident.incidentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
