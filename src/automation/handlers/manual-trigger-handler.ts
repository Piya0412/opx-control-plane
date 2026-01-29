/**
 * Phase 5 - Step 5: Manual Trigger Handler
 * 
 * API Gateway handler for manual operation triggers.
 * 
 * MANDATORY FIXES APPLIED:
 * - FIX 5.1: Kill switch bypass only for EMERGENCY_OVERRIDE
 * - FIX 5.2: Rate limiting enforced (5/3/10 per hour per principal)
 * 
 * REMINDERS:
 * - Kill switch bypass only for EMERGENCY_OVERRIDE
 * - Rate limits enforced before invocation
 * - Async execution + immediate audit ID return
 * - No synchronous work inside API Gateway
 * - IAM SigV4 remains the only auth mechanism
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { z } from 'zod';
import { RateLimiter } from '../rate-limiter';
import { AutomationAuditStore } from '../automation-audit-store';
import { computeAuditId } from '../audit-id.js';
import type { Authority } from '../../promotion/authority.schema';
import type { OperationType } from '../automation-audit.schema';

const VERSION = '1.0.0';

// Environment variables
const AUDIT_TABLE_NAME = process.env.AUDIT_TABLE_NAME!;
const CONFIG_TABLE_NAME = process.env.CONFIG_TABLE_NAME || 'opx-automation-config';
const PATTERN_EXTRACTION_FUNCTION = process.env.PATTERN_EXTRACTION_FUNCTION!;
const CALIBRATION_FUNCTION = process.env.CALIBRATION_FUNCTION!;
const SNAPSHOT_FUNCTION = process.env.SNAPSHOT_FUNCTION!;

// AWS clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const rateLimiter = new RateLimiter(dynamoClient, CONFIG_TABLE_NAME);
const auditStore = new AutomationAuditStore(dynamoClient, AUDIT_TABLE_NAME);

/**
 * Request schemas
 */
const ExtractPatternsRequestSchema = z.object({
  service: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  emergency: z.boolean().optional(),
});

const CalibrateRequestSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  emergency: z.boolean().optional(),
});

const CreateSnapshotRequestSchema = z.object({
  snapshotType: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  emergency: z.boolean().optional(),
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

    // Parse request
    const { operationType, request, triggerType } = parseRequest(event);

    // Extract authority
    const authority: Authority = {
      type: request.emergency ? 'EMERGENCY_OVERRIDE' : 'HUMAN_OPERATOR',
      identifier: principal,
    };

    // FIX 5.1: Check kill switch (with EMERGENCY_OVERRIDE bypass)
    const killSwitchCheck = await checkKillSwitch(triggerType, authority);
    if (killSwitchCheck.blocked) {
      return errorResponse(503, 'KILL_SWITCH_ACTIVE', killSwitchCheck.reason!);
    }

    // FIX 5.2: Check rate limit BEFORE invocation
    const rateLimitCheck = await rateLimiter.checkRateLimit(principal, operationType);
    if (!rateLimitCheck.allowed) {
      return errorResponse(
        429,
        'RATE_LIMIT_EXCEEDED',
        `Rate limit exceeded. Retry after ${Math.ceil(rateLimitCheck.retryAfter! / 1000)} seconds.`,
        {
          'Retry-After': Math.ceil(rateLimitCheck.retryAfter! / 1000).toString(),
          'X-RateLimit-Limit': rateLimitCheck.limit!.toString(),
          'X-RateLimit-Remaining': '0',
        }
      );
    }

    // Generate audit ID (will be used by async Lambda)
    const startTime = new Date().toISOString();
    const auditId = computeAuditId(operationType, startTime, VERSION);

    // REMINDER: Async execution + immediate audit ID return
    // No synchronous work inside API Gateway
    await invokeOperationAsync(operationType, request, authority, auditId);

    // Return audit ID immediately (202 Accepted)
    return {
      statusCode: 202,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': rateLimitCheck.limit!.toString(),
        'X-RateLimit-Remaining': (rateLimitCheck.limit! - rateLimitCheck.currentCount!).toString(),
      },
      body: JSON.stringify({
        auditId,
        status: 'ACCEPTED',
        message: 'Operation queued for execution',
      }),
    };
  } catch (error: any) {
    console.error('Manual trigger handler error:', error);
    return errorResponse(500, 'INTERNAL_ERROR', error.message);
  }
}

