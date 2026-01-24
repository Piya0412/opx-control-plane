/**
 * CP-8: Incident Controller - Public Exports
 */

export * from './incident-controller';
export * from './request-validator';
export * from './authority-validator';
export * from './rate-limiter';
export * from './response-builder';

// Lambda Handler
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { IncidentController } from './incident-controller.js';
import { IncidentManager } from '../incident/incident-manager.js';
import { IncidentStore } from '../incident/incident-store.js';
import { IncidentEventStore } from '../incident/incident-event-store.js';
import { IdempotencyService } from './idempotency-service.js';
import { AuditEmitter } from '../promotion/audit-emitter.js';

// Initialize dependencies (singleton pattern for Lambda container reuse)
let controller: IncidentController | null = null;

function getController(): IncidentController {
  if (!controller) {
    const incidentsTableName = process.env.INCIDENTS_TABLE_NAME!;
    const incidentEventsTableName = process.env.INCIDENT_EVENTS_TABLE_NAME!;
    const idempotencyTableName = process.env.IDEMPOTENCY_TABLE_NAME!;
    const auditEventBusName = process.env.AUDIT_EVENT_BUS_NAME!;

    const incidentStore = new IncidentStore({ tableName: incidentsTableName });
    const eventStore = new IncidentEventStore({ tableName: incidentEventsTableName });
    const idempotencyService = new IdempotencyService({ tableName: idempotencyTableName });
    const auditEmitter = new AuditEmitter({ eventBusName: auditEventBusName });

    const incidentManager = new IncidentManager({
      incidentStore,
      eventStore,
      idempotencyService,
      auditEmitter,
    });

    controller = new IncidentController({
      incidentManager,
      rateLimiterTableName: idempotencyTableName, // Reuse idempotency table for rate limiting
    });
  }

  return controller;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const ctrl = getController();
    
    // Extract authority from request context (IAM authentication)
    const authority = {
      authorityId: event.requestContext.identity.userArn || 'unknown',
      authorityType: 'HUMAN' as const,
    };

    // Route based on HTTP method and path
    const path = event.path;
    const method = event.httpMethod;
    const body = event.body ? JSON.parse(event.body) : {};

    // Extract incidentId from path if present
    const incidentIdMatch = path.match(/\/incidents\/([^/]+)/);
    const incidentId = incidentIdMatch ? incidentIdMatch[1] : null;

    let response;

    if (method === 'POST' && path === '/incidents') {
      // Create incident - not implemented yet
      return {
        statusCode: 501,
        body: JSON.stringify({ error: 'NOT_IMPLEMENTED', message: 'Create incident not implemented' }),
      };
    } else if (method === 'GET' && path === '/incidents') {
      // List incidents
      const filters = event.queryStringParameters || {};
      response = await ctrl.listIncidents(filters, authority);
    } else if (method === 'GET' && incidentId && path.endsWith(incidentId)) {
      // Get incident
      response = await ctrl.getIncident(incidentId, authority);
    } else if (method === 'POST' && incidentId && path.includes('/transitions')) {
      // Transition incident
      const action = body.action;
      if (action === 'OPEN') {
        response = await ctrl.openIncident(incidentId, body, authority);
      } else if (action === 'MITIGATE') {
        response = await ctrl.startMitigation(incidentId, body, authority);
      } else if (action === 'RESOLVE') {
        response = await ctrl.resolveIncident(incidentId, body, authority);
      } else if (action === 'CLOSE') {
        response = await ctrl.closeIncident(incidentId, body, authority);
      } else {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'INVALID_ACTION', message: 'Invalid transition action' }),
        };
      }
    } else {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'NOT_FOUND', message: 'Route not found' }),
      };
    }

    // Convert controller response to API Gateway response
    return {
      statusCode: response.statusCode,
      body: JSON.stringify(response.body),
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': response.requestId,
      },
    };
  } catch (error) {
    console.error('Unhandled error in Lambda handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      }),
    };
  }
}
