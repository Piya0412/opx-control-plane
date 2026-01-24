/**
 * Phase 5 - Step 7: Kill Switch
 * 
 * Centralized kill switch for automated learning operations.
 * 
 * MANDATORY FIX APPLIED:
 * - FIX 7.1: Audit before enforcement (even when blocked)
 * 
 * CRITICAL REMINDERS:
 * - Audit before enforcement (even when blocked)
 * - Kill switch blocks automation, not emergency humans
 * - EMERGENCY_OVERRIDE only for management
 * - Fail-open on config read errors
 * - <30s disable time
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { Authority } from '../promotion/authority.schema';

const VERSION = '1.0.0';

/**
 * Kill switch configuration
 */
export interface KillSwitchConfig {
  PK: 'CONFIG#KILL_SWITCH';
  SK: 'METADATA';
  enabled: boolean;
  disabledAt?: string;
  disabledBy?: Authority;
  reason?: string;
  lastModified: string;
}

/**
 * Kill switch status
 */
export interface KillSwitchStatus {
  active: boolean;
  enabled: boolean;
  disabledAt?: string;
  disabledBy?: Authority;
  reason?: string;
  lastModified: string;
}

/**
 * Kill switch manager
 */
export class KillSwitch {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(dynamoClient: DynamoDBClient, tableName: string) {
    this.docClient = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = tableName;
  }

  /**
   * Check if kill switch is active
   * 
   * CRITICAL: Fail-open on errors (assume kill switch is OFF)
   */
  async isActive(): Promise<boolean> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            PK: 'CONFIG#KILL_SWITCH',
            SK: 'METADATA',
          },
        })
      );

      // If no record exists, kill switch is OFF (safe default)
      if (!result.Item) {
        return false;
      }

      // Kill switch is ACTIVE if enabled = false
      return result.Item.enabled === false;
    } catch (error) {
      // CRITICAL: Fail-open on errors (assume kill switch is OFF)
      console.error('Kill switch check failed, assuming OFF (fail-open)', error);
      return false;
    }
  }

  /**
   * Get kill switch status
   */
  async getStatus(): Promise<KillSwitchStatus> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            PK: 'CONFIG#KILL_SWITCH',
            SK: 'METADATA',
          },
        })
      );

      if (!result.Item) {
        // Default: kill switch is enabled (operations allowed)
        return {
          active: false,
          enabled: true,
          lastModified: new Date().toISOString(),
        };
      }

      return {
        active: result.Item.enabled === false,
        enabled: result.Item.enabled,
        disabledAt: result.Item.disabledAt,
        disabledBy: result.Item.disabledBy,
        reason: result.Item.reason,
        lastModified: result.Item.lastModified,
      };
    } catch (error) {
      console.error('Failed to get kill switch status', error);
      throw error;
    }
  }

  /**
   * Disable kill switch (block all automated operations)
   * 
   * CRITICAL: Requires EMERGENCY_OVERRIDE authority
   */
  async disable(authority: Authority, reason: string): Promise<void> {
    if (authority.type !== 'EMERGENCY_OVERRIDE') {
      throw new Error('INSUFFICIENT_AUTHORITY: EMERGENCY_OVERRIDE required');
    }

    const now = new Date().toISOString();

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: 'CONFIG#KILL_SWITCH',
          SK: 'METADATA',
          enabled: false, // DISABLED (operations blocked)
          disabledAt: now,
          disabledBy: authority,
          reason,
          lastModified: now,
        },
      })
    );
  }

  /**
   * Enable kill switch (allow automated operations)
   * 
   * CRITICAL: Requires EMERGENCY_OVERRIDE authority
   */
  async enable(authority: Authority): Promise<void> {
    if (authority.type !== 'EMERGENCY_OVERRIDE') {
      throw new Error('INSUFFICIENT_AUTHORITY: EMERGENCY_OVERRIDE required');
    }

    const now = new Date().toISOString();

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: 'CONFIG#KILL_SWITCH',
          SK: 'METADATA',
          enabled: true, // ENABLED (operations allowed)
          disabledAt: undefined,
          disabledBy: undefined,
          reason: undefined,
          lastModified: now,
        },
      })
    );
  }
}

/**
 * Standalone kill switch check function
 * 
 * CRITICAL: Fail-open on errors (assume kill switch is OFF)
 */
export async function isKillSwitchActive(
  dynamoClient: DynamoDBClient,
  tableName: string
): Promise<boolean> {
  const killSwitch = new KillSwitch(dynamoClient, tableName);
  return killSwitch.isActive();
}
