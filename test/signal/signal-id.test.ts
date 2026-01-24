/**
 * Signal Identity Tests
 * 
 * Phase 2.1: Signal Ingestion
 * 
 * Tests for INV-P2.4: Deterministic and replayable signal identity
 */

import { describe, it, expect } from 'vitest';
import { computeIdentityWindow, computeSignalId } from '../../src/signal/signal-id.js';

describe('computeIdentityWindow', () => {
  it('should round to minute bucket', () => {
    expect(computeIdentityWindow('2026-01-17T10:23:45.123Z')).toBe('2026-01-17T10:23Z');
    expect(computeIdentityWindow('2026-01-17T10:23:00.000Z')).toBe('2026-01-17T10:23Z');
    expect(computeIdentityWindow('2026-01-17T10:23:59.999Z')).toBe('2026-01-17T10:23Z');
  });

  it('should produce same window for signals within same minute', () => {
    const window1 = computeIdentityWindow('2026-01-17T10:23:12.000Z');
    const window2 = computeIdentityWindow('2026-01-17T10:23:47.000Z');
    expect(window1).toBe(window2);
    expect(window1).toBe('2026-01-17T10:23Z');
  });

  it('should produce different windows for different minutes', () => {
    const window1 = computeIdentityWindow('2026-01-17T10:23:00.000Z');
    const window2 = computeIdentityWindow('2026-01-17T10:24:00.000Z');
    expect(window1).not.toBe(window2);
    expect(window1).toBe('2026-01-17T10:23Z');
    expect(window2).toBe('2026-01-17T10:24Z');
  });

  it('should handle midnight boundary', () => {
    expect(computeIdentityWindow('2026-01-17T23:59:59.999Z')).toBe('2026-01-17T23:59Z');
    expect(computeIdentityWindow('2026-01-18T00:00:00.000Z')).toBe('2026-01-18T00:00Z');
  });

  it('should handle year boundary', () => {
    expect(computeIdentityWindow('2025-12-31T23:59:59.999Z')).toBe('2025-12-31T23:59Z');
    expect(computeIdentityWindow('2026-01-01T00:00:00.000Z')).toBe('2026-01-01T00:00Z');
  });
});

