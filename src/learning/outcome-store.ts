/**
 * Phase 4 - Step 1: Outcome Store
 * 
 * Append-only storage for incident outcomes.
 * 
 * RULES:
 * - Append-only (no update methods)
 * - No delete methods (GDPR handled separately)
 * - Idempotent writes
 * - Schema validation enforced
 */

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { IncidentOutcome, OutcomeFilters } from './outcome.schema';
import { IncidentOutcomeSchema } from './outcome.schema';

export interface OutcomeStoreConfig {
  tableName: string;
  client?: DynamoDBClient;
}

/**
 * Outcome Store
 * 
 * Manages append-only persistence of incident outcomes.
 * 
 * CRITICAL: No update or delete methods (append-only only)
 */
export class OutcomeStore {
  private readonly tableName: string;
  private readonly client: DynamoDBClient;

  constructor(config: OutcomeStoreConfig) {
    this.tableName = config.tableName;
    this.client = config.client || new DynamoDBClient({});
  }

  /**
   * Record outcome (append-only, idempotent)
   * 
   * Returns:
   * - true if new outcome created
   * - false if outcome already exists (idempotent)
   * 
   * Throws:
   * - ValidationError if schema invalid
   * - DynamoDBError if write fails
   */
  async recordOutcome(outcome: IncidentOutcome): Promise<boolean> {
    // Validate schema (fail-closed)
    IncidentOutcomeSchema.parse(outcome);

    // Build DynamoDB item
    const item = {
      pk: `OUTCOME#${outcome.outcomeId}`,
      sk: 'v1',
      // GSI keys
      incidentId: outcome.incidentId,
      service: outcome.service,
      recordedAt: outcome.recordedAt,
      // All outcome fields
      ...outcome,
    };

    try {
      // Conditional write: only if not exists (append-only)
      await this.client.send(
        new PutItemCommand({
          TableName: this.tableName,
          Item: marshall(item, { removeUndefinedValues: true }),
          ConditionExpression: 'attribute_not_exists(pk)',
        })
      );

      return true; // Created
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        return false; // Already exists (idempotent)
      }

      throw error; // Other error
    }
  }

  /**
   * Get outcome by ID
   * 
   * Returns:
   * - IncidentOutcome if found
   * - null if not found
   */
  async getOutcome(outcomeId: string): Promise<IncidentOutcome | null> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          pk: `OUTCOME#${outcomeId}`,
          sk: 'v1',
        }),
      })
    );

    if (!result.Item) {
      return null;
    }

    const item = unmarshall(result.Item);

    // Remove DynamoDB keys
    const { pk, sk, ...outcome } = item;

    // Validate and return
    return IncidentOutcomeSchema.parse(outcome);
  }

  /**
   * Get outcome by incident ID
   * 
   * Uses IncidentIndex GSI.
   * 
   * Returns:
   * - IncidentOutcome if found
   * - null if not found
   */
  async getOutcomeByIncident(incidentId: string): Promise<IncidentOutcome | null> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'IncidentIndex',
        KeyConditionExpression: 'incidentId = :incidentId',
        ExpressionAttributeValues: marshall({
          ':incidentId': incidentId,
        }),
        Limit: 1, // Should only be one outcome per incident
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    const item = unmarshall(result.Items[0]);

    // Remove DynamoDB keys
    const { pk, sk, ...outcome } = item;

    // Validate and return
    return IncidentOutcomeSchema.parse(outcome);
  }

  /**
   * List distinct services with outcomes in time window
   * 
   * Uses bounded scan with time window filter.
   * Required for Phase 5 pattern extraction automation.
   * 
   * @param options - Time window for filtering
   * @returns Array of unique service names
   */
  async listDistinctServices(options: {
    startDate: string;
    endDate: string;
  }): Promise<string[]> {
    const services = new Set<string>();
    let lastEvaluatedKey: any = undefined;
    
    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          FilterExpression: 'recordedAt BETWEEN :start AND :end',
          ExpressionAttributeValues: marshall({
            ':start': options.startDate,
            ':end': options.endDate,
          }),
          ProjectionExpression: 'service',
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );
      
      result.Items?.forEach(item => {
        const unmarshalled = unmarshall(item);
        if (unmarshalled.service) {
          services.add(unmarshalled.service);
        }
      });
      
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    
    return Array.from(services).sort();
  }

  /**
   * List outcomes with filters
   * 
   * Filters:
   * - service: Filter by service
   * - startDate: Filter by recordedAt >= startDate
   * - endDate: Filter by recordedAt <= endDate
   * - truePositive: Filter by classification.truePositive
   * - falsePositive: Filter by classification.falsePositive
   * 
   * Returns:
   * - Array of IncidentOutcome (may be empty)
   */
  async listOutcomes(filters?: OutcomeFilters): Promise<IncidentOutcome[]> {
    // If service filter provided, use ServiceIndex
    if (filters?.service) {
      return this.listOutcomesByService(
        filters.service,
        filters.startDate,
        filters.endDate,
        filters
      );
    }

    // If date range provided, use TimeIndex
    if (filters?.startDate || filters?.endDate) {
      return this.listOutcomesByTimeRange(
        filters.startDate,
        filters.endDate,
        filters
      );
    }

    // Otherwise, scan (not recommended for production)
    return this.scanOutcomes(filters);
  }

  /**
   * List outcomes by service
   * 
   * Uses ServiceIndex GSI.
   */
  private async listOutcomesByService(
    service: string,
    startDate?: string,
    endDate?: string,
    filters?: OutcomeFilters
  ): Promise<IncidentOutcome[]> {
    let keyConditionExpression = 'service = :service';
    const expressionAttributeValues: any = {
      ':service': service,
    };

    // Add date range to key condition if provided
    if (startDate && endDate) {
      keyConditionExpression += ' AND recordedAt BETWEEN :startDate AND :endDate';
      expressionAttributeValues[':startDate'] = startDate;
      expressionAttributeValues[':endDate'] = endDate;
    } else if (startDate) {
      keyConditionExpression += ' AND recordedAt >= :startDate';
      expressionAttributeValues[':startDate'] = startDate;
    } else if (endDate) {
      keyConditionExpression += ' AND recordedAt <= :endDate';
      expressionAttributeValues[':endDate'] = endDate;
    }

    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'ServiceIndex',
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: marshall(expressionAttributeValues),
        ScanIndexForward: false, // Most recent first
      })
    );

    if (!result.Items) {
      return [];
    }

    return this.parseAndFilterOutcomes(result.Items, filters);
  }

  /**
   * List outcomes by time range
   * 
   * Uses TimeIndex GSI.
   */
  private async listOutcomesByTimeRange(
    startDate?: string,
    endDate?: string,
    filters?: OutcomeFilters
  ): Promise<IncidentOutcome[]> {
    // Extract date from timestamp (e.g., "2026-01-22" from "2026-01-22T10:00:00.000Z")
    const dateKey = startDate ? startDate.split('T')[0] : new Date().toISOString().split('T')[0];

    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'TimeIndex',
        KeyConditionExpression: 'recordedAt = :dateKey',
        ExpressionAttributeValues: marshall({
          ':dateKey': dateKey,
        }),
        ScanIndexForward: false, // Most recent first
      })
    );

    if (!result.Items) {
      return [];
    }

    return this.parseAndFilterOutcomes(result.Items, filters);
  }

  /**
   * Scan outcomes (fallback, not recommended for production)
   */
  private async scanOutcomes(filters?: OutcomeFilters): Promise<IncidentOutcome[]> {
    // Note: Scan is expensive, should use indexes in production
    console.warn('OutcomeStore: Using scan operation (not recommended for production)');

    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
      })
    );

    if (!result.Items) {
      return [];
    }

    return this.parseAndFilterOutcomes(result.Items, filters);
  }

  /**
   * Parse and filter outcomes
   */
  private parseAndFilterOutcomes(
    items: any[],
    filters?: OutcomeFilters
  ): IncidentOutcome[] {
    const outcomes: IncidentOutcome[] = [];

    for (const item of items) {
      const unmarshalled = unmarshall(item);

      // Remove DynamoDB keys
      const { pk, sk, ...outcome } = unmarshalled;

      try {
        // Validate schema
        const validated = IncidentOutcomeSchema.parse(outcome);

        // Apply filters
        if (filters?.truePositive !== undefined) {
          if (validated.classification.truePositive !== filters.truePositive) {
            continue;
          }
        }

        if (filters?.falsePositive !== undefined) {
          if (validated.classification.falsePositive !== filters.falsePositive) {
            continue;
          }
        }

        outcomes.push(validated);
      } catch (error) {
        // Skip invalid outcomes (should not happen)
        console.error('OutcomeStore: Invalid outcome in database', error);
      }
    }

    return outcomes;
  }
}
