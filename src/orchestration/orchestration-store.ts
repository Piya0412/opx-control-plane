/**
 * Phase 2.3: Orchestration Store
 * 
 * Write-only observability log for orchestration attempts.
 * 
 * INVARIANTS:
 * - Write-only (no reads on hot path)
 * - No dependency for correctness (observability only)
 * - 90-day TTL (derived data, not source of truth)
 * - Failure to log must not block orchestration
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

// === ORCHESTRATION ATTEMPT ===

export interface OrchestrationAttempt {
  candidateId: string;
  attemptId: string;
  
  // Input
  authorityType: string;
  authorityId: string;
  policyId: string;
  policyVersion: string;
  
  // Output
  decision: 'PROMOTE' | 'DEFER' | 'SUPPRESS';
  decisionId: string;
  incidentId?: string;
  reason: string;
  
  // Timing
  startedAt: string;
  completedAt: string;
  durationMs: number;
  
  // Status
  status: 'success' | 'error';
  error?: string;
  
  // TTL (90 days)
  ttl: number;
}

// === ORCHESTRATION STORE CONFIG ===

export interface OrchestrationStoreConfig {
  tableName: string;
  dynamoClient?: DynamoDBClient;
}

// === ORCHESTRATION STORE ===

/**
 * Orchestration Store
 * 
 * Write-only observability log.
 * Failures to log must not block orchestration.
 */
export class OrchestrationStore {
  private readonly tableName: string;
  private readonly docClient: DynamoDBDocumentClient;
  
  // 90 days in seconds
  private readonly TTL_SECONDS = 90 * 24 * 60 * 60;

  constructor(config: OrchestrationStoreConfig) {
    this.tableName = config.tableName;
    
    const client = config.dynamoClient || new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }

  /**
   * Log orchestration attempt
   * 
   * Write-only operation. Failures are logged but not thrown.
   * 
   * @param attempt - Orchestration attempt to log
   */
  async logAttempt(attempt: OrchestrationAttempt): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const ttl = now + this.TTL_SECONDS;

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            pk: `CANDIDATE#${attempt.candidateId}`,
            sk: `ATTEMPT#${attempt.startedAt}`,
            
            // Attempt data
            ...attempt,
            
            // TTL
            ttl,
          },
        })
      );
    } catch (error) {
      // Log failure but do not throw - this is observability only
      console.warn('Failed to log orchestration attempt', {
        candidateId: attempt.candidateId,
        attemptId: attempt.attemptId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get orchestration attempts for a candidate
   * 
   * FOR DEBUGGING ONLY - not used on hot path.
   * 
   * @param candidateId - Candidate ID
   * @param limit - Maximum results (default 100)
   * @returns Array of attempts
   */
  async getAttempts(candidateId: string, limit = 100): Promise<OrchestrationAttempt[]> {
    try {
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: {
            ':pk': `CANDIDATE#${candidateId}`,
          },
          Limit: limit,
          ScanIndexForward: false, // Most recent first
        })
      );

      return (result.Items || []) as OrchestrationAttempt[];
    } catch (error) {
      console.error('Failed to get orchestration attempts', {
        candidateId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
