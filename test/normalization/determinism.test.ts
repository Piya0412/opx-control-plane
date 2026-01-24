/**
 * CP-2: Determinism Tests
 * 
 * CRITICAL: Verify same input → same output
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NormalizationEngine } from '../../src/normalization/normalization.engine.js';
import { Signal } from '../../src/signals/signal-types.js';

describe('CP-2: Determinism (CRITICAL)', () => {
  let engine: NormalizationEngine;
  
  beforeEach(() => {
    engine = new NormalizationEngine();
  });
  
  it('should produce identical normalizedSignalId for same input', async () => {
    const signal: Signal = {
      signalId: 'test-signal-123',
      signalType: 'alarm/opx-lambda-error-rate',
      source: 'cloudwatch-alarm',
      timestamp: '2026-01-15T10:35:00.000Z',
      ingestedAt: '2026-01-15T10:35:01.000Z',
      severity: 'HIGH',
      confidence: 'DEFINITIVE',
      title: 'Alarm: opx-lambda-error-rate',
      evidence: [{
        type: 'alarm-state-change',
        timestamp: '2026-01-15T10:35:00.000Z',
        raw: {},
        checksum: 'test-checksum',
      }],
      raw: {},
      rawChecksum: 'abc123',
      tags: {
        alarmArn: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:test',
      },
    };
    
    const result1 = await engine.normalize(signal);
    const result2 = await engine.normalize(signal);
    
    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result1.normalizedSignalId).toBe(result2.normalizedSignalId);
  });
  
  it('should produce byte-for-byte identical output for same input', async () => {
    const signal: Signal = {
      signalId: 'test-signal-123',
      signalType: 'alarm/opx-lambda-error-rate',
      source: 'cloudwatch-alarm',
      timestamp: '2026-01-15T10:35:00.000Z',
      ingestedAt: '2026-01-15T10:35:01.000Z',
      severity: 'HIGH',
      confidence: 'DEFINITIVE',
      title: 'Alarm: opx-lambda-error-rate',
      evidence: [{
        type: 'alarm-state-change',
        timestamp: '2026-01-15T10:35:00.000Z',
        raw: {},
        checksum: 'test-checksum',
      }],
      raw: {},
      rawChecksum: 'abc123',
      tags: {
        alarmArn: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:test',
        region: 'us-east-1',
        account: '123456789012',
      },
    };
    
    const result1 = await engine.normalize(signal);
    const result2 = await engine.normalize(signal);
    
    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    
    // Compare all fields except normalizedAt (timestamp)
    const signal1 = { ...result1.normalizedSignal, normalizedAt: '' };
    const signal2 = { ...result2.normalizedSignal, normalizedAt: '' };
    
    expect(signal1).toEqual(signal2);
  });
  
  it('should produce different IDs for different signals', async () => {
    const signal1: Signal = {
      signalId: 'test-signal-123',
      signalType: 'alarm/test-1',
      source: 'cloudwatch-alarm',
      timestamp: '2026-01-15T10:00:00.000Z',
      ingestedAt: '2026-01-15T10:00:01.000Z',
      severity: 'HIGH',
      confidence: 'DEFINITIVE',
      title: 'Test 1',
      evidence: [{
        type: 'alarm-state-change',
        timestamp: '2026-01-15T10:00:00.000Z',
        raw: {},
        checksum: 'test-checksum-1',
      }],
      raw: {},
      rawChecksum: 'abc123',
    };
    
    const signal2: Signal = {
      signalId: 'test-signal-456',
      signalType: 'alarm/test-2',
      source: 'cloudwatch-alarm',
      timestamp: '2026-01-15T10:00:00.000Z',
      ingestedAt: '2026-01-15T10:00:01.000Z',
      severity: 'HIGH',
      confidence: 'DEFINITIVE',
      title: 'Test 2',
      evidence: [{
        type: 'alarm-state-change',
        timestamp: '2026-01-15T10:00:00.000Z',
        raw: {},
        checksum: 'test-checksum-2',
      }],
      raw: {},
      rawChecksum: 'def456',
    };
    
    const result1 = await engine.normalize(signal1);
    const result2 = await engine.normalize(signal2);
    
    expect(result1.normalizedSignalId).not.toBe(result2.normalizedSignalId);
  });
  
  it('should be stateless (no memory between calls)', async () => {
    const signal1: Signal = {
      signalId: 'test-signal-1',
      signalType: 'test',
      source: 'cloudwatch-metric',
      timestamp: '2026-01-15T10:00:00.000Z',
      ingestedAt: '2026-01-15T10:00:01.000Z',
      severity: 'INFO',
      confidence: 'DEFINITIVE',
      title: 'Test 1',
      evidence: [{
        type: 'metric-datapoint',
        timestamp: '2026-01-15T10:00:00.000Z',
        raw: {},
        checksum: 'test-checksum-1',
      }],
      raw: {},
      rawChecksum: 'abc123',
    };
    
    const signal2: Signal = {
      signalId: 'test-signal-2',
      signalType: 'test',
      source: 'cloudwatch-metric',
      timestamp: '2026-01-15T10:01:00.000Z',
      ingestedAt: '2026-01-15T10:01:01.000Z',
      severity: 'INFO',
      confidence: 'DEFINITIVE',
      title: 'Test 2',
      evidence: [{
        type: 'metric-datapoint',
        timestamp: '2026-01-15T10:01:00.000Z',
        raw: {},
        checksum: 'test-checksum-2',
      }],
      raw: {},
      rawChecksum: 'def456',
    };
    
    // Process signal1
    const result1 = await engine.normalize(signal1);
    
    // Process signal2 (should not be affected by signal1)
    const result2 = await engine.normalize(signal2);
    
    // Process signal1 again (should produce same result)
    const result1Again = await engine.normalize(signal1);
    
    expect(result1.normalizedSignalId).toBe(result1Again.normalizedSignalId);
    expect(result1.normalizedSignalId).not.toBe(result2.normalizedSignalId);
  });
  
  it('should handle replay scenario (reprocess historical signals)', async () => {
    // Simulate historical signal from CP-1
    const historicalSignal: Signal = {
      signalId: 'historical-signal-123',
      signalType: 'alarm/opx-eventstore-write-failure',
      source: 'cloudwatch-alarm',
      timestamp: '2026-01-01T00:00:00.000Z', // Old timestamp
      ingestedAt: '2026-01-01T00:00:01.000Z',
      severity: 'CRITICAL',
      confidence: 'DEFINITIVE',
      title: 'Historical Alarm',
      evidence: [{
        type: 'alarm-state-change',
        timestamp: '2026-01-01T00:00:00.000Z',
        raw: {},
        checksum: 'historical-evidence-checksum',
      }],
      raw: {},
      rawChecksum: 'historical-checksum',
    };
    
    // Process now
    const result1 = await engine.normalize(historicalSignal);
    
    // Simulate replay (process same signal again later)
    const result2 = await engine.normalize(historicalSignal);
    
    // Results must be identical (except normalizedAt)
    expect(result1.normalizedSignalId).toBe(result2.normalizedSignalId);
    
    const signal1 = { ...result1.normalizedSignal, normalizedAt: '' };
    const signal2 = { ...result2.normalizedSignal, normalizedAt: '' };
    
    expect(signal1).toEqual(signal2);
  });
});
