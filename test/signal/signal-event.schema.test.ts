/**
 * Signal Event Schema Tests
 * 
 * Phase 2.1: Signal Ingestion
 */

import { describe, it, expect } from 'vitest';
import { SignalEventSchema } from '../../src/signal/signal-event.schema.js';

describe('SignalEvent Schema', () => {
  const validSignal = {
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

  it('should accept valid signal', () => {
    expect(() => SignalEventSchema.parse(validSignal)).not.toThrow();
  });

  it('should reject invalid signalId length', () => {
    const signal = { ...validSignal, signalId: 'abc' };
    expect(() => SignalEventSchema.parse(signal)).toThrow();
  });

  it('should reject invalid source', () => {
    const signal = { ...validSignal, source: 'INVALID' };
    expect(() => SignalEventSchema.parse(signal)).toThrow();
  });

  it('should reject invalid signalType', () => {
    const signal = { ...validSignal, signalType: 'INVALID' };
    expect(() => SignalEventSchema.parse(signal)).toThrow();
  });

  it('should reject invalid severity', () => {
    const signal = { ...validSignal, severity: 'INVALID' };
    expect(() => SignalEventSchema.parse(signal)).toThrow();
  });

  it('should reject empty service', () => {
    const signal = { ...validSignal, service: '' };
    expect(() => SignalEventSchema.parse(signal)).toThrow();
  });

  it('should reject service longer than 256 chars', () => {
    const signal = { ...validSignal, service: 'a'.repeat(257) };
    expect(() => SignalEventSchema.parse(signal)).toThrow();
  });

  it('should reject invalid observedAt', () => {
    const signal = { ...validSignal, observedAt: 'not-iso' };
    expect(() => SignalEventSchema.parse(signal)).toThrow();
  });

  it('should reject invalid identityWindow format (with seconds)', () => {
    const signal = { ...validSignal, identityWindow: '2026-01-17T10:23:45Z' };
    expect(() => SignalEventSchema.parse(signal)).toThrow();
  });

  it('should reject invalid identityWindow format (no Z)', () => {
    const signal = { ...validSignal, identityWindow: '2026-01-17T10:23' };
    expect(() => SignalEventSchema.parse(signal)).toThrow();
  });

  it('should accept valid identityWindow format', () => {
    const signal = { ...validSignal, identityWindow: '2026-01-17T10:23Z' };
    expect(() => SignalEventSchema.parse(signal)).not.toThrow();
  });

  it('should reject invalid ingestedAt', () => {
    const signal = { ...validSignal, ingestedAt: 'not-iso' };
    expect(() => SignalEventSchema.parse(signal)).toThrow();
  });

  it('should accept signal without metadata', () => {
    const signal = { ...validSignal, metadata: undefined };
    expect(() => SignalEventSchema.parse(signal)).not.toThrow();
  });

  it('should accept signal with empty metadata', () => {
    const signal = { ...validSignal, metadata: {} };
    expect(() => SignalEventSchema.parse(signal)).not.toThrow();
  });

  it('should accept signal with complex metadata', () => {
    const signal = {
      ...validSignal,
      metadata: {
        alarmName: 'HighErrorRate',
        region: 'us-east-1',
        accountId: '123456789012',
        nested: { key: 'value' },
        array: [1, 2, 3],
      },
    };
    expect(() => SignalEventSchema.parse(signal)).not.toThrow();
  });

  it('should reject missing required fields', () => {
    const { signalId, ...incomplete } = validSignal;
    expect(() => SignalEventSchema.parse(incomplete)).toThrow();
  });

  it('should accept all valid sources', () => {
    const sources = ['CLOUDWATCH_ALARM', 'CLOUDWATCH_METRIC', 'CLOUDWATCH_LOGS', 'CUSTOM_API', 'EVENTBRIDGE'];
    sources.forEach((source) => {
      const signal = { ...validSignal, source };
      expect(() => SignalEventSchema.parse(signal)).not.toThrow();
    });
  });

  it('should accept all valid signal types', () => {
    const types = ['ALARM_STATE_CHANGE', 'METRIC_BREACH', 'LOG_PATTERN_MATCH', 'CUSTOM_EVENT'];
    types.forEach((signalType) => {
      const signal = { ...validSignal, signalType };
      expect(() => SignalEventSchema.parse(signal)).not.toThrow();
    });
  });

  it('should accept all valid severities', () => {
    const severities = ['SEV1', 'SEV2', 'SEV3', 'SEV4'];
    severities.forEach((severity) => {
      const signal = { ...validSignal, severity };
      expect(() => SignalEventSchema.parse(signal)).not.toThrow();
    });
  });
});