describe('computeSignalId', () => {
  it('should generate deterministic signalId', () => {
    const id1 = computeSignalId(
      'CLOUDWATCH_ALARM',
      'ALARM_STATE_CHANGE',
      'lambda',
      'SEV2',
      '2026-01-17T10:23Z',
      { alarmName: 'test' }
    );
    const id2 = computeSignalId(
      'CLOUDWATCH_ALARM',
      'ALARM_STATE_CHANGE',
      'lambda',
      'SEV2',
      '2026-01-17T10:23Z',
      { alarmName: 'test' }
    );

    expect(id1).toBe(id2);
    expect(id1).toHaveLength(64); // SHA-256 hex
  });

  it('should generate SAME signalId for signals in same identity window (CORRECTION 2)', () => {
    // Same alarm within same minute → same signalId (deduplication works)
    const id1 = computeSignalId(
      'CLOUDWATCH_ALARM',
      'ALARM_STATE_CHANGE',
      'lambda',
      'SEV2',
      '2026-01-17T10:23Z',
      { alarmName: 'HighErrorRate' }
    );
    const id2 = computeSignalId(
      'CLOUDWATCH_ALARM',
      'ALARM_STATE_CHANGE',
      'lambda',
      'SEV2',
      '2026-01-17T10:23Z',
      { alarmName: 'HighErrorRate' }
    );

    expect(id1).toBe(id2); // Deduplication works
  });

  it('should generate different signalId for different identity windows', () => {
    const id1 = computeSignalId(
      'CLOUDWATCH_ALARM',
      'ALARM_STATE_CHANGE',
      'lambda',
      'SEV2',
      '2026-01-17T10:23Z',
      { alarmName: 'test' }
    );
    const id2 = computeSignalId(
      'CLOUDWATCH_ALARM',
      'ALARM_STATE_CHANGE',
      'lambda',
      'SEV2',
      '2026-01-17T10:24Z',
      { alarmName: 'test' }
    );

    expect(id1).not.toBe(id2);
  });

  it('should normalize metadata for determinism (key order)', () => {
    const id1 = computeSignalId(
      'CLOUDWATCH_ALARM',
      'ALARM_STATE_CHANGE',
      'lambda',
      'SEV2',
      '2026-01-17T10:23Z',
      { a: 1, b: 2 }
    );
    const id2 = computeSignalId(
      'CLOUDWATCH_ALARM',
      'ALARM_STATE_CHANGE',
      'lambda',
      'SEV2',
      '2026-01-17T10:23Z',
      { b: 2, a: 1 }
    );

    expect(id1).toBe(id2); // Order doesn't matter
  });

  it('should generate different signalId for different sources', () => {
    const id1 = computeSignalId(
      'CLOUDWATCH_ALARM',
      'ALARM_STATE_CHANGE',
      'lambda',
      'SEV2',
      '2026-01-17T10:23Z',
      {}
    );
    const id2 = computeSignalId(
      'CLOUDWATCH_METRIC',
      'ALARM_STATE_CHANGE',
      'lambda',
      'SEV2',
      '2026-01-17T10:23Z',
      {}
    );

    expect(id1).not.toBe(id2);
  });

  it('should generate different signalId for different signal types', () => {
    const id1 = computeSignalId(
      'CLOUDWATCH_ALARM',
      'ALARM_STATE_CHANGE',
      'lambda',
      'SEV2',
      '2026-01-17T10:23Z',
      {}
    );
    const id2 = computeSignalId(
      'CLOUDWATCH_ALARM',
      'METRIC_BREACH',
      'lambda',
      'SEV2',
      '2026-01-17T10:23Z',
      {}
    );

    expect(id1).not.toBe(id2);
  });

  it('should generate different signalId for different services', () => {
    const id1 = computeSignalId(
      'CLOUDWATCH_ALARM',
      'ALARM_STATE_CHANGE',
      'lambda',
      'SEV2',
      '2026-01-17T10:23Z',
      {}
    );
    const id2 = computeSignalId(
      'CLOUDWATCH_ALARM',
      'ALARM_STATE_CHANGE',
      'dynamodb',
      'SEV2',
      '2026-01-17T10:23Z',
      {}
    );

    expect(id1).not.toBe(id2);
  });

  it('should generate different signalId for different severities', () => {
    const id1 = computeSignalId(
      'CLOUDWATCH_ALARM',
      'ALARM_STATE_CHANGE',
      'lambda',
      'SEV2',
      '2026-01-17T10:23Z',
      {}
    );
    const id2 = computeSignalId(
      'CLOUDWATCH_ALARM',
      'ALARM_STATE_CHANGE',
      'lambda',
      'SEV1',
      '2026-01-17T10:23Z',
      {}
    );

    expect(id1).not.toBe(id2);
  });

  it('should generate different signalId for different metadata', () => {
    const id1 = computeSignalId(
      'CLOUDWATCH_ALARM',
      'ALARM_STATE_CHANGE',
      'lambda',
      'SEV2',
      '2026-01-17T10:23Z',
      { alarmName: 'alarm1' }
    );
    const id2 = computeSignalId(
      'CLOUDWATCH_ALARM',
      'ALARM_STATE_CHANGE',
      'lambda',
      'SEV2',
      '2026-01-17T10:23Z',
      { alarmName: 'alarm2' }
    );

    expect(id1).not.toBe(id2);
  });

  it('should handle empty metadata', () => {
    const id1 = computeSignalId(
      'CLOUDWATCH_ALARM',
      'ALARM_STATE_CHANGE',
      'lambda',
      'SEV2',
      '2026-01-17T10:23Z',
      {}
    );
    const id2 = computeSignalId(
      'CLOUDWATCH_ALARM',
      'ALARM_STATE_CHANGE',
      'lambda',
      'SEV2',
      '2026-01-17T10:23Z',
      {}
    );

    expect(id1).toBe(id2);
    expect(id1).toHaveLength(64);
  });
});

describe('INV-P2.4: Deterministic replay', () => {
  it('should produce identical signalIds when replaying same signal stream', () => {
    const signals = [
      {
        source: 'CLOUDWATCH_ALARM' as const,
        signalType: 'ALARM_STATE_CHANGE' as const,
        service: 'lambda',
        severity: 'SEV2' as const,
        identityWindow: '2026-01-17T10:23Z',
        metadata: { alarmName: 'HighErrorRate' },
      },
      {
        source: 'CLOUDWATCH_ALARM' as const,
        signalType: 'ALARM_STATE_CHANGE' as const,
        service: 'dynamodb',
        severity: 'SEV1' as const,
        identityWindow: '2026-01-17T10:24Z',
        metadata: { alarmName: 'HighLatency' },
      },
    ];

    // First run
    const ids1 = signals.map((s) =>
      computeSignalId(s.source, s.signalType, s.service, s.severity, s.identityWindow, s.metadata)
    );

    // Second run (replay)
    const ids2 = signals.map((s) =>
      computeSignalId(s.source, s.signalType, s.service, s.severity, s.identityWindow, s.metadata)
    );

    expect(ids1).toEqual(ids2);
  });
});
