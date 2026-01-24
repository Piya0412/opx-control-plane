/**
 * CP-1: Signal Ingestion Tests
 * 
 * Validates signal ingestion contract compliance:
 * - Determinism (same input → same signal ID)
 * - Immutability (signals are append-only)
 * - Traceability (checksums enable verification)
 * - Non-invasive (failures don't block operations)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SignalIngestionService } from '../../src/signals/signal-ingestion.js';
import {
  CloudWatchMetricSignal,
  CloudWatchAlarmSignal,
  StructuredLogSignal,
  EventBridgeEventSignal,
} from '../../src/signals/signal-types.js';

describe('CP-1: Signal Ingestion Contract', () => {
  let service: SignalIngestionService;

  beforeEach(() => {
    service = new SignalIngestionService();
  });

  describe('Determinism', () => {
    it('should generate same signal ID for identical CloudWatch metrics', async () => {
      const metric: CloudWatchMetricSignal = {
        namespace: 'OPX/ControlPlane',
        metricName: 'IncidentCreated',
        dimensions: { service: 'payment-service', severity: 'SEV2' },
        timestamp: '2026-01-15T10:30:00.000Z',
        value: 1,
        unit: 'Count',
        statistic: 'Sum',
      };

      const result1 = await service.ingestCloudWatchMetric(metric);
      const result2 = await service.ingestCloudWatchMetric(metric);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.signalId).toBe(result2.signalId);
      expect(result1.signal?.rawChecksum).toBe(result2.signal?.rawChecksum);
    });

    it('should generate same signal ID for identical CloudWatch alarms', async () => {
      const alarm: CloudWatchAlarmSignal = {
        alarmName: 'opx-lambda-error-rate',
        alarmArn: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:opx-lambda-error-rate',
        newState: 'ALARM',
        oldState: 'OK',
        stateChangeTime: '2026-01-15T10:35:00.000Z',
        stateReason: 'Threshold Crossed',
      };

      const result1 = await service.ingestCloudWatchAlarm(alarm);
      const result2 = await service.ingestCloudWatchAlarm(alarm);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.signalId).toBe(result2.signalId);
    });

    it('should generate different signal IDs for different timestamps', async () => {
      const metric1: CloudWatchMetricSignal = {
        namespace: 'OPX/ControlPlane',
        metricName: 'IncidentCreated',
        dimensions: { service: 'payment-service' },
        timestamp: '2026-01-15T10:30:00.000Z',
        value: 1,
        unit: 'Count',
        statistic: 'Sum',
      };

      const metric2: CloudWatchMetricSignal = {
        ...metric1,
        timestamp: '2026-01-15T10:31:00.000Z',
      };

      const result1 = await service.ingestCloudWatchMetric(metric1);
      const result2 = await service.ingestCloudWatchMetric(metric2);

      expect(result1.signalId).not.toBe(result2.signalId);
    });
  });

  describe('Schema Validation', () => {
    it('should accept valid CloudWatch metric', async () => {
      const metric: CloudWatchMetricSignal = {
        namespace: 'OPX/ControlPlane',
        metricName: 'IncidentCreated',
        dimensions: { service: 'payment-service' },
        timestamp: '2026-01-15T10:30:00.000Z',
        value: 1,
        unit: 'Count',
        statistic: 'Sum',
      };

      const result = await service.ingestCloudWatchMetric(metric);

      expect(result.success).toBe(true);
      expect(result.signal).toBeDefined();
      expect(result.signal?.source).toBe('cloudwatch-metric');
    });

    it('should reject invalid CloudWatch metric (missing required fields)', async () => {
      const invalidMetric = {
        namespace: 'OPX/ControlPlane',
        // Missing metricName
        timestamp: '2026-01-15T10:30:00.000Z',
        value: 1,
      };

      const result = await service.ingestCloudWatchMetric(invalidMetric);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should accept valid structured log (ERROR level)', async () => {
      const log: StructuredLogSignal = {
        level: 'ERROR',
        timestamp: '2026-01-15T10:40:00.000Z',
        message: 'Failed to write to event store',
        operation: 'writeEvent',
        service: 'opx-control-plane',
        error: {
          name: 'ConditionalCheckFailedException',
          message: 'The conditional request failed',
        },
      };

      const result = await service.ingestStructuredLog(log);

      expect(result.success).toBe(true);
      expect(result.signal).toBeDefined();
      expect(result.signal?.severity).toBe('HIGH');
    });

    it('should skip non-ERROR logs (INFO level)', async () => {
      const log: StructuredLogSignal = {
        level: 'INFO',
        timestamp: '2026-01-15T10:40:00.000Z',
        message: 'Incident created successfully',
      };

      const result = await service.ingestStructuredLog(log);

      expect(result.success).toBe(true);
      expect(result.signal).toBeUndefined(); // Skipped
    });
  });

  describe('Severity Classification', () => {
    it('should map alarm name to correct severity (CRITICAL)', async () => {
      const alarm: CloudWatchAlarmSignal = {
        alarmName: 'opx-eventstore-write-failure',
        alarmArn: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:opx-eventstore-write-failure',
        newState: 'ALARM',
        oldState: 'OK',
        stateChangeTime: '2026-01-15T10:35:00.000Z',
        stateReason: 'Threshold Crossed',
      };

      const result = await service.ingestCloudWatchAlarm(alarm);

      expect(result.success).toBe(true);
      expect(result.signal?.severity).toBe('CRITICAL');
    });

    it('should map alarm name to correct severity (HIGH)', async () => {
      const alarm: CloudWatchAlarmSignal = {
        alarmName: 'opx-lambda-error-rate',
        alarmArn: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:opx-lambda-error-rate',
        newState: 'ALARM',
        oldState: 'OK',
        stateChangeTime: '2026-01-15T10:35:00.000Z',
        stateReason: 'Threshold Crossed',
      };

      const result = await service.ingestCloudWatchAlarm(alarm);

      expect(result.success).toBe(true);
      expect(result.signal?.severity).toBe('HIGH');
    });

    it('should map log level to severity (FATAL → CRITICAL)', async () => {
      const log: StructuredLogSignal = {
        level: 'FATAL',
        timestamp: '2026-01-15T10:40:00.000Z',
        message: 'System failure',
      };

      const result = await service.ingestStructuredLog(log);

      expect(result.success).toBe(true);
      expect(result.signal?.severity).toBe('CRITICAL');
    });

    it('should map log level to severity (ERROR → HIGH)', async () => {
      const log: StructuredLogSignal = {
        level: 'ERROR',
        timestamp: '2026-01-15T10:40:00.000Z',
        message: 'Operation failed',
      };

      const result = await service.ingestStructuredLog(log);

      expect(result.success).toBe(true);
      expect(result.signal?.severity).toBe('HIGH');
    });
  });

  describe('Confidence Classification', () => {
    it('should assign DEFINITIVE confidence to CloudWatch metrics', async () => {
      const metric: CloudWatchMetricSignal = {
        namespace: 'OPX/ControlPlane',
        metricName: 'IncidentCreated',
        dimensions: {},
        timestamp: '2026-01-15T10:30:00.000Z',
        value: 1,
        unit: 'Count',
        statistic: 'Sum',
      };

      const result = await service.ingestCloudWatchMetric(metric);

      expect(result.signal?.confidence).toBe('DEFINITIVE');
    });

    it('should assign DEFINITIVE confidence to CloudWatch alarms', async () => {
      const alarm: CloudWatchAlarmSignal = {
        alarmName: 'opx-lambda-error-rate',
        alarmArn: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:opx-lambda-error-rate',
        newState: 'ALARM',
        oldState: 'OK',
        stateChangeTime: '2026-01-15T10:35:00.000Z',
        stateReason: 'Threshold Crossed',
      };

      const result = await service.ingestCloudWatchAlarm(alarm);

      expect(result.signal?.confidence).toBe('DEFINITIVE');
    });

    it('should assign HIGH confidence to structured logs', async () => {
      const log: StructuredLogSignal = {
        level: 'ERROR',
        timestamp: '2026-01-15T10:40:00.000Z',
        message: 'Operation failed',
      };

      const result = await service.ingestStructuredLog(log);

      expect(result.signal?.confidence).toBe('HIGH');
    });
  });

  describe('Evidence Chain', () => {
    it('should preserve raw data in evidence', async () => {
      const metric: CloudWatchMetricSignal = {
        namespace: 'OPX/ControlPlane',
        metricName: 'IncidentCreated',
        dimensions: { service: 'payment-service' },
        timestamp: '2026-01-15T10:30:00.000Z',
        value: 1,
        unit: 'Count',
        statistic: 'Sum',
      };

      const result = await service.ingestCloudWatchMetric(metric);

      expect(result.signal?.evidence).toHaveLength(1);
      expect(result.signal?.evidence[0].type).toBe('metric-datapoint');
      expect(result.signal?.evidence[0].raw).toEqual(metric);
      expect(result.signal?.evidence[0].checksum).toBeDefined();
    });

    it('should include interpreted data in evidence', async () => {
      const metric: CloudWatchMetricSignal = {
        namespace: 'OPX/ControlPlane',
        metricName: 'IncidentCreated',
        dimensions: {},
        timestamp: '2026-01-15T10:30:00.000Z',
        value: 1,
        unit: 'Count',
        statistic: 'Sum',
      };

      const result = await service.ingestCloudWatchMetric(metric);

      expect(result.signal?.evidence[0].interpreted).toEqual({
        value: 1,
        unit: 'Count',
        statistic: 'Sum',
      });
    });

    it('should compute checksum for evidence', async () => {
      const metric: CloudWatchMetricSignal = {
        namespace: 'OPX/ControlPlane',
        metricName: 'IncidentCreated',
        dimensions: {},
        timestamp: '2026-01-15T10:30:00.000Z',
        value: 1,
        unit: 'Count',
        statistic: 'Sum',
      };

      const result = await service.ingestCloudWatchMetric(metric);

      expect(result.signal?.evidence[0].checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(result.signal?.rawChecksum).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Traceability', () => {
    it('should preserve complete raw data', async () => {
      const alarm: CloudWatchAlarmSignal = {
        alarmName: 'opx-lambda-error-rate',
        alarmArn: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:opx-lambda-error-rate',
        alarmDescription: 'Lambda error rate exceeded threshold',
        newState: 'ALARM',
        oldState: 'OK',
        stateChangeTime: '2026-01-15T10:35:00.000Z',
        stateReason: 'Threshold Crossed',
        metricNamespace: 'AWS/Lambda',
        metricName: 'Errors',
        threshold: 5,
        evaluationPeriods: 1,
      };

      const result = await service.ingestCloudWatchAlarm(alarm);

      expect(result.signal?.raw).toEqual(alarm);
    });

    it('should compute deterministic checksum', async () => {
      const metric: CloudWatchMetricSignal = {
        namespace: 'OPX/ControlPlane',
        metricName: 'IncidentCreated',
        dimensions: { service: 'payment-service' },
        timestamp: '2026-01-15T10:30:00.000Z',
        value: 1,
        unit: 'Count',
        statistic: 'Sum',
      };

      const result1 = await service.ingestCloudWatchMetric(metric);
      const result2 = await service.ingestCloudWatchMetric(metric);

      expect(result1.signal?.rawChecksum).toBe(result2.signal?.rawChecksum);
    });
  });

  describe('Non-Invasive Failure Handling', () => {
    it('should swallow validation errors and return failure result', async () => {
      const invalidMetric = {
        namespace: 'OPX/ControlPlane',
        // Missing required fields
      };

      const result = await service.ingestCloudWatchMetric(invalidMetric);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      // Should NOT throw exception
    });

    it('should skip OK alarm states (not errors)', async () => {
      const alarm: CloudWatchAlarmSignal = {
        alarmName: 'opx-lambda-error-rate',
        alarmArn: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:opx-lambda-error-rate',
        newState: 'OK', // Not ALARM
        oldState: 'ALARM',
        stateChangeTime: '2026-01-15T10:35:00.000Z',
        stateReason: 'Threshold not crossed',
      };

      const result = await service.ingestCloudWatchAlarm(alarm);

      expect(result.success).toBe(true);
      expect(result.signal).toBeUndefined(); // Skipped
    });
  });

  describe('Dimension Cardinality', () => {
    it('should preserve low-cardinality dimensions', async () => {
      const metric: CloudWatchMetricSignal = {
        namespace: 'OPX/ControlPlane',
        metricName: 'IncidentCreated',
        dimensions: {
          service: 'payment-service',
          severity: 'SEV2',
          operation: 'createIncident',
        },
        timestamp: '2026-01-15T10:30:00.000Z',
        value: 1,
        unit: 'Count',
        statistic: 'Sum',
      };

      const result = await service.ingestCloudWatchMetric(metric);

      expect(result.signal?.dimensions).toEqual({
        service: 'payment-service',
        severity: 'SEV2',
        operation: 'createIncident',
      });
    });

    it('should NOT include high-cardinality fields in dimensions', async () => {
      const log: StructuredLogSignal = {
        level: 'ERROR',
        timestamp: '2026-01-15T10:40:00.000Z',
        message: 'Operation failed',
        requestId: '550e8400-e29b-41d4-a716-446655440000', // High-cardinality
        correlationId: '660f9500-f39c-52e5-b827-557766551111', // High-cardinality
        operation: 'writeEvent',
        service: 'opx-control-plane',
      };

      const result = await service.ingestStructuredLog(log);

      // requestId and correlationId should NOT be in dimensions
      expect(result.signal?.dimensions).not.toHaveProperty('requestId');
      expect(result.signal?.dimensions).not.toHaveProperty('correlationId');
      
      // But should be in raw data
      expect(result.signal?.raw).toHaveProperty('requestId');
      expect(result.signal?.raw).toHaveProperty('correlationId');
    });
  });

  describe('EventBridge Events', () => {
    it('should ingest EventBridge event with severity from detail', async () => {
      const event: EventBridgeEventSignal = {
        id: '12345678-1234-1234-1234-123456789012',
        source: 'opx.control-plane',
        detailType: 'Incident State Changed',
        time: '2026-01-15T10:45:00.000Z',
        region: 'us-east-1',
        account: '123456789012',
        detail: {
          incidentId: 'INC-001',
          severity: 'SEV1',
          fromState: 'INVESTIGATING',
          toState: 'RESOLVED',
        },
      };

      const result = await service.ingestEventBridgeEvent(event);

      expect(result.success).toBe(true);
      expect(result.signal?.source).toBe('eventbridge-event');
      expect(result.signal?.severity).toBe('CRITICAL'); // SEV1 → CRITICAL
    });

    it('should default to INFO severity if no severity in detail', async () => {
      const event: EventBridgeEventSignal = {
        id: '12345678-1234-1234-1234-123456789012',
        source: 'opx.control-plane',
        detailType: 'Health Check',
        time: '2026-01-15T10:45:00.000Z',
        region: 'us-east-1',
        account: '123456789012',
        detail: {
          status: 'healthy',
        },
      };

      const result = await service.ingestEventBridgeEvent(event);

      expect(result.success).toBe(true);
      expect(result.signal?.severity).toBe('INFO');
    });
  });
});
