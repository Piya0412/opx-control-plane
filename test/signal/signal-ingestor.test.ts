/**
 * Signal Ingestor Lambda Handler Tests
 * 
 * Phase 2.1: Signal Ingestion
 * 
 * Tests CORRECTION 4: EventBridge emission is best-effort (non-blocking)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { dynamoDocMock as dynamoMock, eventBridgeMock } from '../setup/aws-mock.js';
import type { SNSEvent } from 'aws-lambda';

// Mock environment variables BEFORE importing handler
process.env.SIGNALS_TABLE_NAME = 'opx-signals';
process.env.EVENT_BUS_NAME = 'default';

// Import handler after mocks and env are set up
const { handler } = await import('../../src/signal/signal-ingestor.js');

describe('signal-ingestor handler', () => {
  const validAlarmMessage = {
    AlarmName: 'lambda-SEV2-HighErrorRate',
    AlarmDescription: 'Lambda error rate is too high',
    AWSAccountId: '123456789012',
    NewStateValue: 'ALARM',
    NewStateReason: 'Threshold Crossed',
    StateChangeTime: '2026-01-17T10:23:45.123Z',
    Region: 'us-east-1',
    AlarmArn: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:lambda-SEV2-HighErrorRate',
    OldStateValue: 'OK',
  };

  const createSNSEvent = (message: any): SNSEvent => ({
    Records: [
      {
        EventSource: 'aws:sns',
        EventVersion: '1.0',
        EventSubscriptionArn: 'arn:aws:sns:us-east-1:123456789012:test-topic',
        Sns: {
          Type: 'Notification',
          MessageId: 'test-message-id',
          TopicArn: 'arn:aws:sns:us-east-1:123456789012:test-topic',
          Subject: 'Test',
          Message: JSON.stringify(message),
          Timestamp: '2026-01-17T10:23:45.123Z',
          SignatureVersion: '1',
          Signature: 'test-signature',
          SigningCertUrl: 'https://test.com',
          UnsubscribeUrl: 'https://test.com',
          MessageAttributes: {},
        },
      },
    ],
  });

  beforeEach(() => {
    dynamoMock.reset();
    eventBridgeMock.reset();
    vi.clearAllMocks();
  });

  it('should ingest valid signal', async () => {
    dynamoMock.on(GetCommand).resolves({}); // No existing signal
    dynamoMock.on(PutCommand).resolves({});
    eventBridgeMock.on(PutEventsCommand).resolves({});

    const snsEvent = createSNSEvent(validAlarmMessage);
    await handler(snsEvent);

    // Verify signal stored
    expect(dynamoMock.calls()).toHaveLength(2); // GetCommand + PutCommand
    const putCall = dynamoMock.commandCalls(PutCommand)[0];
    expect(putCall.args[0].input.Item).toMatchObject({
      source: 'CLOUDWATCH_ALARM',
      signalType: 'ALARM_STATE_CHANGE',
      service: 'lambda',
      severity: 'SEV2',
    });

    // Verify EventBridge emission
    expect(eventBridgeMock.calls()).toHaveLength(1);
  });

  it('should reject invalid signal schema (wrong state)', async () => {
    const invalidMessage = { ...validAlarmMessage, NewStateValue: 'OK' };
    const snsEvent = createSNSEvent(invalidMessage);

    await handler(snsEvent);

    // Should not store signal
    expect(dynamoMock.calls()).toHaveLength(0);
    expect(eventBridgeMock.calls()).toHaveLength(0);
  });

  it('should reject signal without service', async () => {
    const invalidMessage = { ...validAlarmMessage, AlarmName: 'InvalidAlarmName' };
    const snsEvent = createSNSEvent(invalidMessage);

    await handler(snsEvent);

    // Should not store signal
    expect(dynamoMock.calls()).toHaveLength(0);
    expect(eventBridgeMock.calls()).toHaveLength(0);
  });

  it('should reject signal without severity', async () => {
    const invalidMessage = { ...validAlarmMessage, AlarmName: 'lambda-HighErrorRate' };
    const snsEvent = createSNSEvent(invalidMessage);

    await handler(snsEvent);

    // Should not store signal
    expect(dynamoMock.calls()).toHaveLength(0);
    expect(eventBridgeMock.calls()).toHaveLength(0);
  });

  it('should handle duplicate signals idempotently', async () => {
    // Mock existing signal
    dynamoMock.on(GetCommand).resolves({
      Item: {
        signalId: 'existing-signal-id',
        source: 'CLOUDWATCH_ALARM',
      },
    });

    const snsEvent = createSNSEvent(validAlarmMessage);
    await handler(snsEvent);

    // Should not store duplicate
    expect(dynamoMock.commandCalls(PutCommand)).toHaveLength(0);
    expect(eventBridgeMock.calls()).toHaveLength(0);
  });

  it('should continue if EventBridge emission fails (CORRECTION 4)', async () => {
    dynamoMock.on(GetCommand).resolves({}); // No existing signal
    dynamoMock.on(PutCommand).resolves({});
    eventBridgeMock.on(PutEventsCommand).rejects(new Error('Throttled'));

    const snsEvent = createSNSEvent(validAlarmMessage);
    
    // Should not throw - signal still stored
    await expect(handler(snsEvent)).resolves.toBeUndefined();

    // Verify signal was stored despite EventBridge failure
    expect(dynamoMock.commandCalls(PutCommand)).toHaveLength(1);
    expect(eventBridgeMock.calls()).toHaveLength(1);
  });

  it('should throw on DynamoDB error (retry)', async () => {
    dynamoMock.on(GetCommand).rejects(new Error('DynamoDB error'));

    const snsEvent = createSNSEvent(validAlarmMessage);

    // Should throw to trigger retry
    await expect(handler(snsEvent)).rejects.toThrow('DynamoDB error');
  });

  it('should process multiple records', async () => {
    dynamoMock.on(GetCommand).resolves({}); // No existing signals
    dynamoMock.on(PutCommand).resolves({});
    eventBridgeMock.on(PutEventsCommand).resolves({});

    const snsEvent: SNSEvent = {
      Records: [
        createSNSEvent(validAlarmMessage).Records[0],
        createSNSEvent({ ...validAlarmMessage, AlarmName: 'dynamodb-SEV1-HighLatency' }).Records[0],
      ],
    };

    await handler(snsEvent);

    // Should store both signals
    expect(dynamoMock.commandCalls(PutCommand)).toHaveLength(2);
    expect(eventBridgeMock.calls()).toHaveLength(2);
  });

  it('should continue processing after invalid signal', async () => {
    dynamoMock.on(GetCommand).resolves({}); // No existing signals
    dynamoMock.on(PutCommand).resolves({});
    eventBridgeMock.on(PutEventsCommand).resolves({});

    const snsEvent: SNSEvent = {
      Records: [
        createSNSEvent({ ...validAlarmMessage, NewStateValue: 'OK' }).Records[0], // Invalid
        createSNSEvent(validAlarmMessage).Records[0], // Valid
      ],
    };

    await handler(snsEvent);

    // Should store only valid signal
    expect(dynamoMock.commandCalls(PutCommand)).toHaveLength(1);
    expect(eventBridgeMock.calls()).toHaveLength(1);
  });
});
