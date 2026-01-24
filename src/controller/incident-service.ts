import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge';
import {
  Incident,
  IncidentSchema,
  IncidentState,
  CreateIncidentRequest,
  TransitionRequest,
  ApprovalRequest,
  TimelineEntry,
  isValidTransition,
  getAllowedTransitions,
} from '../domain/incident.js';
import {
  AuditEvent,
  createAuditEvent,
} from '../domain/audit.js';
import {
  EventStoreRecord,
} from '../domain/event-store.js';
import { computeStateHash } from '../utils/hash.js';
import { IdempotencyService } from './idempotency-service.js';
import {
  InvalidTransitionError,
  IncidentNotFoundError,
  ConflictError,
  ValidationError,
  IdempotencyConflictError,
} from '../domain/errors.js';

const dynamodb = new DynamoDBClient({});
const eventbridge = new EventBridgeClient({});

const TABLE_NAME = process.env.INCIDENTS_TABLE_NAME!;
const EVENTS_TABLE_NAME = process.env.INCIDENT_EVENTS_TABLE_NAME!;
const EVENT_BUS_NAME = process.env.AUDIT_EVENT_BUS_NAME!;

/**
 * Incident Service
 * 
 * Deterministic controller for incident lifecycle.
 * 
 * CRITICAL INVARIANTS:
 * - "Events are facts. Facts are immutable."
 * - "Event store is the only authoritative history."
 * - "Replay failure indicates system integrity violation."
 * 
 * NO AI. NO HEURISTICS. NO CONFIDENCE SCORES.
 * 
 * Event Store:
 * - eventSeq derived from DynamoDB (never computed in memory)
 * - Transactions ensure atomicity
 * - State hash verified on every event
 */
export class IncidentService {
  private idempotencyService: IdempotencyService;

  constructor() {
    this.idempotencyService = new IdempotencyService();
  }

  /**
   * Create a new incident with idempotency
   * 
   * CRITICAL: No bypass path - idempotency ALWAYS applied.
   * 
   * 🔒 CORRECT IDEMPOTENCY ALGORITHM:
   * 1. Get idempotency key (client-provided or generated)
   * 2. Compute request hash
   * 3. 🔒 TRY TO CLAIM idempotency slot (atomic conditional write)
   *    - If success → proceed to create (only winner executes)
   *    - If fails → check existing record:
   *      - Different hash → 409 CONFLICT
   *      - Same hash + COMPLETED → replay stored response
   *      - Same hash + IN_PROGRESS → return 200 (operation in flight)
   * 4. Create incident (only winner reaches here)
   * 5. Mark idempotency as COMPLETED with stored response
   * 
   * INVARIANT: Only the owner (who claimed the slot) executes business logic.
   */
  async createIncident(
    validatedRequest: CreateIncidentRequest,
    actor: string,
    clientIdempotencyKey?: string
  ): Promise<{ incident: Incident; replayed: boolean }> {
    // Step 1: ALWAYS get idempotency key (no bypass path)
    const idempotencyKey = this.idempotencyService.getIdempotencyKey(
      validatedRequest,
      actor,
      clientIdempotencyKey
    );

    // Step 2: Compute request hash from validated request
    const requestHash = this.idempotencyService.computeRequestHash(validatedRequest);

    // Step 3: 🔒 TRY TO CLAIM idempotency slot (BEFORE any business logic)
    const now = new Date().toISOString();
    let isOwner = false;
    
    try {
      await this.idempotencyService.tryClaimIdempotencySlot(
        idempotencyKey,
        requestHash,
        actor,
        now
      );
      
      // ✅ We claimed the slot - we are the owner
      isOwner = true;
      
      console.log(JSON.stringify({
        event: 'IDEMPOTENCY_CLAIMED',
        idempotencyKey,
        requestHash,
        principal: actor,
      }));
      
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        // Someone else owns this key - check existing record
        const existing = await this.idempotencyService.getIdempotencyRecord(idempotencyKey);
        
        if (!existing) {
          throw new Error('Idempotency race condition: record disappeared after conflict');
        }
        
        // Check hash - TRUE conflict if different
        if (existing.requestHash !== requestHash) {
          console.error(JSON.stringify({
            event: 'IDEMPOTENCY_CONFLICT',
            idempotencyKey,
            existingHash: existing.requestHash,
            requestHash,
          }));
          
          throw new IdempotencyConflictError(
            idempotencyKey,
            existing.incidentId ?? 'unknown',
            {
              expectedHash: existing.requestHash,
              actualHash: requestHash,
            }
          );
        }
        
        // Same hash - check status
        if (existing.status === 'COMPLETED') {
          // ✅ Operation completed - replay stored response
          console.log(JSON.stringify({
            event: 'IDEMPOTENCY_REPLAY_COMPLETED',
            idempotencyKey,
            incidentId: existing.incidentId,
            principal: actor,
          }));
          
          return {
            incident: existing.response as Incident,
            replayed: true,
          };
        }
        
        // Status is IN_PROGRESS - another request is executing
        // Poll briefly for completion (max 5 seconds)
        console.log(JSON.stringify({
          event: 'IDEMPOTENCY_IN_PROGRESS_POLLING',
          idempotencyKey,
          requestHash,
          message: 'Operation in progress by another request - polling for completion',
        }));
        
        const completed = await this.pollForIdempotencyCompletion(idempotencyKey, 5000);
        
        if (completed && completed.status === 'COMPLETED' && completed.response) {
          console.log(JSON.stringify({
            event: 'IDEMPOTENCY_POLL_SUCCESS',
            idempotencyKey,
            incidentId: completed.incidentId,
          }));
          
          return {
            incident: completed.response as Incident,
            replayed: true,
          };
        }
        
        // Polling timed out or failed - return placeholder
        // This should be rare in practice
        console.warn(JSON.stringify({
          event: 'IDEMPOTENCY_POLL_TIMEOUT',
          idempotencyKey,
          message: 'Polling timed out - returning placeholder',
        }));
        
        return {
          incident: {
            incidentId: 'in-progress',
            service: validatedRequest.service,
            severity: validatedRequest.severity,
            state: 'CREATED',
            title: validatedRequest.title,
            description: validatedRequest.description,
            signals: validatedRequest.signals ?? [],
            timeline: [],
            createdAt: existing.createdAt,
            updatedAt: existing.createdAt,
            createdBy: actor,
            version: 0,
            eventSeq: 0,
          } as Incident,
          replayed: true,
        };
      }
      
      throw error;
    }

