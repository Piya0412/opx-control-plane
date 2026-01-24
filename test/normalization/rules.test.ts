/**
 * CP-2: Normalization Rules Tests
 * 
 * Tests for pure normalization functions.
 */

import { describe, it, expect } from 'vitest';
import {
  computeNormalizedSignalId,
  canonicalizeTimestamp,
  canonicalizeSignalType,
  extractResourceRefs,
  extractEnvironmentRefs,
  extractEvidenceRefs,
} from '../../src/normalization/normalization.rules.js';
import { Signal } from '../../src/signals/signal-types.js';

describe('CP-2: Normalization Rules', () => {
  describe('computeNormalizedSignalId', () => {
    it('should generate deterministic ID', () => {
      const id1 = computeNormalizedSignalId('signal-123', 'alarm/test', '2026-01-15T10:00:00.000Z');
      const id2 = computeNormalizedSignalId('signal-123', 'alarm/test', '2026-01-15T10:00:00.000Z');
      
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^[a-f0-9]{64}$/);
    });
    
    it('should generate different IDs for different inputs', () => {
      const id1 = computeNormalizedSignalId('signal-123', 'alarm/test', '2026-01-15T10:00:00.000Z');
      const id2 = computeNormalizedSignalId('signal-456', 'alarm/test', '2026-01-15T10:00:00.000Z');
      
      expect(id1).not.toBe(id2);
    });
  });
  
  describe('canonicalizeTimestamp', () => {
    it('should pass through ISO-8601 timestamp', () => {
      const timestamp = '2026-01-15T10:00:00.000Z';
      expect(canonicalizeTimestamp(timestamp)).toBe(timestamp);
    });
  });
  
  describe('canonicalizeSignalType', () => {
    it('should convert to lowercase kebab-case', () => {
      expect(canonicalizeSignalType('alarm/opx-lambda-error-rate')).toBe('alarm-opx-lambda-error-rate');
      expect(canonicalizeSignalType('OPX/ControlPlane/IncidentCreated')).toBe('opx-controlplane-incidentcreated');
    });
  });
  
  describe('extractResourceRefs', () => {
    it('should extract alarm ARN from tags', () => {
      const signal: Signal = {
        signalId: 'test-123',
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
        },
      };
      
      const refs = extractResourceRefs(signal);
      
      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        refType: 'aws-arn',
        refValue: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:test',
        sourceField: 'tags.alarmArn',
      });
    });
    
    it('should extract metric name from tags', () => {
      const signal: Signal = {
        signalId: 'test-123',
        signalType: 'metric/test',
        source: 'cloudwatch-metric',
        timestamp: '2026-01-15T10:00:00.000Z',
        ingestedAt: '2026-01-15T10:00:01.000Z',
        severity: 'INFO',
        confidence: 'DEFINITIVE',
        title: 'Test Metric',
        evidence: [],
        raw: {},
        rawChecksum: 'abc123',
        tags: {
          metricName: 'TestMetric',
        },
      };
      
      const refs = extractResourceRefs(signal);
      
      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        refType: 'name',
        refValue: 'TestMetric',
        sourceField: 'tags.metricName',
      });
    });
    
    it('should return empty array when no resource refs present', () => {
      const signal: Signal = {
        signalId: 'test-123',
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
      };
      
      const refs = extractResourceRefs(signal);
      
      expect(refs).toHaveLength(0);
    });
  });
  
  describe('extractEnvironmentRefs', () => {
    it('should extract account and region from tags', () => {
      const signal: Signal = {
        signalId: 'test-123',
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
      };
      
      const refs = extractEnvironmentRefs(signal);
      
      expect(refs).toHaveLength(2);
      expect(refs).toContainEqual({
        envType: 'account',
        value: '123456789012',
        sourceField: 'tags.account',
      });
      expect(refs).toContainEqual({
        envType: 'region',
        value: 'us-east-1',
        sourceField: 'tags.region',
      });
    });
    
    it('should extract stage from dimensions if present', () => {
      const signal: Signal = {
        signalId: 'test-123',
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
        dimensions: {
          stage: 'prod',
        },
      };
      
      const refs = extractEnvironmentRefs(signal);
      
      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        envType: 'stage',
        value: 'prod',
        sourceField: 'dimensions.stage',
      });
    });
    
    it('should return empty array when no environment refs present', () => {
      const signal: Signal = {
        signalId: 'test-123',
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
      };
      
      const refs = extractEnvironmentRefs(signal);
      
      expect(refs).toHaveLength(0);
    });
  });
  
  describe('extractEvidenceRefs', () => {
    it('should create evidence reference pointer', () => {
      const signal: Signal = {
        signalId: 'test-123',
        signalType: 'test',
        source: 'cloudwatch-alarm',
        timestamp: '2026-01-15T10:00:00.000Z',
        ingestedAt: '2026-01-15T10:00:01.000Z',
        severity: 'HIGH',
        confidence: 'DEFINITIVE',
        title: 'Test',
        evidence: [],
        raw: {},
        rawChecksum: 'abc123def456',
      };
      
      const refs = extractEvidenceRefs(signal);
      
      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        evidenceType: 'raw-signal',
        refId: 'test-123',
        checksum: 'abc123def456',
      });
    });
  });
});
