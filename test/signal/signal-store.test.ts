/**
 * Signal Store Tests
 * 
 * Phase 2.1: Signal Ingestion
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDocMock as dynamoMock, getMockCredentials, getMockRegion } from '../setup/aws-mock.js';
import { SignalStore } from '../../src/signal/signal-store.js';
import type { SignalEvent } from '../../src/signal/signal-event.schema.js';

describe('SignalStore', () => {
  let store: SignalStore;

  const mockSignal: SignalEvent = {
    signalId: 'a'.repeat(64),
    source: 'CLOUDWATCH_ALARM',
    signalType: 'ALARM_STATE_CHANGE',
    service: 'lambda',
    severity: 'SEV2',
    observedAt: '2026-01-17T10:23:45.123Z',
    identityWindow: '2026-01-17T10:23Z',
    metadata: { alarmName: 'HighErrorRate' },
    ingestedAt: '2026-01-17T10:23:47.000Z',
  };

  beforeEach(() => {
    dynamoMock.reset();
    store = new SignalStore(
      new DynamoDBClient({
        region: getMockRegion(),
        credentials: getMockCredentials(),
      }),
      'opx-signals'
    );
  });

  describe('putSignal', () => {
    it('should store signal', async () => {
      dynamoMock.on(PutCommand).resolves({});

      await store.putSignal(mockSignal);

      expect(dynamoMock.calls()).toHaveLength(1);
      const call = dynamoMock.call(0);
      expect(call.args[0].input).toMatchObject({
        TableName: 'opx-signals',
        Item: mockSignal,
      });
    });

    it('should handle duplicate signals idempotently', async () => {
      dynamoMock.on(PutCommand).resolves({});

      await store.putSignal(mockSignal);
      await store.putSignal(mockSignal); // Duplicate

      expect(dynamoMock.calls()).toHaveLength(2);
    });
  });

  describe('getSignal', () => {
    it('should retrieve signal by ID', async () => {
      dynamoMock.on(GetCommand).resolves({
        Item: mockSignal,
      });

      const result = await store.getSignal(mockSignal.signalId);

      expect(result).toEqual(mockSignal);
      expect(dynamoMock.calls()).toHaveLength(1);
      const call = dynamoMock.call(0);
      expect(call.args[0].input).toMatchObject({
        TableName: 'opx-signals',
        Key: { signalId: mockSignal.signalId },
      });
    });

    it('should return null for missing signal', async () => {
      dynamoMock.on(GetCommand).resolves({});

      const result = await store.getSignal('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('queryByService', () => {
    it('should query signals by service and time', async () => {
      const signal2 = { ...mockSignal, signalId: 'b'.repeat(64) };
      dynamoMock.on(QueryCommand).resolves({
        Items: [mockSignal, signal2],
      });

      const results = await store.queryByService(
        'lambda',
        '2026-01-17T09:00:00.000Z',
        '2026-01-17T11:00:00.000Z'
      );

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(mockSignal);
      expect(results[1]).toEqual(signal2);

      const call = dynamoMock.call(0);
      expect(call.args[0].input).toMatchObject({
        TableName: 'opx-signals',
        IndexName: 'ServiceObservedAtIndex',
        KeyConditionExpression: 'service = :service AND observedAt BETWEEN :start AND :end',
      });
    });

    it('should return empty array when no signals found', async () => {
      dynamoMock.on(QueryCommand).resolves({});

      const results = await store.queryByService(
        'lambda',
        '2026-01-17T09:00:00.000Z',
        '2026-01-17T11:00:00.000Z'
      );

      expect(results).toEqual([]);
    });
  });

  describe('queryBySeverity', () => {
    it('should query signals by severity and time', async () => {
      dynamoMock.on(QueryCommand).resolves({
        Items: [mockSignal],
      });

      const results = await store.queryBySeverity(
        'SEV2',
        '2026-01-17T09:00:00.000Z',
        '2026-01-17T11:00:00.000Z'
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(mockSignal);

      const call = dynamoMock.call(0);
      expect(call.args[0].input).toMatchObject({
        TableName: 'opx-signals',
        IndexName: 'SeverityObservedAtIndex',
        KeyConditionExpression: 'severity = :severity AND observedAt BETWEEN :start AND :end',
      });
    });
  });
});
