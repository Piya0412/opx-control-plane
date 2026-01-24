/**
 * Signal Normalizer
 * 
 * Phase 2.1: Signal Ingestion
 * 
 * Normalizes CloudWatch alarms to SignalEvent format.
 * 
 * RULES:
 * - No "helpful" defaults
 * - No magic service name inference
 * - No auto-correction of malformed signals
 * - No heuristic severity normalization
 * - If input is wrong → return null → caller logs and drops
 * 
 * Truth beats completeness.
 */

import type { SignalEvent, SignalSeverity, NormalizedSeverity } from './signal-event.schema';
import { SignalEventSchema, normalizeSignalSeverity } from './signal-event.schema';
import { computeSignalId, computeIdentityWindow } from './signal-id';

/**
 * CloudWatch Alarm SNS notification format
 */
export interface CloudWatchAlarmEvent {
  AlarmName: string;
  AlarmDescription?: string;
  AWSAccountId: string;
  NewStateValue: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA';
  NewStateReason: string;
  StateChangeTime: string; // ISO 8601
  Region: string;
  AlarmArn: string;
  OldStateValue?: string;
  Trigger?: {
    MetricName?: string;
    Namespace?: string;
    StatisticType?: string;
    Statistic?: string;
    Unit?: string | null;
    Dimensions?: Array<{ name: string; value: string }>;
    Period?: number;
    EvaluationPeriods?: number;
    ComparisonOperator?: string;
    Threshold?: number;
    TreatMissingData?: string;
    EvaluateLowSampleCountPercentile?: string;
  };
}

/**
 * Extract service name from alarm name
 * 
 * Expected format: <service>-<alarm-name>
 * Example: lambda-HighErrorRate → lambda
 * 
 * If format doesn't match, return null (no magic inference)
 */
function extractServiceFromAlarmName(alarmName: string): string | null {
  const parts = alarmName.split('-');
  if (parts.length < 2) {
    return null; // No service prefix
  }
  return parts[0];
}

/**
 * Extract severity from alarm name
 * 
 * Expected format: <service>-<severity>-<alarm-name>
 * Example: lambda-SEV2-HighErrorRate → SEV2
 * 
 * If format doesn't match, return null (no defaults)
 */
function extractSeverityFromAlarmName(alarmName: string): SignalSeverity | null {
  const parts = alarmName.split('-');
  if (parts.length < 3) {
    return null; // No severity in name
  }
  
  const severityCandidate = parts[1].toUpperCase();
  if (['SEV1', 'SEV2', 'SEV3', 'SEV4'].includes(severityCandidate)) {
    return severityCandidate as SignalSeverity;
  }
  
  return null; // Not a valid severity
}

export class SignalNormalizer {
  /**
   * Normalize CloudWatch alarm to SignalEvent
   * 
   * Returns null if:
   * - Alarm state is not ALARM
   * - Service cannot be extracted
   * - Severity cannot be extracted
   * - Schema validation fails
   * 
   * No defaults, no magic, no heuristics.
   */
  normalizeCloudWatchAlarm(event: CloudWatchAlarmEvent): SignalEvent | null {
    // Only process ALARM state (not OK or INSUFFICIENT_DATA)
    if (event.NewStateValue !== 'ALARM') {
      return null;
    }

    // Extract service from alarm name
    const service = extractServiceFromAlarmName(event.AlarmName);
    if (!service) {
      return null; // Cannot determine service
    }

    // Extract severity from alarm name
    const severity = extractSeverityFromAlarmName(event.AlarmName);
    if (!severity) {
      return null; // Cannot determine severity
    }

    // Compute temporal fields
    const observedAt = event.StateChangeTime;
    const identityWindow = computeIdentityWindow(observedAt);
    const ingestedAt = new Date().toISOString();

    // Build metadata (source-specific)
    const metadata = {
      alarmName: event.AlarmName,
      alarmDescription: event.AlarmDescription,
      alarmArn: event.AlarmArn,
      accountId: event.AWSAccountId,
      region: event.Region,
      newStateReason: event.NewStateReason,
      oldStateValue: event.OldStateValue,
      trigger: event.Trigger,
    };

    // Compute deterministic signalId
    const signalId = computeSignalId(
      'CLOUDWATCH_ALARM',
      'ALARM_STATE_CHANGE',
      service,
      severity,
      identityWindow,
      metadata
    );

    // Build signal
    const signal: SignalEvent = {
      signalId,
      source: 'CLOUDWATCH_ALARM',
      signalType: 'ALARM_STATE_CHANGE',
      service,
      severity,
      normalizedSeverity: normalizeSignalSeverity(severity),
      observedAt,
      identityWindow,
      metadata,
      ingestedAt,
    };

    // Validate schema
    const result = SignalEventSchema.safeParse(signal);
    if (!result.success) {
      return null; // Schema validation failed
    }

    return result.data;
  }
}
