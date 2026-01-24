import type { APIGatewayProxyEvent } from 'aws-lambda';
import { ValidationError } from '../domain/errors.js';

/**
 * Authorization Module
 * 
 * Extracts and validates IAM principals from API Gateway requests.
 * NO API KEYS. NO STATIC TOKENS. IAM ONLY.
 * 
 * Every action must be traceable to an AWS principal.
 */

export interface Principal {
  principalId: string;
  principalType: 'USER' | 'ROLE' | 'ASSUMED_ROLE' | 'FEDERATED_USER' | 'SERVICE';
  arn: string;
  accountId: string;
}

/**
 * Extract IAM principal from API Gateway request context
 * 
 * CRITICAL: This is the ONLY way to identify who is making a request.
 * If principal cannot be extracted, request is REJECTED.
 */
export function extractPrincipal(event: APIGatewayProxyEvent): Principal {
  const identity = event.requestContext.identity;

  // Extract principal ARN
  const principalArn = identity.userArn || identity.caller;
  
  if (!principalArn) {
    throw new ValidationError(
      'No IAM principal found in request. API requires IAM authentication.',
      {
        requestId: event.requestContext.requestId,
        sourceIp: identity.sourceIp,
      }
    );
  }

  // Parse ARN to extract account and principal type
  // ARN format: arn:aws:iam::ACCOUNT:user/USERNAME
  //             arn:aws:sts::ACCOUNT:assumed-role/ROLE/SESSION
  const arnParts = principalArn.split(':');
  
  if (arnParts.length < 6) {
    throw new ValidationError(
      'Invalid principal ARN format',
      { principalArn }
    );
  }

  const accountId = arnParts[4];
  const resourcePart = arnParts[5]; // e.g., "user/alice" or "assumed-role/MyRole/session"

  let principalType: Principal['principalType'];
  let principalId: string;

  if (resourcePart.startsWith('user/')) {
    principalType = 'USER';
    principalId = resourcePart.substring(5); // Remove "user/" prefix
  } else if (resourcePart.startsWith('assumed-role/')) {
    principalType = 'ASSUMED_ROLE';
    const parts = resourcePart.split('/');
    principalId = parts[1]; // Role name
  } else if (resourcePart.startsWith('role/')) {
    principalType = 'ROLE';
    principalId = resourcePart.substring(5);
  } else if (resourcePart.startsWith('federated-user/')) {
    principalType = 'FEDERATED_USER';
    principalId = resourcePart.substring(15);
  } else {
    principalType = 'SERVICE';
    principalId = resourcePart;
  }

  return {
    principalId,
    principalType,
    arn: principalArn,
    accountId,
  };
}

/**
 * Check if principal has required permission
 * 
 * Phase 1: Basic RBAC based on API Gateway IAM authorization
 * Phase 2: Will add policy engine for fine-grained control
 */
export function checkPermission(
  _principal: Principal,
  _action: 'incident:create' | 'incident:read' | 'incident:transition' | 'incident:approve'
): boolean {
  // In Phase 1, API Gateway IAM authorization handles this
  // If request reached Lambda, principal is already authorized
  // This function is a placeholder for Phase 2 policy engine
  return true;
}

/**
 * Format principal for audit logs
 */
export function formatPrincipalForAudit(principal: Principal): string {
  return `${principal.principalType}:${principal.principalId}`;
}