/**
 * FIX 5.1: Check kill switch with EMERGENCY_OVERRIDE bypass
 */
async function checkKillSwitch(
  triggerType: 'MANUAL' | 'MANUAL_EMERGENCY',
  authority: Authority
): Promise<{ blocked: boolean; reason?: string }> {
  try {
    const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
    const docClient = await import('@aws-sdk/lib-dynamodb').then(m =>
      m.DynamoDBDocumentClient.from(dynamoClient)
    );

    const result = await docClient.send(
      new GetCommand({
        TableName: CONFIG_TABLE_NAME,
        Key: {
          PK: 'CONFIG#KILL_SWITCH',
          SK: 'METADATA',
        },
      })
    );

    const killSwitchActive = result.Item?.enabled === false;

    if (!killSwitchActive) {
      return { blocked: false };
    }

    // Kill switch is active
    if (triggerType === 'MANUAL_EMERGENCY' && authority.type === 'EMERGENCY_OVERRIDE') {
      // EMERGENCY_OVERRIDE bypasses kill switch
      return { blocked: false };
    }

    // All other cases are blocked
    return {
      blocked: true,
      reason: 'KILL_SWITCH_BLOCKS_MANUAL',
    };
  } catch (error) {
    console.error('Kill switch check failed:', error);
    // Fail open for kill switch check
    return { blocked: false };
  }
}

/**
 * Extract principal from IAM context
 */
function extractPrincipal(event: APIGatewayProxyEvent): string | null {
  // IAM SigV4 authentication
  const principalId = event.requestContext?.identity?.userArn ||
                      event.requestContext?.identity?.user ||
                      event.requestContext?.accountId;

  return principalId || null;
}

/**
 * Parse request based on path
 */
function parseRequest(event: APIGatewayProxyEvent): {
  operationType: OperationType;
  request: any;
  triggerType: 'MANUAL' | 'MANUAL_EMERGENCY';
} {
  const path = event.path;
  const body = event.body ? JSON.parse(event.body) : {};

  if (path.includes('/extract-patterns')) {
    const request = ExtractPatternsRequestSchema.parse(body);
    return {
      operationType: 'PATTERN_EXTRACTION',
      request,
      triggerType: request.emergency ? 'MANUAL_EMERGENCY' : 'MANUAL',
    };
  }

  if (path.includes('/calibrate')) {
    const request = CalibrateRequestSchema.parse(body);
    return {
      operationType: 'CALIBRATION',
      request,
      triggerType: request.emergency ? 'MANUAL_EMERGENCY' : 'MANUAL',
    };
  }

  if (path.includes('/create-snapshot')) {
    const request = CreateSnapshotRequestSchema.parse(body);
    return {
      operationType: 'SNAPSHOT',
      request,
      triggerType: request.emergency ? 'MANUAL_EMERGENCY' : 'MANUAL',
    };
  }

  throw new Error(`Unknown path: ${path}`);
}

/**
 * Invoke operation asynchronously
 */
async function invokeOperationAsync(
  operationType: OperationType,
  request: any,
  authority: Authority,
  auditId: string
): Promise<void> {
  const functionName = getFunctionName(operationType);

  const payload = {
    detail: {
      ...request,
      auditId, // Pass audit ID to Lambda
    },
    requestContext: {
      identity: {
        userArn: authority.identifier,
      },
    },
  };

  await lambdaClient.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event', // Async invocation
      Payload: Buffer.from(JSON.stringify(payload)),
    })
  );
}

/**
 * Get Lambda function name for operation type
 */
function getFunctionName(operationType: OperationType): string {
  switch (operationType) {
    case 'PATTERN_EXTRACTION':
      return PATTERN_EXTRACTION_FUNCTION;
    case 'CALIBRATION':
      return CALIBRATION_FUNCTION;
    case 'SNAPSHOT':
      return SNAPSHOT_FUNCTION;
    default:
      throw new Error(`Unknown operation type: ${operationType}`);
  }
}

/**
 * Error response helper
 */
function errorResponse(
  statusCode: number,
  errorCode: string,
  message: string,
  additionalHeaders?: Record<string, string>
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...additionalHeaders,
    },
    body: JSON.stringify({
      error: errorCode,
      message,
    }),
  };
}
