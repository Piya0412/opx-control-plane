/**
 * Phase 5 - Step 1: Automation Audit Store Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDocMock as dynamoMock, getMockCredentials, getMockRegion } from '../setup/aws-mock.js';
import { AutomationAuditStore } from '../../src/automation/automation-audit-store';
import { computeAuditId } from '../../src/automation/audit-id';
import type { AutomationAudit } from '../../src/automation/automation-audit.schema';

describe('AutomationAuditStore', () => {
  let store: AutomationAuditStore;
  const tableName = 'test-automation-audit';

  beforeEach(() => {
    // Note: dynamoMock.reset() is called globally in setup/aws-mock.ts
    store = new AutomationAuditStore(
      new DynamoDBClient({
        region: getMockRegion(),
        credentials: getMockCredentials(),
      }),
      tableName
    );
  });

  // Helper to create test audit
  function createTestAudit(overrides: Partial<AutomationAudit> = {}): AutomationAudit {
    const startTime = overrides.startTime || '2026-01-22T02:00:00.000Z';
    const operationType = overrides.operationType || 'PATTERN_EXTRACTION';
    const version = overrides.version || '1.0.0';
    
    return {
      auditId: computeAuditId(operationType, startTime, version),
      operationType,
      triggerType: 'SCHEDULED',
      startTime,
      status: 'RUNNING',
      parameters: {
        service: 'order-service',
        timeWindow: '24h',
      },
      triggeredBy: {
        type: 'SYSTEM',
        principal: 'arn:aws:iam::123456789012:role/opx-automation',
      },
      version,
      ...overrides,
    };
  }
  describe('recordAudit', () => {
    it('should record new audit', async () => {
      dynamoMock.on(PutCommand).resolves({});
      
      const audit = createTestAudit();
      const created = await store.recordAudit(audit);
      
      expect(created).toBe(true);
      expect(dynamoMock.calls()).toHaveLength(1);
    });

    it('should be idempotent on duplicate', async () => {
      const error: any = new Error('ConditionalCheckFailedException');
      error.name = 'ConditionalCheckFailedException';
      dynamoMock.on(PutCommand).rejects(error);
      
      const audit = createTestAudit();
      const created = await store.recordAudit(audit);
      
      expect(created).toBe(false);
    });

    it('should throw on DynamoDB error', async () => {
      const error = new Error('DynamoDB error');
      dynamoMock.on(PutCommand).rejects(error);
      
      const audit = createTestAudit();
      
      await expect(store.recordAudit(audit)).rejects.toThrow('DynamoDB error');
    });
  });

  describe('getAudit', () => {
    it('should return null for non-existent audit', async () => {
      dynamoMock.on(GetCommand).resolves({});
      
      const audit = await store.getAudit('nonexistent');
      expect(audit).toBeNull();
    });

    it('should retrieve existing audit', async () => {
      const audit = createTestAudit();
      
      dynamoMock.on(GetCommand).resolves({
        Item: {
          PK: `AUDIT#${audit.auditId}`,
          SK: 'METADATA',
          ...audit,
        },
      });
      
      const retrieved = await store.getAudit(audit.auditId);
      expect(retrieved).toEqual(audit);
    });
  });

  describe('listAuditsByType', () => {
    it('should list audits by operation type', async () => {
      const audit1 = createTestAudit({
        operationType: 'PATTERN_EXTRACTION',
        startTime: '2026-01-22T02:00:00.000Z',
      });
      const audit2 = createTestAudit({
        operationType: 'PATTERN_EXTRACTION',
        startTime: '2026-01-22T03:00:00.000Z',
      });
      
      dynamoMock.on(QueryCommand).resolves({
        Items: [
          { PK: `AUDIT#${audit1.auditId}`, SK: 'METADATA', ...audit1 },
          { PK: `AUDIT#${audit2.auditId}`, SK: 'METADATA', ...audit2 },
        ],
      });
      
      const audits = await store.listAuditsByType('PATTERN_EXTRACTION');
      
      expect(audits).toHaveLength(2);
      audits.forEach(audit => {
        expect(audit.operationType).toBe('PATTERN_EXTRACTION');
      });
    });

    it('should respect limit option', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });
      
      const audits = await store.listAuditsByType('PATTERN_EXTRACTION', { limit: 5 });
      expect(audits.length).toBeLessThanOrEqual(5);
    });

    it('should return empty array for type with no audits', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });
      
      const audits = await store.listAuditsByType('SNAPSHOT');
      expect(Array.isArray(audits)).toBe(true);
      expect(audits).toEqual([]);
    });
  });

  describe('listAuditsByStatus', () => {
    it('should list audits by status', async () => {
      const audit1 = createTestAudit({
        status: 'RUNNING',
        startTime: '2026-01-22T05:00:00.000Z',
      });
      
      dynamoMock.on(QueryCommand).resolves({
        Items: [
          { PK: `AUDIT#${audit1.auditId}`, SK: 'METADATA', ...audit1 },
        ],
      });
      
      const runningAudits = await store.listAuditsByStatus('RUNNING');
      
      expect(runningAudits.length).toBeGreaterThanOrEqual(1);
      runningAudits.forEach(audit => {
        expect(audit.status).toBe('RUNNING');
      });
    });

    it('should respect limit option', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });
      
      const audits = await store.listAuditsByStatus('RUNNING', { limit: 3 });
      expect(audits.length).toBeLessThanOrEqual(3);
    });
  });

  describe('updateAuditStatus', () => {
    it('should update status to SUCCESS', async () => {
      dynamoMock.on(UpdateCommand).resolves({});
      
      const audit = createTestAudit({ status: 'RUNNING' });
      const endTime = '2026-01-22T02:01:30.000Z';
      const results = {
        summaryId: 'b'.repeat(64),
        totalIncidents: 42,
        patternsFound: 5,
        recordsProcessed: 100,
        durationMs: 90000,
      };
      
      await store.updateAuditStatus(
        audit.auditId,
        'SUCCESS',
        endTime,
        results
      );
      
      expect(dynamoMock.calls()).toHaveLength(1);
    });

    it('should update status to FAILED with error', async () => {
      dynamoMock.on(UpdateCommand).resolves({});
      
      const audit = createTestAudit({ status: 'RUNNING' });
      const endTime = '2026-01-22T02:00:15.000Z';
      const errorMessage = 'Database connection timeout';
      const errorStack = 'Error: Database connection timeout\n  at ...';
      
      await store.updateAuditStatus(
        audit.auditId,
        'FAILED',
        endTime,
        undefined,
        errorMessage,
        errorStack
      );
      
      expect(dynamoMock.calls()).toHaveLength(1);
    });

    it('should update with partial results', async () => {
      dynamoMock.on(UpdateCommand).resolves({});
      
      const audit = createTestAudit({ status: 'RUNNING' });
      const endTime = '2026-01-22T02:01:00.000Z';
      const results = {
        recordsProcessed: 50,
        durationMs: 45000,
      };
      
      await store.updateAuditStatus(
        audit.auditId,
        'SUCCESS',
        endTime,
        results
      );
      
      expect(dynamoMock.calls()).toHaveLength(1);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete audit lifecycle', async () => {
      const audit = createTestAudit({
        status: 'RUNNING',
        startTime: '2026-01-22T02:00:00.000Z',
      });
      
      // Step 1: Record audit
      dynamoMock.on(PutCommand).resolves({});
      const created = await store.recordAudit(audit);
      expect(created).toBe(true);
      
      // Step 2: List RUNNING audits
      dynamoMock.reset();
      dynamoMock.on(QueryCommand).resolves({
        Items: [{ PK: `AUDIT#${audit.auditId}`, SK: 'METADATA', ...audit }],
      });
      const runningAudits = await store.listAuditsByStatus('RUNNING');
      const found = runningAudits.find(a => a.auditId === audit.auditId);
      expect(found).toBeDefined();
      
      // Step 3: Update to SUCCESS
      dynamoMock.reset();
      dynamoMock.on(UpdateCommand).resolves({});
      const endTime = '2026-01-22T02:05:00.000Z';
      await store.updateAuditStatus(
        audit.auditId,
        'SUCCESS',
        endTime,
        { recordsProcessed: 100, durationMs: 5000 }
      );
      
      // Step 4: List SUCCESS audits
      dynamoMock.reset();
      const successAudit = { ...audit, status: 'SUCCESS' as const, endTime };
      dynamoMock.on(QueryCommand).resolves({
        Items: [{ PK: `AUDIT#${successAudit.auditId}`, SK: 'METADATA', ...successAudit }],
      });
      const successAudits = await store.listAuditsByStatus('SUCCESS');
      const foundSuccess = successAudits.find(a => a.auditId === audit.auditId);
      expect(foundSuccess).toBeDefined();
    });

    it('should handle multiple concurrent audits', async () => {
      const audits = [
        createTestAudit({ operationType: 'PATTERN_EXTRACTION', startTime: '2026-01-22T07:00:00.000Z' }),
        createTestAudit({ operationType: 'CALIBRATION', startTime: '2026-01-22T08:00:00.000Z' }),
        createTestAudit({ operationType: 'SNAPSHOT', startTime: '2026-01-22T09:00:00.000Z' }),
      ];
      
      // Record all audits
      dynamoMock.on(PutCommand).resolves({});
      await Promise.all(audits.map(audit => store.recordAudit(audit)));
      
      // Reset and setup mocks for getAudit calls
      dynamoMock.reset();
      dynamoMock.on(GetCommand).callsFake((input: any) => {
        const auditId = input.Key.PK.replace('AUDIT#', '');
        const audit = audits.find(a => a.auditId === auditId);
        if (audit) {
          return { Item: { PK: `AUDIT#${audit.auditId}`, SK: 'METADATA', ...audit } };
        }
        return {};
      });
      
      const retrieved = await Promise.all(
        audits.map(audit => store.getAudit(audit.auditId))
      );
      
      retrieved.forEach((audit, index) => {
        expect(audit).toEqual(audits[index]);
      });
    });
  });
});
