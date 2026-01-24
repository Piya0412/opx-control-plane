/**
 * Signal Store
 * 
 * Phase 2.1: Signal Ingestion
 * 
 * INV-P2.1: Read-only w.r.t. incidents (only writes to opx-signals)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { SignalEvent } from './signal-event.schema';

export class SignalStore {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(dynamoClient: DynamoDBClient, tableName: string) {
    this.docClient = DynamoDBDocumentClient.from(dynamoClient, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
      },
    });
    this.tableName = tableName;
  }

  /**
   * Store signal in DynamoDB
   * 
   * Idempotent: Same signalId → same signal (no-op on duplicate)
   */
  async putSignal(signal: SignalEvent): Promise<void> {
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: signal,
      })
    );
  }

  /**
   * Get signal by ID
   */
  async getSignal(signalId: string): Promise<SignalEvent | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { signalId },
      })
    );

    return (result.Item as SignalEvent) || null;
  }

  /**
   * Query signals by service and time range
   * 
   * Uses ServiceObservedAtIndex GSI
   */
  async queryByService(
    service: string,
    startTime: string,
    endTime: string
  ): Promise<SignalEvent[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'ServiceObservedAtIndex',
        KeyConditionExpression: 'service = :service AND observedAt BETWEEN :start AND :end',
        ExpressionAttributeValues: {
          ':service': service,
          ':start': startTime,
          ':end': endTime,
        },
      })
    );

    return (result.Items as SignalEvent[]) || [];
  }

  /**
   * Query signals by severity and time range
   * 
   * Uses SeverityObservedAtIndex GSI
   */
  async queryBySeverity(
    severity: string,
    startTime: string,
    endTime: string
  ): Promise<SignalEvent[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'SeverityObservedAtIndex',
        KeyConditionExpression: 'severity = :severity AND observedAt BETWEEN :start AND :end',
        ExpressionAttributeValues: {
          ':severity': severity,
          ':start': startTime,
          ':end': endTime,
        },
      })
    );

    return (result.Items as SignalEvent[]) || [];
  }
}
