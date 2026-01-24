/**
 * CP-2: Normalization Engine Tests
 * 
 * Tests for normalization orchestration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NormalizationEngine } from '../normalization.engine.js';
import { Signal } from '../../signals/signal-types.js';

describe('CP-2: Normalization Engine', () => {
  let engine: NormalizationEngine;
  
  beforeEach(() => {
    engine = new NormalizationEngine();
  });
  
  describe('normalize', () => {
    it('should normalize valid CP-1 signal', async () => {
      const signal: Signal = {
        signalId: 'test-signal-123',
        signalType: 'alarm/opx-lambda-error-rate',
        source: 'cloudwatch-alarm',
        timestamp: '2026-01-15T10:35:00.000Z',
        ingestedAt: '2026-01-15T10:35:01.000Z',
        severity: 'HIGH',
        confidence: 'DEFINITIVE',
        title: 'Alarm: opx-lambda-error-rate',
        description: 'Threshold Crossed',
        evidence: [{
          type: 'alarm-state-change',
          timestamp: '2026-01-15T10:35:00.000Z',
          raw: {},
          checksum: 'evidence-checksum-123',
        }],
        raw: {},
        rawChecksum: 'raw-checksum-123',
        tags: {
          alarmArn: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:opx-lambda-error-rate',
          region: 'us-east-1',
          account: '123456789012',
        },
      };
      
      const result = await engine.normalize(signal);
      
      expect(result.success).toBe(true);
      expect(result.normalizedSignal).toBeDefined();
      expect(result.normalizedSignal?.sourceSignalId).toBe('test-signal-123');
      expect(result.normalizedSignal?.signalType).toBe('alarm-opx-lambda-error-rate');
      expect(result.normalizedSignal?.source).toBe('cloudwatch-alarm');
      expect(result.normalizedSignal?.severity).toBe('HIGH');
      expect(result.normalizedSignal?.confidence).toBe('DEFINITIVE');
      expect(result.normalizedSignal?.normalizationVersion).toBe('v1');
    });
    
    it('should extract resource references', async () => {
      const signal: Signal = {
        signalId: 'test-signal-123',
        signalType: 'alarm/test',
        source: 'cloudwatch-alarm',
        timestamp: '2026-01-15T10:00:00.000Z',
        ingestedAt: '2026-01-15T10:00:01.000Z',
        severity: 'HIGH',
        confidence: 'DEFINITIVE',
        title: 'Test Alarm',
        evidence: [],
        raw: {},
        rawChecksum: 'abc123',
        tags: {
          alarmArn: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:test',
          metricName: 'TestMetric',
        },
      };
      
      const result = await engine.normalize(signal);
      
      expect(result.success).toBe(true);
      expect(result.normalizedSignal?.resourceRefs).toHaveLength(2);
      expect(result.normalizedSignal?.resourceRefs).toContainEqual({
        refType: 'aws-arn',
        refValue: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:test',
        sourceField: 'tags.alarmArn',
      });
      expect(result.normalizedSignal?.resourceRefs).toContainEqual({
        refType: 'name',
        refValue: 'TestMetric',
        sourceField: 'tags.metricName',
      });
    });
    
    it('should extract environment references', async () => {
      const signal: Signal = {
        signalId: 'test-signal-123',
        signalType: 'test',
        source: 'cloudwatch-alarm',
        timestamp: '2026-01-15T10:00:00.000Z',
        ingestedAt: '2026-01-15T10:00:01.000Z',
        severity: 'HIGH',
        confidence: 'DEFINITIVE',
        title: 'Test',
        evidence: [],
        raw: {},
        rawChecksum: 'abc123',
        tags: {
          account: '123456789012',
          region: 'us-east-1',
        },
        dimensions: {
          stage: 'prod',
        },
      };
      
      const result = await engine.normalize(signal);
      
      expect(result.success).toBe(true);
      expect(result.normalizedSignal?.environmentRefs).toHaveLength(3);
    });
    
    it('should create evidence reference pointer', async () => {
      const signal: Signal = {
        signalId: 'test-signal-123',
        signalType: 'test',
        source: 'cloudwatch-alarm',
        timestamp: '2026-01-15T10:00:00.000Z',
        ingestedAt: '2026-01-15T10:00:01.000Z',
        severity: 'HIGH',
        confidence: 'DEFINITIVE',
        title: 'Test',
        evidence: [],
        raw: {},
        rawChecksum: 'raw-checksum-123',
      };
      
      const result = await engine.normalize(signal);
      
      expect(result.success).toBe(true);
      expect(result.normalizedSignal?.evidenceRefs).toHaveLength(1);
      expect(result.normalizedSignal?.evidenceRefs[0]).toEqual({
        evidenceType: 'raw-signal',
        refId: 'test-signal-123',
        checksum: 'raw-checksum-123',
      });
    });
    
    it('should handle missing optional fields', async () => {
      const signal: Signal = {
        signalId: 'test-signal-123',
        signalType: 'test',
        source: 'cloudwatch-metric',
        timestamp: '2026-01-15T10:00:00.000Z',
        ingestedAt: '2026-01-15T10:00:01.000Z',
        severity: 'INFO',
        confidence: 'DEFINITIVE',
        title: 'Test',
        evidence: [],
        raw: {},
        rawChecksum: 'abc123',
        // No tags, no dimensions
      };
      
      const result = await engine.normalize(signal);
      
      expect(result.success).toBe(true);
      expect(result.normalizedSignal?.resourceRefs).toHaveLength(0);
      expect(result.normalizedSignal?.environmentRefs).toHaveLength(0);
      expect(result.normalizedSignal?.evidenceRefs).toHaveLength(1);
    });
    
    it('should handle normalization failure gracefully', async () => {
      const invalidSignal = {
        // Missing required fields
        signalId: 'test-123',
      } as any;
      
      const result = await engine.normalize(invalidSignal);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });
  });
});
