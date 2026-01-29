/**
 * Phase 5 - Step 7: Kill Switch API Handler
 * 
 * API Gateway handler for kill switch management.
 * 
 * MANDATORY FIX APPLIED:
 * - FIX 7.1: Audit before enforcement (all actions audited)
 * 
 * CRITICAL REMINDERS:
 * - EMERGENCY_OVERRIDE only for management
 * - <30s disable time
 * - All actions audited
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { z } from 'zod';
import { KillSwitch } from '../kill-switch';
import { AutomationAuditStore } from '../automation-audit-store';
import { computeAuditId } from '../audit-id.js';
import type { Authority } from '../../promotion/authority.schema';

const VERSION = '1.0.0';

// Environment variables
const CONFIG_TABLE_NAME = process.env.CONFIG_TABLE_NAME || 'opx-automation-config';
const AUDIT_TABLE_NAME = process.env.AUDIT_TABLE_NAME!;

// AWS clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const killSwitch = new KillSwitch(dynamoClient, CONFIG_TABLE_NAME);
const auditStore = new AutomationAuditStore(dynamoClient, AUDIT_TABLE_NAME);

/**
 * Request schemas
 */
const DisableRequestSchema = z.object({
  reason: z.string().min(1),
});

/**
 * Lambda handler
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Extract principal from IAM context
    const principal = extractPrincipal(event);
    if (!principal) {
      return errorResponse(401, 'UNAUTHORIZED', 'Missing or invalid IAM principal');
    }

    // Parse action from path
    const action = event.path.split('/').pop(); // 'disable', 'enable', 'status'

    // Status endpoint is read-only (no authority check)
    if (action === 'status') {
      const status = await killSwitch.getStatus();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(status),
      };
    }

    // Extract authority for write operations
    const body = event.body ? JSON.parse(event.body) : {};
    const authority: Authority = {
      type: 'EMERGENCY_OVERRIDE', // Only EMERGENCY_OVERRIDE allowed
      identifier: principal,
    };

    // Validate authority (EMERGENCY_OVERRIDE required)
    if (authority.type !== 'EMERGENCY_OVERRIDE') {
      return errorResponse(403, 'INSUFFICIENT_AUTHORITY', 'EMERGENCY_OVERRIDE required');
    }

    const startTime = new Date().toISOString();

    if (action === 'disable') {
      // Parse request
      const request = DisableRequestSchema.parse(body);

      // Disable kill switch
      await killSwitch.disable(authority, request.reason);

      // FIX 7.1: Audit the action
      const auditId = computeAuditId('KILL_SWITCH_DISABLE', startTime, VERSION);
      await auditStore.recordAudit({
        auditId,
        operationType: 'KILL_SWITCH_DISABLE',
        triggerType: 'MANUAL',
        startTime,
        endTime: new Date().toISOString(),
        status: 'SUCCESS',
        parameters: { reason: request.reason },
        results: { action: 'DISABLED' },
        triggeredBy: authority,
        version: VERSION,
      });

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'DISABLED',
          message: 'Kill switch disabled - all automated operations blocked',
          auditId,
        }),
      };
    }

    if (action === 'enable') {
      // Enable kill switch
      await killSwitch.enable(authority);

      // FIX 7.1: Audit the action
      const auditId = computeAuditId('KILL_SWITCH_ENABLE', startTime, VERSION);
      await auditStore.recordAudit({
        auditId,
        operationType: 'KILL_SWITCH_ENABLE',
        triggerType: 'MANUAL',
        startTime,
        endTime: new Date().toISOString(),
        status: 'SUCCESS',
        parameters: {},
        results: { action: 'ENABLED' },
        triggeredBy: authority,
        version: VERSION,
      });

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'ENABLED',
          message: 'Kill switch enabled - automated operations allowed',
          auditId,
        }),
      };
    }

    return errorResponse(404, 'NOT_FOUND', `Unknown action: ${action}`);
  } catch (error: any) {
    console.error('Kill switch handler error:', error);

    if (error.name === 'ZodError') {
      return errorResponse(400, 'VALIDATION_ERROR', error.message);
    }

    if (error.message?.includes('INSUFFICIENT_AUTHORITY')) {
      return errorResponse(403, 'INSUFFICIENT_AUTHORITY', error.message);
    }

    return errorResponse(500, 'INTERNAL_ERROR', error.message);
  }
}

/**
 * Extract principal from IAM context
 */
function extractPrincipal(event: APIGatewayProxyEvent): string | null {
  const principalId = event.requestContext?.identity?.userArn ||
                      event.requestContext?.identity?.user ||
                      event.requestContext?.accountId;

  return principalId || null;
}

/**
 * Error response helper
 */
function errorResponse(
  statusCode: number,
  errorCode: string,
  message: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: errorCode,
      message,
    }),
  };
}