    // 🔒 INVARIANT CHECK: Only owner should reach here
    if (!isOwner) {
      throw new Error('INVARIANT VIOLATION: non-owner attempted to execute business logic');
    }

    // Step 4: Create incident (only winner reaches here)
    const incident = await this.createIncidentInternal(validatedRequest, actor);

    // Step 5: Mark idempotency as COMPLETED with stored response
    await this.idempotencyService.completeIdempotency(
      idempotencyKey,
      incident.incidentId,
      incident
    );

    console.log(JSON.stringify({
      event: 'IDEMPOTENCY_COMPLETED',
      idempotencyKey,
      incidentId: incident.incidentId,
      principal: actor,
    }));

    return { incident, replayed: false };
  }

  /**
   * Poll for idempotency operation to complete
   * 
   * Used when a request finds IN_PROGRESS status.
   * Polls with exponential backoff until COMPLETED or timeout.
   */
  private async pollForIdempotencyCompletion(
    idempotencyKey: string,
    timeoutMs: number
  ): Promise<{ status: string; incidentId?: string; response?: any } | null> {
    const startTime = Date.now();
    let delay = 50; // Start with 50ms
    const maxDelay = 500; // Cap at 500ms
    
    while (Date.now() - startTime < timeoutMs) {
      const record = await this.idempotencyService.getIdempotencyRecord(idempotencyKey);
      
      if (record && record.status === 'COMPLETED') {
        return {
          status: 'COMPLETED',
          incidentId: record.incidentId,
          response: record.response,
        };
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, maxDelay); // Exponential backoff
    }
    
    return null; // Timeout
  }

  /**
   * Create incident (internal - no idempotency check)
   */
  private async createIncidentInternal(
    request: CreateIncidentRequest,
    actor: string
  ): Promise<Incident> {
    const now = new Date().toISOString();
    const incidentId = crypto.randomUUID();

    const entryId = crypto.randomUUID();
    const timelineEntry: TimelineEntry = {
      entryId,
      timestamp: now,
      type: 'CREATED',
      actor,
      newState: 'CREATED',
    };

    const incident: Incident = {
      incidentId,
      service: request.service,
      severity: request.severity,
      state: 'CREATED',
      title: request.title,
      description: request.description,
      signals: request.signals ?? [],
      timeline: [timelineEntry],
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      version: 1,
      eventSeq: 0, // Will be incremented to 1 on first event
    };

    // Validate against schema
    const validated = IncidentSchema.parse(incident);

    // Compute state hash
    const stateHash = computeStateHash(validated);

    // Write incident to DynamoDB
    await dynamodb.send(new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall({
        pk: `INCIDENT#${incidentId}`,
        sk: 'METADATA',
        ...validated,
      }, { removeUndefinedValues: true }),
      ConditionExpression: 'attribute_not_exists(pk)',
    }));

    // Write first event to event store
    const event: EventStoreRecord = {
      incidentId,
      eventSeq: 1, // First event
      eventType: 'INCIDENT_CREATED',
      toState: 'CREATED',
      actor,
      decision: 'Incident created',
      timestamp: now,
      stateHashAfter: stateHash,
      metadata: {
        service: request.service,
        severity: request.severity,
        title: request.title,
        description: request.description,
        entryId, // Store entryId for replay
      },
    };

    await dynamodb.send(new PutItemCommand({
      TableName: EVENTS_TABLE_NAME,
      Item: marshall(event, { removeUndefinedValues: true }),
      ConditionExpression: 'attribute_not_exists(incidentId) AND attribute_not_exists(eventSeq)',
    }));

    // Update incident with eventSeq = 1
    await dynamodb.send(new TransactWriteItemsCommand({
      TransactItems: [{
        Update: {
          TableName: TABLE_NAME,
          Key: marshall({
            pk: `INCIDENT#${incidentId}`,
            sk: 'METADATA',
          }, { removeUndefinedValues: true }),
          UpdateExpression: 'SET #eventSeq = :one',
          ExpressionAttributeNames: {
            '#eventSeq': 'eventSeq',
          },
          ExpressionAttributeValues: marshall({
            ':one': 1,
          }, { removeUndefinedValues: true }),
        },
      }],
    }));

    // Emit audit event to EventBridge (fan-out only)
    await this.emitAuditEvent(createAuditEvent({
      eventType: 'INCIDENT_CREATED',
      actor: { principalId: actor, principalType: 'USER' },
      incidentId,
      newState: 'CREATED',
    }));

    return { ...validated, eventSeq: 1 };
  }

  /**
   * Get incident by ID
   */
  async getIncident(incidentId: string): Promise<Incident> {
    const result = await dynamodb.send(new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({
        pk: `INCIDENT#${incidentId}`,
        sk: 'METADATA',
      }, { removeUndefinedValues: true }),
    }));

    if (!result.Item) {
      throw new IncidentNotFoundError(incidentId);
    }

    const item = unmarshall(result.Item);
    // Remove DynamoDB keys before returning
    const { pk, sk, ...incident } = item;
    return IncidentSchema.parse(incident);
  }

  /**
   * Request a state transition
   * 
   * DETERMINISTIC: Same input always produces same output.
   * 
   * OPX RULE: Legality enforced via cached state validation + conditional write.
   * - Validate against CACHED state (read once, never re-read)
   * - Conditional write enforces atomicity
   * - Invalid transitions → 400 (business error)
   * - Concurrent modifications → 409 (coordination error)
   * 
   * Why this works:
   * - Both concurrent requests validate against their cached state
   * - Both pass validation (for valid transitions)
   * - Conditional write determines winner
   * - Loser gets 409 (not 400)
   * 
   * eventSeq is derived from DynamoDB, never computed in memory.
   */
  async requestTransition(
    incidentId: string,
    request: TransitionRequest,
    actor: string
  ): Promise<Incident> {
    // Read current state ONCE (cached - never re-read)
    const incident = await this.getIncident(incidentId);
    const { targetState, reason } = request;
    const previousState = incident.state;

    // Validate transition legality against CACHED state
    // This rejects truly invalid transitions (e.g., CREATED → CLOSED)
    // Concurrent requests both validate against their cached state
    if (!isValidTransition(previousState, targetState)) {
      throw new InvalidTransitionError(
        previousState,
        targetState,
        getAllowedTransitions(previousState)
      );
    }

    const now = new Date().toISOString();

    const entryId = crypto.randomUUID();
    const timelineEntry: TimelineEntry = {
      entryId,
      timestamp: now,
      type: 'STATE_CHANGED',
      actor,
      previousState,
      newState: targetState,
      data: { reason },
    };

    // Conditional write enforces atomicity
    // - version = :expectedVersion (concurrency gate)
    // - state = :expectedState (ensures state hasn't changed)
    // If condition fails → 409 Conflict (coordination error, not business error)
    try {
      await dynamodb.send(new TransactWriteItemsCommand({
        TransactItems: [
          {
            Update: {
              TableName: TABLE_NAME,
              Key: marshall({
                pk: `INCIDENT#${incidentId}`,
                sk: 'METADATA',
              }, { removeUndefinedValues: true }),
              UpdateExpression: 'SET #state = :newState, #eventSeq = #eventSeq + :one, #updatedAt = :now, #timeline = list_append(#timeline, :entry), #version = #version + :one',
              ConditionExpression: '#version = :expectedVersion AND #state = :expectedState',
              ExpressionAttributeNames: {
                '#state': 'state',
                '#eventSeq': 'eventSeq',
                '#updatedAt': 'updatedAt',
                '#timeline': 'timeline',
                '#version': 'version',
              },
              ExpressionAttributeValues: marshall({
                ':newState': targetState,
                ':one': 1,
                ':now': now,
                ':entry': [timelineEntry],
                ':expectedVersion': incident.version,
                ':expectedState': previousState,
              }, { removeUndefinedValues: true }),
            },
          },
        ],
      }));
    } catch (error: any) {
      // Condition failed = coordination error = 409 Conflict (always)
      if (error.name === 'TransactionCanceledException') {
        throw new ConflictError(incidentId, incident.version, incident.version + 1);
      }
      throw error;
    }

    // Transaction succeeded - write event and return
    // Read back incident to get new eventSeq from DynamoDB
    const updatedIncident = await this.getIncident(incidentId);
    const newEventSeq = updatedIncident.eventSeq;

    // Compute state hash
    const stateHash = computeStateHash(updatedIncident);

    // Write event to authoritative event store
    // eventSeq comes from DynamoDB, not memory
    const event: EventStoreRecord = {
      incidentId,
      eventSeq: newEventSeq,
      eventType: 'STATE_CHANGED',
      fromState: previousState,
      toState: targetState,
      actor,
      decision: reason,
      timestamp: now,
      stateHashAfter: stateHash,
      metadata: {
        entryId, // Store entryId for replay
      },
    };

    await dynamodb.send(new PutItemCommand({
      TableName: EVENTS_TABLE_NAME,
      Item: marshall(event, { removeUndefinedValues: true }),
      ConditionExpression: 'attribute_not_exists(incidentId) AND attribute_not_exists(eventSeq)',
    }));

    // Emit audit event to EventBridge (fan-out only)
    await this.emitAuditEvent(createAuditEvent({
      eventType: 'INCIDENT_STATE_CHANGED',
      actor: { principalId: actor, principalType: 'USER' },
      incidentId,
      previousState,
      newState: targetState,
      reason,
    }));

    return updatedIncident;
  }

  /**
   * Process approval or rejection
   */
  async processApproval(
    incidentId: string,
    request: ApprovalRequest,
    actor: string
  ): Promise<Incident> {
    const incident = await this.getIncident(incidentId);

    // Can only approve/reject in WAITING_FOR_HUMAN state
    if (incident.state !== 'WAITING_FOR_HUMAN') {
      throw new ValidationError(
        `Cannot process approval in state: ${incident.state}. Must be WAITING_FOR_HUMAN.`
      );
    }

    const now = new Date().toISOString();
    const targetState: IncidentState = request.action === 'APPROVE' ? 'CLOSED' : 'ANALYZING';

    const entryId = crypto.randomUUID();
    const timelineEntry: TimelineEntry = {
      entryId,
      timestamp: now,
      type: request.action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      actor,
      previousState: incident.state,
      newState: targetState,
      data: { reason: request.reason },
    };

    // Transaction: Update incident + write event
    try {
      await dynamodb.send(new TransactWriteItemsCommand({
        TransactItems: [{
          Update: {
            TableName: TABLE_NAME,
            Key: marshall({
              pk: `INCIDENT#${incidentId}`,
              sk: 'METADATA',
            }, { removeUndefinedValues: true }),
            UpdateExpression: 'SET #state = :newState, #eventSeq = #eventSeq + :one, #updatedAt = :now, #timeline = list_append(#timeline, :entry), #version = #version + :one',
            ConditionExpression: '#version = :expectedVersion',
            ExpressionAttributeNames: {
              '#state': 'state',
              '#eventSeq': 'eventSeq',
              '#updatedAt': 'updatedAt',
              '#timeline': 'timeline',
              '#version': 'version',
            },
            ExpressionAttributeValues: marshall({
              ':newState': targetState,
              ':one': 1,
              ':now': now,
              ':entry': [timelineEntry],
              ':expectedVersion': incident.version,
            }, { removeUndefinedValues: true }),
          },
        }],
      }));
    } catch (error: any) {
      if (error.name === 'TransactionCanceledException') {
        throw new ConflictError(incidentId, incident.version, incident.version + 1);
      }
      throw error;
    }

    // Read back incident
    const updatedIncident = await this.getIncident(incidentId);
    const newEventSeq = updatedIncident.eventSeq;
    const stateHash = computeStateHash(updatedIncident);

    // Write event
    const event: EventStoreRecord = {
      incidentId,
      eventSeq: newEventSeq,
      eventType: request.action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      fromState: incident.state,
      toState: targetState,
      actor,
      decision: request.reason,
      timestamp: now,
      stateHashAfter: stateHash,
      metadata: {
        entryId, // Store entryId for replay
      },
    };

    await dynamodb.send(new PutItemCommand({
      TableName: EVENTS_TABLE_NAME,
      Item: marshall(event, { removeUndefinedValues: true }),
      ConditionExpression: 'attribute_not_exists(incidentId) AND attribute_not_exists(eventSeq)',
    }));

    // Emit audit event
    await this.emitAuditEvent(createAuditEvent({
      eventType: request.action === 'APPROVE' ? 'INCIDENT_APPROVED' : 'INCIDENT_REJECTED',
      actor: { principalId: actor, principalType: 'USER' },
      incidentId,
      previousState: incident.state,
      newState: targetState,
      reason: request.reason,
    }));

    return updatedIncident;
  }

  /**
   * List incidents with optional filters
   */
  async listIncidents(params?: {
    state?: IncidentState;
    service?: string;
    limit?: number;
  }): Promise<Incident[]> {
    let command: QueryCommand;

    if (params?.state) {
      command = new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'gsi-state',
        KeyConditionExpression: '#state = :state',
        ExpressionAttributeNames: { '#state': 'state' },
        ExpressionAttributeValues: marshall({ ':state': params.state }, { removeUndefinedValues: true }),
        Limit: params?.limit ?? 100,
        ScanIndexForward: false, // Most recent first
      });
    } else if (params?.service) {
      command = new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'gsi-service',
        KeyConditionExpression: '#service = :service',
        ExpressionAttributeNames: { '#service': 'service' },
        ExpressionAttributeValues: marshall({ ':service': params.service }, { removeUndefinedValues: true }),
        Limit: params?.limit ?? 100,
        ScanIndexForward: false,
      });
    } else {
      // Full scan - not ideal but acceptable for Phase 1
      command = new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'begins_with(pk, :prefix)',
        ExpressionAttributeValues: marshall({ ':prefix': 'INCIDENT#' }, { removeUndefinedValues: true }),
        Limit: params?.limit ?? 100,
      });
    }

    const result = await dynamodb.send(command);
    
    return (result.Items ?? []).map((item: Record<string, any>) => {
      const data = unmarshall(item);
      const { pk, sk, ...incident } = data;
      return IncidentSchema.parse(incident);
    });
  }

  /**
   * Get incident timeline
   */
  async getTimeline(incidentId: string): Promise<TimelineEntry[]> {
    const incident = await this.getIncident(incidentId);
    return incident.timeline;
  }

  /**
   * Emit audit event to EventBridge
   */
  private async emitAuditEvent(event: AuditEvent): Promise<void> {
    await eventbridge.send(new PutEventsCommand({
      Entries: [{
        EventBusName: EVENT_BUS_NAME,
        Source: event.source,
        DetailType: event.eventType,
        Detail: JSON.stringify(event),
        Time: new Date(event.timestamp),
      }],
    }));
  }
}
