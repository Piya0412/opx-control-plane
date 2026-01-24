/**
 * CP-1: Signal Ingestion Layer
 * 
 * Ingests signals from various sources and normalizes them into canonical schema.
 * 
 * INVARIANTS:
 * - All ingestion is deterministic (same input → same signal)
 * - All raw data is preserved (no lossy transforms)
 * - All signals have checksums for integrity verification
 * - Ingestion failures are logged but do NOT block source operations
 * 
 * HARD RULES:
 * - No metric math without raw preservation
 * - No log text parsing without schema validation
 * - No direct alarms → incidents mapping (goes through normalization)
 */

import { createHash } from 'crypto';
import {
  Signal,
  SignalSource,
  SignalSeverity,
  EvidenceItem,
  CloudWatchMetricSignal,
  EventBridgeEventSignal,
  CloudWatchMetricSignalSchema,
  CloudWatchAlarmSignalSchema,
  StructuredLogSignalSchema,
  EventBridgeEventSignalSchema,
  SignalIngestionResult,
} from './signal-types.js';

/**
 * Signal Ingestion Service
 * Normalizes signals from various sources into canonical schema
 */
export class SignalIngestionService {
  /**
   * Ingest CloudWatch Metric
   * 
   * @param metric - CloudWatch metric data
   * @returns Normalized signal or error
   */
  async ingestCloudWatchMetric(
    metric: unknown
  ): Promise<SignalIngestionResult> {
    const startTime = Date.now();

    try {
      // Validate schema
      const validated = CloudWatchMetricSignalSchema.parse(metric);

      // Compute deterministic signal ID
      const signalId = this.computeSignalId(
        'cloudwatch-metric',
        validated.namespace,
        validated.metricName,
        validated.timestamp
      );

      // Compute raw checksum
      const rawChecksum = this.computeChecksum(validated);

      // Create evidence
      const evidence: EvidenceItem = {
        type: 'metric-datapoint',
        timestamp: validated.timestamp,
        raw: validated as any,
        interpreted: {
          value: validated.value,
          unit: validated.unit,
          statistic: validated.statistic,
        },
        checksum: rawChecksum,
      };

      // Determine severity based on metric value and thresholds
      const severity = this.classifyMetricSeverity(validated);

      // Create normalized signal
      const signal: Signal = {
        signalId,
        signalType: `${validated.namespace}/${validated.metricName}`,
        source: 'cloudwatch-metric',
        timestamp: validated.timestamp,
        ingestedAt: new Date().toISOString(),
        severity,
        confidence: 'DEFINITIVE', // Metrics are definitive
        title: `${validated.metricName}: ${validated.value} ${validated.unit}`,
        description: `CloudWatch metric ${validated.metricName} in namespace ${validated.namespace}`,
        evidence: [evidence],
        raw: validated as any,
        rawChecksum,
        dimensions: validated.dimensions,
      };

      // Emit ingestion metric (non-blocking)
      this.emitIngestionMetric('signal.ingested', {
        source: 'cloudwatch-metric',
        signalType: signal.signalType,
        severity: signal.severity,
      });

      this.emitIngestionMetric('signal.ingestion.latency', {
        source: 'cloudwatch-metric',
      }, Date.now() - startTime);

      return {
        success: true,
        signalId,
        signal,
      };
    } catch (error) {
      return this.handleIngestionError(
        'cloudwatch-metric',
        error,
        startTime
      );
    }
  }

  /**
   * Ingest CloudWatch Alarm State Change
   * 
   * @param alarm - CloudWatch alarm state change
   * @returns Normalized signal or error
   */
  async ingestCloudWatchAlarm(
    alarm: unknown
  ): Promise<SignalIngestionResult> {
    const startTime = Date.now();

    try {
      // Validate schema
      const validated = CloudWatchAlarmSignalSchema.parse(alarm);

      // Only ingest ALARM state (not OK or INSUFFICIENT_DATA)
      if (validated.newState !== 'ALARM') {
        return {
          success: true,
          signalId: undefined,
          signal: undefined,
        };
      }

      // Compute deterministic signal ID
      const signalId = this.computeSignalId(
        'cloudwatch-alarm',
        validated.alarmName,
        validated.stateChangeTime,
        validated.newState
      );

      // Compute raw checksum
      const rawChecksum = this.computeChecksum(validated);

      // Create evidence
      const evidence: EvidenceItem = {
        type: 'alarm-state-change',
        timestamp: validated.stateChangeTime,
        raw: validated as any,
        interpreted: {
          alarmName: validated.alarmName,
          newState: validated.newState,
          oldState: validated.oldState,
          reason: validated.stateReason,
        },
        checksum: rawChecksum,
      };

      // Map alarm to severity
      const severity = this.mapAlarmToSeverity(validated.alarmName);

      // Create normalized signal
      const signal: Signal = {
        signalId,
        signalType: `alarm/${validated.alarmName}`,
        source: 'cloudwatch-alarm',
        timestamp: validated.stateChangeTime,
        ingestedAt: new Date().toISOString(),
        severity,
        confidence: 'DEFINITIVE', // Alarms are definitive
        title: `Alarm: ${validated.alarmName}`,
        description: validated.stateReason,
        evidence: [evidence],
        raw: validated as any,
        rawChecksum,
        tags: {
          alarmArn: validated.alarmArn,
          metricNamespace: validated.metricNamespace || '',
          metricName: validated.metricName || '',
        },
      };

      // Emit ingestion metric (non-blocking)
      this.emitIngestionMetric('signal.ingested', {
        source: 'cloudwatch-alarm',
        signalType: signal.signalType,
        severity: signal.severity,
      });

      this.emitIngestionMetric('signal.ingestion.latency', {
        source: 'cloudwatch-alarm',
      }, Date.now() - startTime);

      return {
        success: true,
        signalId,
        signal,
      };
    } catch (error) {
      return this.handleIngestionError(
        'cloudwatch-alarm',
        error,
        startTime
      );
    }
  }

