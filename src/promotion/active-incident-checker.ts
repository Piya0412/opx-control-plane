/**
 * Phase 3.3: Active Incident Checker
 * 
 * Checks if an incident already exists and is active.
 * 
 * CRITICAL: Evidence-derived identity (not time-based)
 * 
 * Active states: OPEN, ACKNOWLEDGED, MITIGATING
 * Inactive states: RESOLVED, CLOSED
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

/**
 * Incident (minimal for checking)
 */
interface Incident {
  incidentId: string;
  state: string;
  service: string;
  createdAt: string;
}

/**
 * Active Incident Checker
 * 
 * Checks if an incident exists and is in an active state.
 */
export class ActiveIncidentChecker {
  constructor(
    private readonly dynamoClient: DynamoDBClient,
    private readonly incidentsTableName: string
  ) {}
  
  /**
   * Check if active incident exists
   * 
   * CRITICAL: Evidence-derived identity check
   * 
   * @param incidentId - Computed incident ID (evidence-derived)
   * @returns true if active incident exists, false otherwise
   */
  async hasActiveIncident(incidentId: string): Promise<boolean> {
    const incident = await this.getActiveIncident(incidentId);
    return incident !== null;
  }
  
  /**
   * Get active incident if exists
   * 
   * Active states: OPEN, ACKNOWLEDGED, MITIGATING
   * 
   * @param incidentId - Computed incident ID (evidence-derived)
   * @returns Incident if active, null otherwise
   */
  async getActiveIncident(incidentId: string): Promise<Incident | null> {
    try {
      // GetItem by incidentId (evidence-derived)
      const result = await this.dynamoClient.send(new GetItemCommand({
        TableName: this.incidentsTableName,
        Key: marshall({
          pk: `INCIDENT#${incidentId}`,
          sk: 'v1',
        }),
      }));
      
      if (!result.Item) {
        return null;
      }
      
      const item = unmarshall(result.Item);
      
      // Check if state is active
      const activeStates = ['OPEN', 'ACKNOWLEDGED', 'MITIGATING'];
      if (!activeStates.includes(item.state)) {
        return null; // Incident exists but not active
      }
      
      return {
        incidentId: item.incidentId,
        state: item.state,
        service: item.service,
        createdAt: item.createdAt,
      };
    } catch (error) {
      // Fail-closed: treat errors as "no active incident"
      // (Better to create duplicate than miss incident)
      console.error('Error checking active incident:', error);
      return null;
    }
  }
}
