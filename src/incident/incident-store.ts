/**
 * Phase 3.4: Incident Store
 * 
 * Manages incident persistence in DynamoDB.
 * 
 * Table: opx-incidents (already exists from Phase 1)
 * PK: INCIDENT#{incidentId}
 * SK: v1
 * 
 * GSIs:
 * - StateIndex: state (PK), openedAt (SK)
 * - ServiceIndex: service (PK), openedAt (SK)
 */

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
  UpdateItemCommand,
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { Incident, IncidentState, NormalizedSeverity } from './incident.schema';

export interface IncidentStoreConfig {
  tableName: string;
  client?: DynamoDBClient;
}

export interface IncidentFilters {
  service?: string;
  state?: IncidentState;
  severity?: NormalizedSeverity;
  minConfidence?: number;
}

export class IncidentStore {
  private readonly tableName: string;
  private readonly client: DynamoDBClient;

  constructor(config: IncidentStoreConfig) {
    this.tableName = config.tableName;
    this.client = config.client || new DynamoDBClient({});
  }

  /**
   * Put incident (idempotent)
   * 
   * Returns true if created, false if already exists.
   */
  async putIncident(incident: Incident): Promise<boolean> {
    try {
      await this.client.send(
        new PutItemCommand({
          TableName: this.tableName,
          Item: marshall({
            pk: `INCIDENT#${incident.incidentId}`,
            sk: 'v1',
            state: incident.state,
            openedAt: incident.openedAt,
            service: incident.service,
            ...incident,
          }),
          ConditionExpression: 'attribute_not_exists(pk)',
        })
      );

      return true; // Created
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        return false; // Already exists (idempotent)
      }
      throw error;
    }
  }

  /**
   * Get incident by ID
   */
  async getIncident(incidentId: string): Promise<Incident | null> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          pk: `INCIDENT#${incidentId}`,
          sk: 'v1',
        }),
      })
    );

    if (!result.Item) {
      return null;
    }

    const item = unmarshall(result.Item);
    // Remove DynamoDB keys (keep only incident fields)
    const { pk, sk, ...incident } = item;
    return incident as Incident;
  }

  /**
   * Update incident (unconditional write)
   * 
   * Used for state transitions.
   */
  async updateIncident(incident: Incident): Promise<void> {
    await this.client.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall({
          pk: `INCIDENT#${incident.incidentId}`,
          sk: 'v1',
          state: incident.state,
          openedAt: incident.openedAt,
          service: incident.service,
          ...incident,
        }),
      })
    );
  }

  /**
   * List incidents with filters
   */
  async listIncidents(filters?: IncidentFilters): Promise<Incident[]> {
    // If state filter provided, use StateIndex
    if (filters?.state) {
      return this.listIncidentsByState(filters.state);
    }

    // If service filter provided, use ServiceIndex
    if (filters?.service) {
      return this.listIncidentsByService(filters.service);
    }

    // Otherwise, return active incidents
    return this.listActiveIncidents();
  }

  /**
   * List incidents by state
   */
  private async listIncidentsByState(state: IncidentState): Promise<Incident[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'StateIndex',
        KeyConditionExpression: '#state = :state',
        ExpressionAttributeNames: {
          '#state': 'state',
        },
        ExpressionAttributeValues: marshall({
          ':state': state,
        }),
        ScanIndexForward: false, // Most recent first
      })
    );

    if (!result.Items) {
      return [];
    }

    return result.Items.map((item) => {
      const unmarshalled = unmarshall(item);
      const { pk, sk, ...incident } = unmarshalled;
      return incident as Incident;
    });
  }

  /**
   * List incidents by service
   */
  private async listIncidentsByService(service: string): Promise<Incident[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'ServiceIndex',
        KeyConditionExpression: 'service = :service',
        ExpressionAttributeValues: marshall({
          ':service': service,
        }),
        ScanIndexForward: false, // Most recent first
      })
    );

    if (!result.Items) {
      return [];
    }

    return result.Items.map((item) => {
      const unmarshalled = unmarshall(item);
      const { pk, sk, ...incident } = unmarshalled;
      return incident as Incident;
    });
  }

  /**
   * List active incidents (OPEN, ACKNOWLEDGED, MITIGATING)
   */
  async listActiveIncidents(service?: string): Promise<Incident[]> {
    const activeStates: IncidentState[] = ['OPEN', 'ACKNOWLEDGED', 'MITIGATING'];
    const incidents: Incident[] = [];

    for (const state of activeStates) {
      const stateIncidents = await this.listIncidentsByState(state);
      
      // Filter by service if provided
      if (service) {
        incidents.push(...stateIncidents.filter((i) => i.service === service));
      } else {
        incidents.push(...stateIncidents);
      }
    }

    // Sort by openedAt descending
    incidents.sort((a, b) => b.openedAt.localeCompare(a.openedAt));

    return incidents;
  }
}
