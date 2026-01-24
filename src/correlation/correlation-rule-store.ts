/**
 * Correlation Rule Store
 * 
 * Phase 2.2: Signal Correlation
 * 
 * DESIGN LOCK v1.0.0 — FROZEN
 * 
 * DECISION LOCK 3: Rule Versioning & Migration
 * 
 * MANDATORY CONSTRAINTS:
 * - Rules are immutable (updates create new versions)
 * - Disable rule: enabled=false
 * - Replay uses historical versions
 * - No implicit migration
 * 
 * FORBIDDEN:
 * - Editing rules in place
 * - Auto-migrating correlation state
 * - Reinterpreting old signals with new rules
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { CorrelationRule } from './correlation-rule.schema.js';
import { validateCorrelationRule } from './correlation-rule.schema.js';

export class CorrelationRuleStore {
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
   * Create correlation rule
   * 
   * MANDATORY: Rules are immutable
   * 
   * @param rule - Correlation rule to create
   * @throws Error if rule already exists
   */
  async createRule(rule: CorrelationRule): Promise<void> {
    // Validate rule schema
    const validatedRule = validateCorrelationRule(rule);

    // Check if rule version already exists
    const existing = await this.getRule(validatedRule.ruleId, validatedRule.ruleVersion);
    if (existing) {
      throw new Error(
        `Rule ${validatedRule.ruleId} version ${validatedRule.ruleVersion} already exists`
      );
    }

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: `RULE#${validatedRule.ruleId}`,
          sk: `VERSION#${validatedRule.ruleVersion}`,
          ...validatedRule,
          // Convert boolean to string for GSI (DynamoDB doesn't support BOOLEAN keys)
          enabled: validatedRule.enabled ? 'true' : 'false',
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      })
    );
  }

  /**
   * Get correlation rule by ID and version
   * 
   * @param ruleId - Rule ID
   * @param ruleVersion - Rule version
   * @returns Rule or null if not found
   */
  async getRule(ruleId: string, ruleVersion: string): Promise<CorrelationRule | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          pk: `RULE#${ruleId}`,
          sk: `VERSION#${ruleVersion}`,
        },
      })
    );

    if (!result.Item) {
      return null;
    }

    // Remove DynamoDB keys and convert enabled string to boolean
    const { pk, sk, enabled, ...rule } = result.Item;
    return {
      ...rule,
      enabled: enabled === 'true', // Convert string back to boolean
    } as CorrelationRule;
  }

  /**
   * Get latest version of a rule
   * 
   * @param ruleId - Rule ID
   * @returns Latest rule version or null if not found
   */
  async getLatestRuleVersion(ruleId: string): Promise<CorrelationRule | null> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': `RULE#${ruleId}`,
        },
        ScanIndexForward: false, // Descending order (latest first)
        Limit: 1,
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    const { pk, sk, enabled, ...rule } = result.Items[0];
    return {
      ...rule,
      enabled: enabled === 'true', // Convert string back to boolean
    } as CorrelationRule;
  }

  /**
   * List all versions of a rule
   * 
   * @param ruleId - Rule ID
   * @returns Array of rule versions (newest first)
   */
  async listRuleVersions(ruleId: string): Promise<CorrelationRule[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': `RULE#${ruleId}`,
        },
        ScanIndexForward: false, // Descending order (newest first)
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map(item => {
      const { pk, sk, enabled, ...rule } = item;
      return {
        ...rule,
        enabled: enabled === 'true', // Convert string back to boolean
      } as CorrelationRule;
    });
  }

  /**
   * List all enabled rules (latest versions only)
   * 
   * DECISION LOCK 3: Correlation engine MUST load all enabled rules
   * 
   * @returns Array of enabled rules
   */
  async listEnabledRules(): Promise<CorrelationRule[]> {
    // Query GSI for enabled rules
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'EnabledRulesIndex',
        KeyConditionExpression: 'enabled = :enabled',
        ExpressionAttributeValues: {
          ':enabled': 'true', // String value for GSI
        },
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    // Group by ruleId and take latest version
    const rulesByIdMap = new Map<string, CorrelationRule>();
    
    for (const item of result.Items) {
      const { pk, sk, enabled, ...rule } = item;
      const typedRule = {
        ...rule,
        enabled: enabled === 'true', // Convert string back to boolean
      } as CorrelationRule;
      
      const existing = rulesByIdMap.get(typedRule.ruleId);
      if (!existing || this.compareVersions(typedRule.ruleVersion, existing.ruleVersion) > 0) {
        rulesByIdMap.set(typedRule.ruleId, typedRule);
      }
    }

    return Array.from(rulesByIdMap.values());
  }

  /**
   * Enable rule
   * 
   * DECISION LOCK 3: Disable rule: enabled=false
   * 
   * @param ruleId - Rule ID
   * @param ruleVersion - Rule version
   */
  async enableRule(ruleId: string, ruleVersion: string): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          pk: `RULE#${ruleId}`,
          sk: `VERSION#${ruleVersion}`,
        },
        UpdateExpression: 'SET enabled = :enabled',
        ExpressionAttributeValues: {
          ':enabled': true,
        },
        ConditionExpression: 'attribute_exists(pk)',
      })
    );
  }

  /**
   * Disable rule
   * 
   * DECISION LOCK 3: Disable rule: enabled=false
   * 
   * @param ruleId - Rule ID
   * @param ruleVersion - Rule version
   */
  async disableRule(ruleId: string, ruleVersion: string): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          pk: `RULE#${ruleId}`,
          sk: `VERSION#${ruleVersion}`,
        },
        UpdateExpression: 'SET enabled = :enabled',
        ExpressionAttributeValues: {
          ':enabled': false,
        },
        ConditionExpression: 'attribute_exists(pk)',
      })
    );
  }

  /**
   * Compare semantic versions
   * 
   * @param v1 - Version 1 (e.g., "1.2.3")
   * @param v2 - Version 2 (e.g., "1.2.4")
   * @returns -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if (parts1[i] > parts2[i]) return 1;
      if (parts1[i] < parts2[i]) return -1;
    }

    return 0;
  }
}

