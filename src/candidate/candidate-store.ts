/**
 * CP-5: Candidate Store
 * 
 * Append-only storage for incident candidates.
 * 
 * INVARIANTS:
 * - Append-only (no updates)
 * - Idempotent writes (conditional expression)
 * - No deletions
 * - No TTL (permanent in Phase 2)
 * 
 * 🔒 FIX #4: Concurrent generation converges (idempotent by design)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { IncidentCandidate, IncidentCandidateSchema } from './candidate.schema.js';

export interface CandidateStoreConfig {
  tableName: string;
  region?: string;
}

export interface CandidateStoreResult {
  success: boolean;
  alreadyExists?: boolean;
  error?: string;
}

/**
 * Candidate Store
 * 
 * DynamoDB-backed append-only storage.
 */
export class CandidateStore {
  private readonly client: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(config: CandidateStoreConfig) {
    const dynamoClient = new DynamoDBClient({
      region: config.region || process.env.AWS_REGION || 'us-east-1',
    });
    this.client = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = config.tableName;
  }

  /**
   * Store candidate (idempotent)
   * 
   * If candidate exists → return { alreadyExists: true }
   * Never overwrite, never duplicate.
   * 
   * 🔒 FIX #4: Concurrent calls converge on same candidateId
   * 
   * @param candidate - Candidate to store
   * @returns Store result
   */
  async store(candidate: IncidentCandidate): Promise<CandidateStoreResult> {
    // Validate before storing
    const validation = IncidentCandidateSchema.safeParse(candidate);
    if (!validation.success) {
      return {
        success: false,
        error: `Invalid candidate: ${validation.error.message}`,
      };
    }

    try {
      const item = {
        // Primary key
        PK: `CANDIDATE#${candidate.candidateId}`,
        SK: 'METADATA',

        // GSI-1: By rule
        GSI1PK: `RULE#${candidate.correlationRule}`,
        GSI1SK: candidate.createdAt,

        // GSI-2: By service
        GSI2PK: `SERVICE#${candidate.suggestedService}`,
        GSI2SK: candidate.createdAt,

        // Entity metadata
        entityType: 'INCIDENT_CANDIDATE',

        // Candidate data
        ...candidate,
      };

      // Append-only: condition prevents overwrites
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      return { success: true, alreadyExists: false };
    } catch (error) {
      if ((error as any).name === 'ConditionalCheckFailedException') {
        // Already exists - this is idempotent success
        return { success: true, alreadyExists: true };
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to store candidate', {
        candidateId: candidate.candidateId,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get candidate by ID
   * 
   * @param candidateId - Candidate ID
   * @returns Candidate or null
   */
  async get(candidateId: string): Promise<IncidentCandidate | null> {
    try {
      const result = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            PK: `CANDIDATE#${candidateId}`,
            SK: 'METADATA',
          },
        })
      );

      if (!result.Item) {
        return null;
      }

      // Strip DynamoDB keys
      const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, entityType, ...candidate } =
        result.Item;
      return candidate as IncidentCandidate;
    } catch (error) {
      console.error('Failed to get candidate', {
        candidateId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * List candidates by rule
   * 
   * @param ruleId - Rule ID
   * @param limit - Maximum results
   * @returns Array of candidates
   */
  async listByRule(ruleId: string, limit = 100): Promise<IncidentCandidate[]> {
    try {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: {
            ':pk': `RULE#${ruleId}`,
          },
          Limit: limit,
          ScanIndexForward: false, // Most recent first
        })
      );

      return (result.Items || []).map(item => {
        const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, entityType, ...candidate } =
          item;
        return candidate as IncidentCandidate;
      });
    } catch (error) {
      console.error('Failed to list candidates by rule', {
        ruleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * List candidates by service
   * 
   * @param service - Service name
   * @param limit - Maximum results
   * @returns Array of candidates
   */
  async listByService(service: string, limit = 100): Promise<IncidentCandidate[]> {
    try {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'GSI2',
          KeyConditionExpression: 'GSI2PK = :pk',
          ExpressionAttributeValues: {
            ':pk': `SERVICE#${service}`,
          },
          Limit: limit,
          ScanIndexForward: false, // Most recent first
        })
      );

      return (result.Items || []).map(item => {
        const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, entityType, ...candidate } =
          item;
        return candidate as IncidentCandidate;
      });
    } catch (error) {
      console.error('Failed to list candidates by service', {
        service,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * List all candidates
   * 
   * For tooling only.
   * 
   * @param limit - Maximum results
   * @returns Array of candidates
   */
  async list(limit = 100): Promise<IncidentCandidate[]> {
    try {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'begins_with(PK, :prefix)',
          ExpressionAttributeValues: {
            ':prefix': 'CANDIDATE#',
          },
          Limit: limit,
        })
      );

      return (result.Items || []).map(item => {
        const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, entityType, ...candidate } =
          item;
        return candidate as IncidentCandidate;
      });
    } catch (error) {
      console.error('Failed to list candidates', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