  /**
   * Ingest Structured Log
   * 
   * @param log - Structured log entry (JSON only)
   * @returns Normalized signal or error
   */
  async ingestStructuredLog(
    log: unknown
  ): Promise<SignalIngestionResult> {
    const startTime = Date.now();

    try {
      // Validate schema (HARD RULE: no text parsing without schema validation)
      const validated = StructuredLogSignalSchema.parse(log);

      // Only ingest ERROR and FATAL logs
      if (validated.level !== 'ERROR' && validated.level !== 'FATAL') {
        return {
          success: true,
          signalId: undefined,
          signal: undefined,
        };
      }

      // Compute deterministic signal ID
      const signalId = this.computeSignalId(
        'cloudwatch-log',
        validated.operation || 'unknown',
        validated.timestamp,
        validated.level
      );

      // Compute raw checksum
      const rawChecksum = this.computeChecksum(validated);

      // Create evidence
      const evidence: EvidenceItem = {
        type: 'log-entry',
        timestamp: validated.timestamp,
        raw: validated as any,
        interpreted: {
          level: validated.level,
          message: validated.message,
          operation: validated.operation,
          error: validated.error,
        },
        checksum: rawChecksum,
      };

      // Map log level to severity
      const severity: SignalSeverity = validated.level === 'FATAL' ? 'CRITICAL' : 'HIGH';

      // Create normalized signal
      const signal: Signal = {
        signalId,
        signalType: `log/${validated.level}`,
        source: 'cloudwatch-log',
        timestamp: validated.timestamp,
        ingestedAt: new Date().toISOString(),
        severity,
        confidence: 'HIGH', // Structured logs are high confidence
        title: validated.message,
        description: validated.error?.message,
        evidence: [evidence],
        raw: validated as any,
        rawChecksum,
        dimensions: {
          service: validated.service || 'unknown',
          operation: validated.operation || 'unknown',
        },
      };

      // Emit ingestion metric (non-blocking)
      this.emitIngestionMetric('signal.ingested', {
        source: 'cloudwatch-log',
        signalType: signal.signalType,
        severity: signal.severity,
      });

      this.emitIngestionMetric('signal.ingestion.latency', {
        source: 'cloudwatch-log',
      }, Date.now() - startTime);

      return {
        success: true,
        signalId,
        signal,
      };
    } catch (error) {
      return this.handleIngestionError(
        'cloudwatch-log',
        error,
        startTime
      );
    }
  }

  /**
   * Ingest EventBridge Event
   * 
   * @param event - EventBridge event
   * @returns Normalized signal or error
   */
  async ingestEventBridgeEvent(
    event: unknown
  ): Promise<SignalIngestionResult> {
    const startTime = Date.now();

    try {
      // Validate schema
      const validated = EventBridgeEventSignalSchema.parse(event);

      // Compute deterministic signal ID
      const signalId = this.computeSignalId(
        'eventbridge-event',
        validated.source,
        validated.detailType,
        validated.time
      );

      // Compute raw checksum
      const rawChecksum = this.computeChecksum(validated);

      // Create evidence
      const evidence: EvidenceItem = {
        type: 'event-payload',
        timestamp: validated.time,
        raw: validated as any,
        interpreted: {
          source: validated.source,
          detailType: validated.detailType,
          detail: validated.detail,
        },
        checksum: rawChecksum,
      };

      // Classify severity from event detail
      const severity = this.classifyEventSeverity(validated);

      // Create normalized signal
      const signal: Signal = {
        signalId,
        signalType: `event/${validated.detailType}`,
        source: 'eventbridge-event',
        timestamp: validated.time,
        ingestedAt: new Date().toISOString(),
        severity,
        confidence: 'HIGH', // EventBridge events are high confidence
        title: validated.detailType,
        description: `EventBridge event from ${validated.source}`,
        evidence: [evidence],
        raw: validated as any,
        rawChecksum,
        tags: {
          eventSource: validated.source,
          region: validated.region,
          account: validated.account,
        },
      };

      // Emit ingestion metric (non-blocking)
      this.emitIngestionMetric('signal.ingested', {
        source: 'eventbridge-event',
        signalType: signal.signalType,
        severity: signal.severity,
      });

      this.emitIngestionMetric('signal.ingestion.latency', {
        source: 'eventbridge-event',
      }, Date.now() - startTime);

      return {
        success: true,
        signalId,
        signal,
      };
    } catch (error) {
      return this.handleIngestionError(
        'eventbridge-event',
        error,
        startTime
      );
    }
  }

