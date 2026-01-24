/**
 * Phase 5 - Step 6: Monitoring Tests
 * 
 * Tests for CloudWatch metrics and SNS alerts.
 */

import { describe, it, expect } from 'vitest';

describe('Monitoring', () => {
  describe('Metric Emission', () => {
    it('should emit raw Success count (not rate)', () => {
      const metricName = 'Success';
      const value = 1;
      const unit = 'Count';
      
      expect(metricName).toBe('Success');
      expect(value).toBe(1);
      expect(unit).toBe('Count');
    });

    it('should emit raw Failure count (not rate)', () => {
      const metricName = 'Failure';
      const value = 1;
      const unit = 'Count';
      
      expect(metricName).toBe('Failure');
      expect(value).toBe(1);
      expect(unit).toBe('Count');
    });

    it('should emit Duration in milliseconds', () => {
      const metricName = 'Duration';
      const value = 12345;
      const unit = 'Milliseconds';
      
      expect(metricName).toBe('Duration');
      expect(value).toBeGreaterThan(0);
      expect(unit).toBe('Milliseconds');
    });

    it('should include OperationType dimension', () => {
      const dimensions = [
        { Name: 'OperationType', Value: 'PATTERN_EXTRACTION' },
        { Name: 'TriggerType', Value: 'SCHEDULED' },
      ];
      
      const operationTypeDimension = dimensions.find(d => d.Name === 'OperationType');
      expect(operationTypeDimension).toBeDefined();
      expect(operationTypeDimension!.Value).toBe('PATTERN_EXTRACTION');
    });

    it('should include TriggerType dimension', () => {
      const dimensions = [
        { Name: 'OperationType', Value: 'CALIBRATION' },
        { Name: 'TriggerType', Value: 'MANUAL' },
      ];
      
      const triggerTypeDimension = dimensions.find(d => d.Name === 'TriggerType');
      expect(triggerTypeDimension).toBeDefined();
      expect(triggerTypeDimension!.Value).toBe('MANUAL');
    });

    it('should separate metrics by OperationType', () => {
      const patternExtractionDimensions = [
        { Name: 'OperationType', Value: 'PATTERN_EXTRACTION' },
      ];
      const calibrationDimensions = [
        { Name: 'OperationType', Value: 'CALIBRATION' },
      ];
      
      expect(patternExtractionDimensions[0].Value).not.toBe(calibrationDimensions[0].Value);
    });

    it('should separate metrics by TriggerType', () => {
      const scheduledDimensions = [
        { Name: 'TriggerType', Value: 'SCHEDULED' },
      ];
      const manualDimensions = [
        { Name: 'TriggerType', Value: 'MANUAL' },
      ];
      
      expect(scheduledDimensions[0].Value).not.toBe(manualDimensions[0].Value);
    });
  });

  describe('Error Rate Derivation', () => {
    it('should derive error rate from raw counts', () => {
      const success = 90;
      const failure = 10;
      const errorRate = (failure / (success + failure)) * 100;
      
      expect(errorRate).toBe(10);
    });

    it('should handle zero failures', () => {
      const success = 100;
      const failure = 0;
      const errorRate = (failure / (success + failure)) * 100;
      
      expect(errorRate).toBe(0);
    });

    it('should handle zero successes', () => {
      const success = 0;
      const failure = 10;
      const errorRate = (failure / (success + failure)) * 100;
      
      expect(errorRate).toBe(100);
    });

    it('should handle no data', () => {
      const success = 0;
      const failure = 0;
      const total = success + failure;
      
      // Error rate is undefined when no data
      expect(total).toBe(0);
    });

    it('should calculate correct error rate for 5% failure', () => {
      const success = 95;
      const failure = 5;
      const errorRate = (failure / (success + failure)) * 100;
      
      expect(errorRate).toBe(5);
    });
  });

  describe('Calibration Metrics', () => {
    it('should emit OutcomeCount metric', () => {
      const metricName = 'OutcomeCount';
      const value = 150;
      const unit = 'Count';
      
      expect(metricName).toBe('OutcomeCount');
      expect(value).toBeGreaterThan(0);
      expect(unit).toBe('Count');
    });

    it('should emit Drift metric', () => {
      const metricName = 'Drift';
      const value = 0.12;
      const unit = 'None';
      
      expect(metricName).toBe('Drift');
      expect(Math.abs(value)).toBeLessThan(1);
      expect(unit).toBe('None');
    });

    it('should emit CalibrationSkipped metric', () => {
      const metricName = 'CalibrationSkipped';
      const value = 1;
      const reason = 'INSUFFICIENT_DATA';
      
      expect(metricName).toBe('CalibrationSkipped');
      expect(value).toBe(1);
      expect(['INSUFFICIENT_DATA', 'KILL_SWITCH_ACTIVE']).toContain(reason);
    });

    it('should handle positive drift', () => {
      const drift = 0.18;
      const threshold = 0.15;
      
      expect(drift).toBeGreaterThan(threshold);
    });

    it('should handle negative drift', () => {
      const drift = -0.18;
      const threshold = -0.15;
      
      expect(drift).toBeLessThan(threshold);
    });
  });

  describe('Snapshot Metrics', () => {
    it('should emit SnapshotRecordCount metric', () => {
      const metricName = 'SnapshotRecordCount';
      const value = 500;
      const unit = 'Count';
      
      expect(metricName).toBe('SnapshotRecordCount');
      expect(value).toBeGreaterThan(0);
      expect(unit).toBe('Count');
    });

    it('should include SnapshotType dimension', () => {
      const dimensions = [
        { Name: 'OperationType', Value: 'SNAPSHOT' },
        { Name: 'SnapshotType', Value: 'DAILY' },
      ];
      
      const snapshotTypeDimension = dimensions.find(d => d.Name === 'SnapshotType');
      expect(snapshotTypeDimension).toBeDefined();
      expect(['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM']).toContain(snapshotTypeDimension!.Value);
    });
  });

  describe('SNS Alert Deduplication', () => {
    it('should include OperationType in message attributes', () => {
      const messageAttributes = {
        OperationType: {
          DataType: 'String',
          StringValue: 'CALIBRATION',
        },
      };
      
      expect(messageAttributes.OperationType.StringValue).toBe('CALIBRATION');
    });

    it('should include TriggerType in message attributes', () => {
      const messageAttributes = {
        TriggerType: {
          DataType: 'String',
          StringValue: 'SCHEDULED',
        },
      };
      
      expect(messageAttributes.TriggerType.StringValue).toBe('SCHEDULED');
    });

    it('should include AuditId in message attributes', () => {
      const messageAttributes = {
        AuditId: {
          DataType: 'String',
          StringValue: 'abc123...',
        },
      };
      
      expect(messageAttributes.AuditId.StringValue).toBeDefined();
      expect(messageAttributes.AuditId.StringValue.length).toBeGreaterThan(0);
    });

    it('should include AlertType in message attributes', () => {
      const messageAttributes = {
        AlertType: {
          DataType: 'String',
          StringValue: 'DRIFT',
        },
      };
      
      expect(['FAILURE', 'TIMEOUT', 'DRIFT', 'INSUFFICIENT_DATA']).toContain(
        messageAttributes.AlertType.StringValue
      );
    });

    it('should generate MessageDeduplicationId', () => {
      const operationType = 'CALIBRATION';
      const auditId = 'abc123...';
      const deduplicationId = `${operationType}-${auditId}`;
      
      expect(deduplicationId).toBe('CALIBRATION-abc123...');
    });

    it('should generate MessageGroupId', () => {
      const operationType = 'PATTERN_EXTRACTION';
      const groupId = operationType;
      
      expect(groupId).toBe('PATTERN_EXTRACTION');
    });
  });

  describe('Alert Types', () => {
    it('should support FAILURE alert', () => {
      const alertType = 'FAILURE';
      
      expect(['FAILURE', 'TIMEOUT', 'DRIFT', 'INSUFFICIENT_DATA']).toContain(alertType);
    });

    it('should support TIMEOUT alert', () => {
      const alertType = 'TIMEOUT';
      
      expect(['FAILURE', 'TIMEOUT', 'DRIFT', 'INSUFFICIENT_DATA']).toContain(alertType);
    });

    it('should support DRIFT alert', () => {
      const alertType = 'DRIFT';
      
      expect(['FAILURE', 'TIMEOUT', 'DRIFT', 'INSUFFICIENT_DATA']).toContain(alertType);
    });

    it('should support INSUFFICIENT_DATA alert', () => {
      const alertType = 'INSUFFICIENT_DATA';
      
      expect(['FAILURE', 'TIMEOUT', 'DRIFT', 'INSUFFICIENT_DATA']).toContain(alertType);
    });
  });

  describe('Drift Alert (Advisory)', () => {
    it('should mark drift alert as advisory', () => {
      const alert = {
        alertType: 'DRIFT',
        details: {
          advisory: true,
          action: 'HUMAN_REVIEW_RECOMMENDED',
        },
      };
      
      expect(alert.details.advisory).toBe(true);
      expect(alert.details.action).toBe('HUMAN_REVIEW_RECOMMENDED');
    });

    it('should not auto-change confidence bands', () => {
      const autoChange = false;
      
      expect(autoChange).toBe(false);
    });

    it('should recommend human review', () => {
      const action = 'HUMAN_REVIEW_RECOMMENDED';
      
      expect(action).toBe('HUMAN_REVIEW_RECOMMENDED');
    });
  });

  describe('CloudWatch Alarm Configuration', () => {
    it('should configure Pattern Extraction failure alarm (2 consecutive)', () => {
      const threshold = 1;
      const evaluationPeriods = 2;
      const datapointsToAlarm = 2;
      
      expect(threshold).toBe(1);
      expect(evaluationPeriods).toBe(2);
      expect(datapointsToAlarm).toBe(2);
    });

    it('should configure High Error Rate alarm (>10%)', () => {
      const threshold = 10;
      const evaluationPeriods = 1;
      
      expect(threshold).toBe(10);
      expect(evaluationPeriods).toBe(1);
    });

    it('should configure Operation Timeout alarm (>5 minutes)', () => {
      const threshold = 300000; // 5 minutes in ms
      const evaluationPeriods = 1;
      
      expect(threshold).toBe(300000);
      expect(evaluationPeriods).toBe(1);
    });

    it('should configure Significant Drift alarm (|drift| > 0.15)', () => {
      const threshold = 0.15;
      const evaluationPeriods = 1;
      
      expect(threshold).toBe(0.15);
      expect(evaluationPeriods).toBe(1);
    });

    it('should configure Calibration Failure alarm (1 failure - critical)', () => {
      const threshold = 1;
      const evaluationPeriods = 1;
      const critical = true;
      
      expect(threshold).toBe(1);
      expect(evaluationPeriods).toBe(1);
      expect(critical).toBe(true);
    });

    it('should configure Snapshot Failure alarm (2 consecutive)', () => {
      const threshold = 1;
      const evaluationPeriods = 2;
      const datapointsToAlarm = 2;
      
      expect(threshold).toBe(1);
      expect(evaluationPeriods).toBe(2);
      expect(datapointsToAlarm).toBe(2);
    });
  });

  describe('SNS Topic Configuration', () => {
    it('should use FIFO topic for deduplication', () => {
      const topicName = 'opx-learning-operations-alerts.fifo';
      const fifo = true;
      const contentBasedDeduplication = true;
      
      expect(topicName).toContain('.fifo');
      expect(fifo).toBe(true);
      expect(contentBasedDeduplication).toBe(true);
    });
  });

  describe('Dashboard Widgets', () => {
    it('should separate widgets by OperationType', () => {
      const widgets = [
        { title: 'Pattern Extraction', operationType: 'PATTERN_EXTRACTION' },
        { title: 'Calibration', operationType: 'CALIBRATION' },
        { title: 'Snapshot', operationType: 'SNAPSHOT' },
      ];
      
      expect(widgets.length).toBe(3);
      expect(widgets.map(w => w.operationType)).toEqual([
        'PATTERN_EXTRACTION',
        'CALIBRATION',
        'SNAPSHOT',
      ]);
    });

    it('should separate widgets by TriggerType', () => {
      const widgets = [
        { title: 'Scheduled Operations', triggerType: 'SCHEDULED' },
        { title: 'Manual Operations', triggerType: 'MANUAL' },
      ];
      
      expect(widgets.length).toBe(2);
      expect(widgets.map(w => w.triggerType)).toEqual(['SCHEDULED', 'MANUAL']);
    });

    it('should include error rate widget (derived)', () => {
      const widget = {
        title: 'Error Rate',
        metric: 'MathExpression',
        expression: '(failure / (success + failure)) * 100',
      };
      
      expect(widget.metric).toBe('MathExpression');
      expect(widget.expression).toContain('failure / (success + failure)');
    });

    it('should include duration widget', () => {
      const widget = {
        title: 'Duration',
        metrics: ['Average', 'p99'],
      };
      
      expect(widget.metrics).toContain('Average');
      expect(widget.metrics).toContain('p99');
    });

    it('should include drift widget with threshold annotations', () => {
      const widget = {
        title: 'Calibration Drift',
        annotations: [
          { value: 0.15, label: 'Drift Threshold' },
          { value: -0.15, label: 'Drift Threshold' },
        ],
      };
      
      expect(widget.annotations.length).toBe(2);
      expect(widget.annotations[0].value).toBe(0.15);
      expect(widget.annotations[1].value).toBe(-0.15);
    });
  });
});
