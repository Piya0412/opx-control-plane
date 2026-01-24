/**
 * CP-7: Incident Event Store
 * 
 * Append-only event log storage.
 * 
 * 🔒 INV-7.5: Append-only event log (no updates/deletes)
 */

import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { IncidentEvent, IncidentEventType } from './incident-event.schema';

export interface IncidentEventStoreConfig {
  tableName: string;
  client?: DynamoDBClient;
}

export interface StoreResult {
  event: IncidentEvent;
  stored: boolean;
}

export class IncidentEventStore {
  private readonly tableName: string;
  private readonly client: DynamoDBClient;

  constructor(config: IncidentEventStoreConfig) {
    this.tableName = config.tableName;
    this.client = config.client || new DynamoDBClient({});
  }

  /**
   * Store event (append-only)
   * 
   * 🔒 INV-7.5: Append-only event log
   */
  async storeEvent(event: IncidentEvent): Promise<StoreResult> {
    await this.client.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall({
          PK: `INCIDENT#${event.incidentId}`,
          SK: `EVENT#${event.createdAt}#${event.eventId}`,
          GSI1PK: `EVENT_TYPE#${event.eventType}`,
          GSI1SK: event.createdAt,
          ...event,
        }),
      })
    );

    return { event, stored: true };
  }

  /**
   * Get events for incident
   */
  async getEventsForIncident(
    incidentId: string,
    limit: number = 100
  ): Promise<IncidentEvent[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: marshall({
          ':pk': `INCIDENT#${incidentId}`,
          ':sk': 'EVENT#',
        }),
        Limit: limit,
        ScanIndexForward: false, // Most recent first
      })
    );

    if (!result.Items) {
      return [];
    }

    return result.Items.map((item) => {
      const unmarshalled = unmarshall(item);
      const { PK, SK, GSI1PK, GSI1SK, ...event } = unmarshalled;
      return event as IncidentEvent;
    });
  }

  /**
   * Get events by type
   */
  async getEventsByType(
    incidentId: string,
    eventType: IncidentEventType
  ): Promise<IncidentEvent[]> {
    const allEvents = await this.getEventsForIncident(incidentId);
    return allEvents.filter((event) => event.eventType === eventType);
  }

  /**
   * Get latest event
   */
  async getLatestEvent(incidentId: string): Promise<IncidentEvent | null> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: marshall({
          ':pk': `INCIDENT#${incidentId}`,
          ':sk': 'EVENT#',
        }),
        Limit: 1,
        ScanIndexForward: false, // Most recent first
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    const item = unmarshall(result.Items[0]);
    const { PK, SK, GSI1PK, GSI1SK, ...event } = item;
    return event as IncidentEvent;
  }
}
