import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { AwsCredentialIdentity } from '@aws-sdk/types';

/**
 * AWS Integration Test Helpers
 * 
 * NO MOCKS - Real AWS resources only.
 * 
 * Provides:
 * - SigV4 signing for API Gateway
 * - IAM role assumption
 * - Signed HTTP requests
 * 
 * Uses defaultProvider() for credential resolution:
 * - Environment variables
 * - Shared credentials file (~/.aws/credentials)
 * - Shared config (~/.aws/config)
 * - SSO
 * - EC2/ECS role
 */

const API_ENDPOINT = process.env.API_ENDPOINT || 'https://xhu3ymbc14.execute-api.us-east-1.amazonaws.com/v1';
const REGION = process.env.AWS_REGION || 'us-east-1';

/**
 * Sign HTTP request with AWS SigV4
 * 
 * Uses defaultProvider() to resolve credentials from:
 * - Environment variables
 * - ~/.aws/credentials
 * - ~/.aws/config
 * - SSO
 * - EC2/ECS role
 */
export async function signRequest(
  method: string,
  path: string,
  body?: string,
  headers?: Record<string, string>,
  credentials?: any
): Promise<any> {
  // Resolve credentials - support both provider functions and static credential objects
  let creds: AwsCredentialIdentity;
  
  if (typeof credentials === 'function') {
    // Credential provider passed explicitly
    creds = await credentials();
  } else if (credentials) {
    // Static credentials object passed (e.g., from assumeRole)
    creds = credentials;
  } else {
    // Default AWS credential chain
    creds = await defaultProvider()();
  }

  const url = new URL(`${API_ENDPOINT}${path}`);
  
  const request = new HttpRequest({
    method,
    protocol: url.protocol,
    hostname: url.hostname,
    path: url.pathname,
    headers: {
      'Content-Type': 'application/json',
      'host': url.hostname,
      ...headers,
    },
    body,
  });

  const signer = new SignatureV4({
    service: 'execute-api',
    region: REGION,
    credentials: creds,
    sha256: Sha256,
  });

  return await signer.sign(request) as any;
}

/**
 * Make signed request to API Gateway
 */
export async function makeSignedRequest(
  method: string,
  path: string,
  body?: any,
  headers?: Record<string, string>,
  credentials?: any
): Promise<Response> {
  const bodyString = body ? JSON.stringify(body) : undefined;
  const signedRequest = await signRequest(method, path, bodyString, headers, credentials);

  const url = `${signedRequest.protocol}//${signedRequest.hostname}${signedRequest.path}`;
  
  return fetch(url, {
    method: signedRequest.method,
    headers: signedRequest.headers as any,
    body: bodyString,
  });
}

/**
 * Assume IAM role for testing
 */
export async function assumeRole(roleArn: string): Promise<any> {
  const sts = new STSClient({ region: REGION });
  
  const result = await sts.send(new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: `integration-test-${Date.now()}`,
    DurationSeconds: 900, // 15 minutes
  }));

  if (!result.Credentials) {
    throw new Error('Failed to assume role');
  }

  return {
    accessKeyId: result.Credentials.AccessKeyId!,
    secretAccessKey: result.Credentials.SecretAccessKey!,
    sessionToken: result.Credentials.SessionToken!,
  };
}

/**
 * Wait for condition with timeout (for eventually consistent operations)
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs: number = 5000,
  pollIntervalMs: number = 500
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await sleep(pollIntervalMs);
  }
  
  return false;
}

/**
 * Sleep helper
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get stack outputs from environment
 */
export function getStackOutputs() {
  return {
    apiEndpoint: process.env.API_ENDPOINT || API_ENDPOINT,
    incidentsTableName: process.env.INCIDENTS_TABLE_NAME || 'opx-incidents',
    eventsTableName: process.env.INCIDENT_EVENTS_TABLE_NAME || 'opx-incident-events',
    idempotencyTableName: process.env.IDEMPOTENCY_TABLE_NAME || 'opx-idempotency',
    creatorRoleArn: process.env.CREATOR_ROLE_ARN || 'arn:aws:iam::123456789012:role/OpxIncidentCreator',
    readerRoleArn: process.env.READER_ROLE_ARN || 'arn:aws:iam::123456789012:role/OpxIncidentReader',
    operatorRoleArn: process.env.OPERATOR_ROLE_ARN || 'arn:aws:iam::123456789012:role/OpxIncidentOperator',
    approverRoleArn: process.env.APPROVER_ROLE_ARN || 'arn:aws:iam::123456789012:role/OpxIncidentApprover',
  };
}
