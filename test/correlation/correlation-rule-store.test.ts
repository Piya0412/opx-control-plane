/**
 * Correlation Rule Store Tests
 * 
 * Phase 2.2: Signal Correlation
 * 
 * DESIGN LOCK v1.0.0 — FROZEN
 * 
 * DECISION LOCK 3: Rule Versioning & Migration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { CorrelationRuleStore } from '../../src/correlation/correlation-rule-store.js';
import type { CorrelationRule } from '../../src/correlation/correlation-rule.schema.js';

const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('CorrelationRuleStore', () => {
  let store: CorrelationRuleStore;

  const mockRule: CorrelationRule = {
    ruleId: 'rule-lambda-high-error',
    ruleName: 'Lambda High Error Rate',
    ruleVersion: '1.0.0',
    filters: {
      source: ['CLOUDWATCH_ALARM'],
      signalType: ['ALARM_STATE_CHANGE'],
      service: ['lambda'],
      severity: ['SEV2'],
    },
    timeWindow: {
      duration: 'PT5M',
      alignment: 'fixed',
    },
    groupBy: {
      service: true,
      severity: true,
      identityWindow: false,
    },
    threshold: {
      minSignals: 2,
      maxSignals: 10,
    },
    candidateTemplate: {
      title: 'Lambda service experiencing high error rate',
      description: '{{signalCount}} alarms detected',
      tags: ['auto-correlated'],
    },
    createdAt: '2026-01-17T00:00:00Z',
    createdBy: 'system',
    enabled: true,
  };

  beforeEach(() => {
    dynamoMock.reset();
    store = new CorrelationRuleStore(new DynamoDBClient({}), 'opx-correlation-rules');
  });

  describe('createRule', () => {
    it('should create new rule', async () => {
      dynamoMock.on(GetCommand).resolves({}); // No existing rule
      dynamoMock.on(PutCommand).resolves({});

      await store.createRule(mockRule);

      expect(dynamoMock.calls()).toHaveLength(2); // GetCommand + PutCommand
      const putCall = dynamoMock.commandCalls(PutCommand)[0];
      expect(putCall.args[0].input.Item).toMatchObject({
        pk: 'RULE#rule-lambda-high-error',
        sk: 'VERSION#1.0.0',
        ruleId: 'rule-lambda-high-error',
        ruleVersion: '1.0.0',
      });
    });

    it('should reject duplicate rule version', async () => {
      dynamoMock.on(GetCommand).resolves({ Item: mockRule }); // Existing rule

      await expect(store.createRule(mockRule)).rejects.toThrow(
        'Rule rule-lambda-high-error version 1.0.0 already exists'
      );
    });

    it('should validate rule schema', async () => {
      const invalidRule = { ...mockRule, ruleId: 'InvalidId' };

      await expect(store.createRule(invalidRule as any)).rejects.toThrow();
    });
  });

  describe('getRule', () => {
    it('should retrieve rule by ID and version', async () => {
      dynamoMock.on(GetCommand).resolves({
        Item: {
          pk: 'RULE#rule-lambda-high-error',
          sk: 'VERSION#1.0.0',
          ...mockRule,
          enabled: 'true', // Store as string like the real implementation
        },
      });

      const result = await store.getRule('rule-lambda-high-error', '1.0.0');

      expect(result).toEqual(mockRule);
      expect(dynamoMock.calls()).toHaveLength(1);
    });

    it('should return null for missing rule', async () => {
      dynamoMock.on(GetCommand).resolves({});

      const result = await store.getRule('nonexistent', '1.0.0');

      expect(result).toBeNull();
    });
  });

  describe('getLatestRuleVersion', () => {
    it('should retrieve latest version', async () => {
      const rule1_0_0 = { ...mockRule, ruleVersion: '1.0.0' };
      const rule1_1_0 = { ...mockRule, ruleVersion: '1.1.0' };

      dynamoMock.on(QueryCommand).resolves({
        Items: [
          { pk: 'RULE#rule-lambda-high-error', sk: 'VERSION#1.1.0', ...rule1_1_0 },
        ],
      });

      const result = await store.getLatestRuleVersion('rule-lambda-high-error');

      expect(result?.ruleVersion).toBe('1.1.0');
    });

    it('should return null for missing rule', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const result = await store.getLatestRuleVersion('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('listRuleVersions', () => {
    it('should list all versions in descending order', async () => {
      const rule1_0_0 = { ...mockRule, ruleVersion: '1.0.0' };
      const rule1_1_0 = { ...mockRule, ruleVersion: '1.1.0' };
      const rule2_0_0 = { ...mockRule, ruleVersion: '2.0.0' };

      dynamoMock.on(QueryCommand).resolves({
        Items: [
          { pk: 'RULE#rule-lambda-high-error', sk: 'VERSION#2.0.0', ...rule2_0_0 },
          { pk: 'RULE#rule-lambda-high-error', sk: 'VERSION#1.1.0', ...rule1_1_0 },
          { pk: 'RULE#rule-lambda-high-error', sk: 'VERSION#1.0.0', ...rule1_0_0 },
        ],
      });

      const results = await store.listRuleVersions('rule-lambda-high-error');

      expect(results).toHaveLength(3);
      expect(results[0].ruleVersion).toBe('2.0.0');
      expect(results[1].ruleVersion).toBe('1.1.0');
      expect(results[2].ruleVersion).toBe('1.0.0');
    });

    it('should return empty array for missing rule', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const results = await store.listRuleVersions('nonexistent');

      expect(results).toEqual([]);
    });
  });

  describe('listEnabledRules', () => {
    it('should list all enabled rules (latest versions only)', async () => {
      const rule1 = { ...mockRule, ruleId: 'rule-1', ruleVersion: '1.0.0', enabled: true };
      const rule2 = { ...mockRule, ruleId: 'rule-2', ruleVersion: '2.0.0', enabled: true };

      dynamoMock.on(QueryCommand).resolves({
        Items: [
          { pk: 'RULE#rule-1', sk: 'VERSION#1.0.0', ...rule1 },
          { pk: 'RULE#rule-2', sk: 'VERSION#2.0.0', ...rule2 },
        ],
      });

      const results = await store.listEnabledRules();

      expect(results).toHaveLength(2);
      expect(results.map(r => r.ruleId)).toContain('rule-1');
      expect(results.map(r => r.ruleId)).toContain('rule-2');
    });

    it('should return only latest version when multiple versions exist', async () => {
      const rule1_0_0 = { ...mockRule, ruleVersion: '1.0.0', enabled: true };
      const rule1_1_0 = { ...mockRule, ruleVersion: '1.1.0', enabled: true };

      dynamoMock.on(QueryCommand).resolves({
        Items: [
          { pk: 'RULE#rule-lambda-high-error', sk: 'VERSION#1.0.0', ...rule1_0_0 },
          { pk: 'RULE#rule-lambda-high-error', sk: 'VERSION#1.1.0', ...rule1_1_0 },
        ],
      });

      const results = await store.listEnabledRules();

      expect(results).toHaveLength(1);
      expect(results[0].ruleVersion).toBe('1.1.0');
    });

    it('should return empty array when no enabled rules', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const results = await store.listEnabledRules();

      expect(results).toEqual([]);
    });
  });

  describe('enableRule', () => {
    it('should enable rule', async () => {
      dynamoMock.on(QueryCommand).resolves({});

      await store.enableRule('rule-lambda-high-error', '1.0.0');

      const updateCalls = dynamoMock.calls().filter(call => call.args[0].constructor.name === 'UpdateCommand');
      expect(updateCalls).toHaveLength(1);
    });
  });

  describe('disableRule', () => {
    it('should disable rule', async () => {
      dynamoMock.on(QueryCommand).resolves({});

      await store.disableRule('rule-lambda-high-error', '1.0.0');

      const updateCalls = dynamoMock.calls().filter(call => call.args[0].constructor.name === 'UpdateCommand');
      expect(updateCalls).toHaveLength(1);
    });
  });

  describe('DECISION LOCK 3: Rule Immutability', () => {
    it('should enforce immutability via versioning', async () => {
      // Create v1.0.0
      dynamoMock.on(GetCommand).resolvesOnce({}); // No existing
      dynamoMock.on(PutCommand).resolvesOnce({});
      await store.createRule(mockRule);

      // Try to create v1.0.0 again (should fail)
      dynamoMock.reset();
      dynamoMock.on(GetCommand).resolvesOnce({ Item: mockRule }); // Exists
      await expect(store.createRule(mockRule)).rejects.toThrow();

      // Create v1.1.0 (should succeed)
      const updatedRule = { ...mockRule, ruleVersion: '1.1.0' };
      dynamoMock.reset();
      dynamoMock.on(GetCommand).resolvesOnce({}); // No v1.1.0
      dynamoMock.on(PutCommand).resolvesOnce({});
      await store.createRule(updatedRule);

      expect(dynamoMock.commandCalls(PutCommand)).toHaveLength(1);
    });

    it('should preserve old versions when creating new versions', async () => {
      const rule1_0_0 = { ...mockRule, ruleVersion: '1.0.0' };
      const rule1_1_0 = { ...mockRule, ruleVersion: '1.1.0' };

      // Both versions should be queryable
      dynamoMock.on(QueryCommand).resolves({
        Items: [
          { pk: 'RULE#rule-lambda-high-error', sk: 'VERSION#1.1.0', ...rule1_1_0 },
          { pk: 'RULE#rule-lambda-high-error', sk: 'VERSION#1.0.0', ...rule1_0_0 },
        ],
      });

      const versions = await store.listRuleVersions('rule-lambda-high-error');

      expect(versions).toHaveLength(2);
      expect(versions.map(v => v.ruleVersion)).toContain('1.0.0');
      expect(versions.map(v => v.ruleVersion)).toContain('1.1.0');
    });
  });
});

