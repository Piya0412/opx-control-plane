/**
 * CP-1: Signal Ingestion Contract
 * 
 * Defines the canonical signal schema and ingestion contracts for Phase 2.
 * All signals (CloudWatch metrics, structured logs, EventBridge events) 
 * normalize into this schema.
 * 
 * INVARIANTS:
 * - All signals are immutable once ingested
 * - All signals preserve raw source data
 * - All signals have deterministic IDs
 * - No lossy transformations
 */

import { z } from 'zod';

/**
 * Signal Source Types
 * Bounded set - low cardinality for metrics
 */
export const SignalSourceSchema = z.enum([
  'cloudwatch-metric',
  'cloudwatch-alarm',
  'cloudwatch-log',
  'eventbridge-event',
  'api-request',
  'health-probe',
]);

export type SignalSource = z.infer<typeof SignalSourceSchema>;

/**
 * Signal Severity
 * Maps to incident severity for alarm-triggered signals
 */
export const SignalSeveritySchema = z.enum([
  'CRITICAL',  // SEV1 equivalent
  'HIGH',      // SEV2 equivalent
  'MEDIUM',    // SEV3 equivalent
  'LOW',       // SEV4 equivalent
  'INFO',      // Informational only
]);

export type SignalSeverity = z.infer<typeof SignalSeveritySchema>;

/**
 * Signal Confidence
 * Deterministic confidence based on signal source and validation
 * NOT ML-based, purely rule-based
 */
export const SignalConfidenceSchema = z.enum([
  'DEFINITIVE',   // 1.0 - Direct alarm, validated metric
  'HIGH',         // 0.8 - Structured log with schema validation
  'MEDIUM',       // 0.6 - Unstructured but parseable
  'LOW',          // 0.4 - Partial data, missing fields
]);

export type SignalConfidence = z.infer<typeof SignalConfidenceSchema>;

/**
 * Evidence Item
 * Structured evidence attached to signal
 * Preserves raw data with typed interpretation
 */
export const EvidenceItemSchema = z.object({
  type: z.enum([
    'metric-datapoint',
    'log-entry',
    'alarm-state-change',
    'event-payload',
    'api-response',
    'probe-result',
  ]),
  timestamp: z.string().datetime(), // ISO 8601
  raw: z.record(z.unknown()),       // Raw source data (immutable)
  interpreted: z.record(z.unknown()).optional(), // Typed interpretation
  checksum: z.string(),             // SHA256 of raw data
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

/**
 * Canonical Signal Schema
 * All ingested signals normalize to this structure
 * 
 * RULES:
 * - signalId MUST be deterministic (hash of source + timestamp + type)
 * - timestamp MUST be ISO 8601 with millisecond precision
 * - raw MUST contain complete source payload
 * - evidence MUST be append-only (no updates)
 */
export const SignalSchema = z.object({
  // Identity
  signalId: z.string().min(1),           // Deterministic ID
  signalType: z.string().min(1),         // Specific signal type (e.g., "lambda-error-rate")
  source: SignalSourceSchema,            // Source category
  
  // Temporal
  timestamp: z.string().datetime(),      // Signal occurrence time (ISO 8601)
  ingestedAt: z.string().datetime(),     // Ingestion time (ISO 8601)
  
  // Classification
  severity: SignalSeveritySchema,
  confidence: SignalConfidenceSchema,
  
  // Content
  title: z.string().min(1),              // Human-readable title
  description: z.string().optional(),    // Detailed description
  
  // Evidence Chain
  evidence: z.array(EvidenceItemSchema).min(1), // At least one evidence item
  
  // Traceability
  raw: z.record(z.unknown()),            // Complete raw source data
  rawChecksum: z.string(),               // SHA256 of raw data
  
  // Metadata
  dimensions: z.record(z.string()).optional(), // Low-cardinality dimensions only
  tags: z.record(z.string()).optional(),       // Additional tags
});

export type Signal = z.infer<typeof SignalSchema>;

/**
 * CloudWatch Metric Signal Contract
 * Ingestion contract for CloudWatch metrics
 */
export const CloudWatchMetricSignalSchema = z.object({
  namespace: z.string().min(1),
  metricName: z.string().min(1),
  dimensions: z.record(z.string()),      // Low-cardinality only
  timestamp: z.string().datetime(),
  value: z.number(),
  unit: z.string(),
  statistic: z.enum(['Sum', 'Average', 'Minimum', 'Maximum', 'SampleCount']),
});

export type CloudWatchMetricSignal = z.infer<typeof CloudWatchMetricSignalSchema>;

/**
 * CloudWatch Alarm Signal Contract
 * Ingestion contract for CloudWatch alarm state changes
 */
export const CloudWatchAlarmSignalSchema = z.object({
  alarmName: z.string().min(1),
  alarmArn: z.string().min(1),
  alarmDescription: z.string().optional(),
  newState: z.enum(['ALARM', 'OK', 'INSUFFICIENT_DATA']),
  oldState: z.enum(['ALARM', 'OK', 'INSUFFICIENT_DATA']),
  stateChangeTime: z.string().datetime(),
  stateReason: z.string(),
  stateReasonData: z.record(z.unknown()).optional(),
  metricNamespace: z.string().optional(),
  metricName: z.string().optional(),
  threshold: z.number().optional(),
  evaluationPeriods: z.number().optional(),
});

export type CloudWatchAlarmSignal = z.infer<typeof CloudWatchAlarmSignalSchema>;

/**
 * Structured Log Signal Contract
 * Ingestion contract for JSON structured logs
 */
export const StructuredLogSignalSchema = z.object({
  level: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']),
  timestamp: z.string().datetime(),
  message: z.string().min(1),
  requestId: z.string().optional(),      // High-cardinality - logs only
  correlationId: z.string().optional(),  // High-cardinality - logs only
  operation: z.string().optional(),
  service: z.string().optional(),
  error: z.object({
    name: z.string(),
    message: z.string(),
    stack: z.string().optional(),
  }).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type StructuredLogSignal = z.infer<typeof StructuredLogSignalSchema>;

/**
 * EventBridge Event Signal Contract
 * Ingestion contract for EventBridge events
 */
export const EventBridgeEventSignalSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  detailType: z.string().min(1),
  time: z.string().datetime(),
  region: z.string(),
  account: z.string(),
  detail: z.record(z.unknown()),
});

export type EventBridgeEventSignal = z.infer<typeof EventBridgeEventSignalSchema>;

/**
 * Signal Ingestion Result
 * Result of signal ingestion operation
 */
export const SignalIngestionResultSchema = z.object({
  success: z.boolean(),
  signalId: z.string().optional(),
  signal: SignalSchema.optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }).optional(),
  validationErrors: z.array(z.object({
    path: z.string(),
    message: z.string(),
  })).optional(),
});

export type SignalIngestionResult = z.infer<typeof SignalIngestionResultSchema>;

/**
 * Signal Ingestion Metrics
 * Metrics emitted during signal ingestion
 * LOW CARDINALITY ONLY
 */
export interface SignalIngestionMetrics {
  'signal.ingested': {
    dimensions: {
      source: SignalSource;
      signalType: string;  // Bounded set
      severity: SignalSeverity;
    };
    value: 1;
  };
  'signal.ingestion.failed': {
    dimensions: {
      source: SignalSource;
      errorCode: string;   // Bounded set
    };
    value: 1;
  };
  'signal.ingestion.latency': {
    dimensions: {
      source: SignalSource;
    };
    value: number; // milliseconds
  };
  'signal.validation.failed': {
    dimensions: {
      source: SignalSource;
      validationType: string; // Bounded set
    };
    value: 1;
  };
}
