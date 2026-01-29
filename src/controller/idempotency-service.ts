import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import * as crypto from 'crypto';
import {
  IdempotencyRecord,
  IdempotencyRecordSchema,
} from '../domain/idempotency.js';
import { CreateIncidentRequest } from '../domain/incident.js';
import { canonicalizeDeep } from '../utils/hash.js';

const dynamodb = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const IDEMPOTENCY_TABLE_NAME = process.env.IDEMPOTENCY_TABLE_NAME!;

/**
 * Idempotency Service
 * 
 * CRITICAL INVARIANTS:
 * - "Idempotency records are audit artifacts, not caches."
 * - No TTL - records are permanent
 * - No bypass path - idempotency ALWAYS applied
 * - Only ONE request (the owner) executes business logic
 * 
 * Design Rule:
 * "If client does not provide Idempotency-Key, the system deterministically generates one."
 */
export class IdempotencyService {
  /**
   * Get or generate idempotency key
   * 
   * ALWAYS returns a key - no bypass path exists.
   */
  getIdempotencyKey(
    request: CreateIncidentRequest,
    principal: string,
    clientKey?: string
  ): string {
    if (clientKey) {
      return clientKey;
    }
    return this.generateIdempotencyKey(request, principal);
  }

  /**
   * Generate deterministic idempotency key
   */
  private generateIdempotencyKey(
    request: CreateIncidentRequest,
    principal: string
  ): string {
    const canonical = canonicalizeDeep(request);
    const json = JSON.stringify(canonical);
    const input = `${principal}:incident:create:${json}`;
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
  }

  /**
   * Compute request hash
   */
  computeRequestHash(request: CreateIncidentRequest): string {
    const canonical = canonicalizeDeep(request);
    const json = JSON.stringify(canonical);
    return crypto.createHash('sha256').update(json, 'utf8').digest('hex');
  }

  /**
   * Get idempotency record
   */
  async getIdempotencyRecord(
    idempotencyKey: string
  ): Promise<IdempotencyRecord | null> {
    const result = await dynamodb.send(new GetItemCommand({
      TableName: IDEMPOTENCY_TABLE_NAME,
      Key: marshall({ idempotencyKey }, { removeUndefinedValues: true }),
      ConsistentRead: true,
    }));

    if (!result.Item) {
      return null;
    }

    const data = unmarshall(result.Item);
    return IdempotencyRecordSchema.parse(data);
  }

  /**
   * Try to claim idempotency slot with conditional write
   * 
   * Creates IN_PROGRESS record. Only one request will succeed.
   * Throws ConditionalCheckFailedException if slot is already claimed.
   */
  async tryClaimIdempotencySlot(
    idempotencyKey: string,
    requestHash: string,
    principal: string,
    timestamp: string
  ): Promise<void> {
    await dynamodb.send(new PutItemCommand({
      TableName: IDEMPOTENCY_TABLE_NAME,
      Item: marshall({
        idempotencyKey,
        requestHash,
        status: 'IN_PROGRESS',
        principal,
        createdAt: timestamp,
      }, { removeUndefinedValues: true }),
      ConditionExpression: 'attribute_not_exists(idempotencyKey)',
    }));
  }

  /**
   * Mark idempotency operation as completed with response
   */
  async completeIdempotency(
    idempotencyKey: string,
    incidentId: string,
    response: any
  ): Promise<void> {
    const now = new Date().toISOString();
    
    await dynamodb.send(new UpdateItemCommand({
      TableName: IDEMPOTENCY_TABLE_NAME,
      Key: marshall({ idempotencyKey }, { removeUndefinedValues: true }),
      UpdateExpression: 'SET #status = :status, incidentId = :incidentId, #response = :response, completedAt = :completedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#response': 'response',
      },
      ExpressionAttributeValues: marshall({
        ':status': 'COMPLETED',
        ':incidentId': incidentId,
        ':response': response,
        ':completedAt': now,
      }, { removeUndefinedValues: true }),
    }));
  }
}
