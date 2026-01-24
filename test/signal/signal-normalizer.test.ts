/**
 * Signal Normalizer Tests
 * 
 * Phase 2.1: Signal Ingestion
 */

import { describe, it, expect } from 'vitest';
import { SignalNormalizer, type CloudWatchAlarmEvent } from '../../src/signal/signal-normalizer';

describe('SignalNormalizer', () => {
  const normalizer = new SignalNormalizer();

  const validAlarmEvent: CloudWatchAlarmEvent = {
    AlarmName: 'lambda-SEV2-HighErrorRate',
    AlarmDescription: 'Lambda error rate is too high',
    AWSAccountId: '123456789012',
    NewStateValue: 'ALARM',
    NewStateReason: 'Threshold Crossed',
    StateChangeTime: '2026-01-17T10:23:45.123Z',
    Region: 'us-east-1',
    AlarmArn: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:lambda-SEV2-HighErrorRate',
    OldStateValue: 'OK',
    Trigger: {
      MetricName: 'Errors',
      Namespace: 'AWS/Lambda',
      Statistic: 'Sum',
      Period: 300,
      EvaluationPeriods: 1,
      ComparisonOperator: 'GreaterThanThreshold',
      Threshold: 10,
    },
  };

  describe('normalizeCloudWatchAlarm', () => {
    it('should normalize valid CloudWatch alarm', () => {
      const signal = normalizer.normalizeCloudWatchAlarm(validAlarmEvent);

      expect(signal).not.toBeNull();
      expect(signal!.source).toBe('CLOUDWATCH_ALARM');
      expect(signal!.signalType).toBe('ALARM_STATE_CHANGE');
      expect(signal!.service).toBe('lambda');
      expect(signal!.severity).toBe('SEV2');
      expect(signal!.observedAt).toBe('2026-01-17T10:23:45.123Z');
      expect(signal!.identityWindow).toBe('2026-01-17T10:23Z');
      expect(signal!.signalId).toHaveLength(64);
      expect(signal!.metadata).toMatchObject({
        alarmName: 'lambda-SEV2-HighErrorRate',
        accountId: '123456789012',
        region: 'us-east-1',
      });
    });

    it('should extract service from alarm name', () => {
      const event = { ...validAlarmEvent, AlarmName: 'dynamodb-SEV1-HighLatency' };
      const signal = normalizer.normalizeCloudWatchAlarm(event);

      expect(signal).not.toBeNull();
      expect(signal!.service).toBe('dynamodb');
    });

    it('should extract severity from alarm name', () => {
      const severities = ['SEV1', 'SEV2', 'SEV3', 'SEV4'];
      
      for (const sev of severities) {
        const event = { ...validAlarmEvent, AlarmName: `lambda-${sev}-TestAlarm` };
        const signal = normalizer.normalizeCloudWatchAlarm(event);

        expect(signal).not.toBeNull();
        expect(signal!.severity).toBe(sev);
      }
    });

    it('should return null for OK state', () => {
      const event = { ...validAlarmEvent, NewStateValue: 'OK' as const };
      const signal = normalizer.normalizeCloudWatchAlarm(event);

      expect(signal).toBeNull();
    });

    it('should return null for INSUFFICIENT_DATA state', () => {
      const event = { ...validAlarmEvent, NewStateValue: 'INSUFFICIENT_DATA' as const };
      const signal = normalizer.normalizeCloudWatchAlarm(event);

      expect(signal).toBeNull();
    });

    it('should return null when service cannot be extracted', () => {
      const event = { ...validAlarmEvent, AlarmName: 'InvalidAlarmName' };
      const signal = normalizer.normalizeCloudWatchAlarm(event);

      expect(signal).toBeNull();
    });

    it('should return null when severity cannot be extracted', () => {
      const event = { ...validAlarmEvent, AlarmName: 'lambda-HighErrorRate' };
      const signal = normalizer.normalizeCloudWatchAlarm(event);

      expect(signal).toBeNull();
    });

    it('should return null for invalid severity format', () => {
      const event = { ...validAlarmEvent, AlarmName: 'lambda-INVALID-HighErrorRate' };
      const signal = normalizer.normalizeCloudWatchAlarm(event);

      expect(signal).toBeNull();
    });

    it('should handle alarm name with lowercase severity', () => {
      const event = { ...validAlarmEvent, AlarmName: 'lambda-sev2-HighErrorRate' };
      const signal = normalizer.normalizeCloudWatchAlarm(event);

      expect(signal).not.toBeNull();
      expect(signal!.severity).toBe('SEV2');
    });

    it('should generate deterministic signalId', () => {
      const signal1 = normalizer.normalizeCloudWatchAlarm(validAlarmEvent);
      const signal2 = normalizer.normalizeCloudWatchAlarm(validAlarmEvent);

      expect(signal1).not.toBeNull();
      expect(signal2).not.toBeNull();
      expect(signal1!.signalId).toBe(signal2!.signalId);
    });

    it('should generate same signalId for alarms in same identity window', () => {
      const event1 = { ...validAlarmEvent, StateChangeTime: '2026-01-17T10:23:12.000Z' };
      const event2 = { ...validAlarmEvent, StateChangeTime: '2026-01-17T10:23:47.000Z' };

      const signal1 = normalizer.normalizeCloudWatchAlarm(event1);
      const signal2 = normalizer.normalizeCloudWatchAlarm(event2);

      expect(signal1).not.toBeNull();
      expect(signal2).not.toBeNull();
      expect(signal1!.signalId).toBe(signal2!.signalId); // Same identity window
      expect(signal1!.identityWindow).toBe('2026-01-17T10:23Z');
      expect(signal2!.identityWindow).toBe('2026-01-17T10:23Z');
    });

    it('should generate different signalId for different identity windows', () => {
      const event1 = { ...validAlarmEvent, StateChangeTime: '2026-01-17T10:23:00.000Z' };
      const event2 = { ...validAlarmEvent, StateChangeTime: '2026-01-17T10:24:00.000Z' };

      const signal1 = normalizer.normalizeCloudWatchAlarm(event1);
      const signal2 = normalizer.normalizeCloudWatchAlarm(event2);

      expect(signal1).not.toBeNull();
      expect(signal2).not.toBeNull();
      expect(signal1!.signalId).not.toBe(signal2!.signalId);
    });

    it('should include all metadata fields', () => {
      const signal = normalizer.normalizeCloudWatchAlarm(validAlarmEvent);

      expect(signal).not.toBeNull();
      expect(signal!.metadata).toMatchObject({
        alarmName: validAlarmEvent.AlarmName,
        alarmDescription: validAlarmEvent.AlarmDescription,
        alarmArn: validAlarmEvent.AlarmArn,
        accountId: validAlarmEvent.AWSAccountId,
        region: validAlarmEvent.Region,
        newStateReason: validAlarmEvent.NewStateReason,
        oldStateValue: validAlarmEvent.OldStateValue,
        trigger: validAlarmEvent.Trigger,
      });
    });
  });
});