  /**
   * Compute deterministic signal ID
   * Hash of source + key components + timestamp
   */
  private computeSignalId(...components: string[]): string {
    const input = components.join('|');
    return createHash('sha256').update(input).digest('hex');
  }

  /**
   * Compute checksum of raw data
   */
  private computeChecksum(data: unknown): string {
    const json = JSON.stringify(data, Object.keys(data as any).sort());
    return createHash('sha256').update(json).digest('hex');
  }

  /**
   * Classify metric severity based on value
   * Rule-based, not ML
   */
  private classifyMetricSeverity(_metric: CloudWatchMetricSignal): SignalSeverity {
    // Default to INFO for metrics (alarms will escalate)
    return 'INFO';
  }

  /**
   * Map alarm name to severity
   * Based on Phase 2 alarm mapping table
   */
  private mapAlarmToSeverity(alarmName: string): SignalSeverity {
    const severityMap: Record<string, SignalSeverity> = {
      'opx-eventstore-write-failure': 'CRITICAL',
      'opx-replay-integrity-failure': 'CRITICAL',
      'opx-lambda-error-rate': 'HIGH',
      'opx-dynamodb-throttle': 'HIGH',
      'opx-api-latency-p99': 'MEDIUM',
      'opx-invalid-transition-rate': 'MEDIUM',
      'opx-idempotency-conflict-rate': 'MEDIUM',
      'opx-incident-creation-rate': 'LOW',
    };

    return severityMap[alarmName] || 'MEDIUM';
  }

  /**
   * Classify event severity from detail
   * Rule-based extraction
   */
  private classifyEventSeverity(event: EventBridgeEventSignal): SignalSeverity {
    // Check detail for severity field
    const detail = event.detail as any;
    if (detail?.severity) {
      const severityMap: Record<string, SignalSeverity> = {
        'SEV1': 'CRITICAL',
        'SEV2': 'HIGH',
        'SEV3': 'MEDIUM',
        'SEV4': 'LOW',
      };
      return severityMap[detail.severity] || 'INFO';
    }

    return 'INFO';
  }

  /**
   * Handle ingestion error
   * SWALLOW - ingestion failures must not block source operations
   */
  private handleIngestionError(
    source: SignalSource,
    error: unknown,
    startTime: number
  ): SignalIngestionResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = this.classifyErrorCode(error);

    // Log error (swallowed)
    console.warn('Signal ingestion failed (swallowed)', {
      source,
      errorCode,
      error: errorMessage,
    });

    // Emit failure metric (non-blocking)
    this.emitIngestionMetric('signal.ingestion.failed', {
      source,
      errorCode,
    });

    this.emitIngestionMetric('signal.ingestion.latency', {
      source,
    }, Date.now() - startTime);

    return {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage,
      },
    };
  }

  /**
   * Classify error code for metrics
   * Bounded set for low cardinality
   */
  private classifyErrorCode(error: unknown): string {
    if (error instanceof Error) {
      if (error.name === 'ZodError') return 'VALIDATION_ERROR';
      if (error.message.includes('timeout')) return 'TIMEOUT';
      if (error.message.includes('network')) return 'NETWORK_ERROR';
    }
    return 'UNKNOWN_ERROR';
  }

  /**
   * Emit ingestion metric
   * NON-BLOCKING - failures are swallowed
   */
  private emitIngestionMetric(
    metricName: string,
    dimensions: Record<string, string>,
    value: number = 1
  ): void {
    try {
      // TODO: Implement EMF metric emission
      // For now, just log
      console.log('Metric (swallowed on failure)', {
        metricName,
        dimensions,
        value,
      });
    } catch (error) {
      // SWALLOW - metrics are observational only
      console.warn('Metric emission failed (swallowed)', {
        metricName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
