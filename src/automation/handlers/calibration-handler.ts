/**
 * Phase 5 - Step 3: Calibration Handler
 * 
 * Lambda handler for automated confidence calibration.
 * 
 * MANDATORY FIXES APPLIED:
 * - FIX 3.1: Calibration window = previous full calendar month (bounded)
 * - FIX 3.2: Fail closed on insufficient data (<30 outcomes)
 * - FIX 3.3: Drift alerts are advisory only (no auto-changes)
 * 
 * GLOBAL INVARIANTS:
 * - Audit before work
 * - Calendar-correct windows only
 * - No unbounded scans
 * - Kill switch respected
 * - Retry wrapper applied
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { ConfidenceCalibrator } from '../../learning/confidence-calibrator';
import { CalibrationStore } from '../../learning/calibration-store';
import { OutcomeStore } from '../../learning/outcome-store';
import { AutomationAuditStore } from '../automation-audit-store';
import { computeAuditId } from '../audit-id.js';
import { withRetry } from '../retry';
import type { Authority } from '../../promotion/authority.schema';

// CONSTANTS
const MINIMUM_OUTCOMES_FOR_CALIBRATION = 30;
const DRIFT_THRESHOLD = 0.15;
const VERSION = '1.0.0';

// Environment variables
const OUTCOME_TABLE_NAME = process.env.OUTCOME_TABLE_NAME!;
const CALIBRATION_TABLE_NAME = process.env.CALIBRATION_TABLE_NAME!;
const AUDIT_TABLE_NAME = process.env.AUDIT_TABLE_NAME!;
const CONFIG_TABLE_NAME = process.env.CONFIG_TABLE_NAME || 'opx-automation-config';
const ALERT_TOPIC_ARN = process.env.ALERT_TOPIC_ARN;

// AWS clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const cloudwatchClient = new CloudWatchClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const snsClient = new SNSClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

// Stores
const outcomeStore = new OutcomeStore(dynamoClient, OUTCOME_TABLE_NAME);
const calibrationStore = new CalibrationStore(dynamoClient, CALIBRATION_TABLE_NAME);
const auditStore = new AutomationAuditStore(dynamoClient, AUDIT_TABLE_NAME);
const calibrator = new ConfidenceCalibrator(outcomeStore, calibrationStore);

/**
 * Calibration event from EventBridge
 */
interface CalibrationEvent {
  detail?: {
    startDate?: string;
    endDate?: string;
  };
  requestContext?: {
    identity?: {
      userArn?: string;
    };
  };
}

/**
 * Calibration result
 */
interface CalibrationResult {
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  auditId: string;
  reason?: string;
  calibrationId?: string;
  driftDetected?: boolean;
}

/**
 * Lambda handler
 */
export async function handler(event: CalibrationEvent): Promise<CalibrationResult> {
  const startTime = new Date().toISOString();
  const triggerType = event.requestContext ? 'MANUAL' : 'SCHEDULED';
  
  // Extract authority (default to SYSTEM for scheduled)
  const authority: Authority = event.requestContext
    ? { type: 'HUMAN_OPERATOR', identifier: event.requestContext.identity?.userArn || 'unknown' }
    : { type: 'SYSTEM', identifier: 'calibration-scheduler' };
  
  // Generate audit ID
  const auditId = computeAuditId('CALIBRATION', startTime, VERSION);
  
  try {
    // FIX 3.1: Get bounded calibration window (previous month)
    const { startDate, endDate } = event.detail?.startDate && event.detail?.endDate
      ? { startDate: event.detail.startDate, endDate: event.detail.endDate }
      : getCalibrationWindow();
    
    // GLOBAL INVARIANT: Check kill switch FIRST
    const killSwitchActive = await isKillSwitchActive();
    
    // GLOBAL INVARIANT: Write audit IMMEDIATELY (even if blocked)
    if (killSwitchActive) {
      await auditStore.recordAudit({
        auditId,
        operationType: 'CALIBRATION',
        triggerType,
        startTime,
        endTime: new Date().toISOString(),
        status: 'SUCCESS', // Not a failure - intentional skip
        parameters: { startDate, endDate },
        results: {
          skipped: 'KILL_SWITCH_ACTIVE',
          killSwitchCheckedAt: new Date().toISOString(),
        },
        triggeredBy: authority,
        version: VERSION,
      });
      
      // Emit metric
      await emitMetric('KillSwitchBlocked', 1, triggerType);
      
      return { status: 'SKIPPED', auditId, reason: 'KILL_SWITCH_ACTIVE' };
    }
    
    // GLOBAL INVARIANT: Write audit for actual work (BEFORE long work)
    await auditStore.recordAudit({
      auditId,
      operationType: 'CALIBRATION',
      triggerType,
      startTime,
      endTime: startTime, // Will be updated later
      status: 'RUNNING',
      parameters: { startDate, endDate },
      results: {},
      triggeredBy: authority,
      version: VERSION,
    });
    
    // FIX 3.2: Check data sufficiency BEFORE calibration
    const outcomes = await outcomeStore.listOutcomes({ startDate, endDate });
    
    if (outcomes.length < MINIMUM_OUTCOMES_FOR_CALIBRATION) {
      // Fail closed on insufficient data
      const endTime = new Date().toISOString();
      
      await auditStore.updateAuditStatus(auditId, 'FAILED', {
        skipped: 'INSUFFICIENT_DATA',
        outcomesFound: outcomes.length,
        minimumRequired: MINIMUM_OUTCOMES_FOR_CALIBRATION,
        duration: new Date(endTime).getTime() - new Date(startTime).getTime(),
      });
      
      // Emit metric
      await emitMetric('CalibrationSkipped', 1, triggerType, 'INSUFFICIENT_DATA');
      await emitMetric('Failure', 1, triggerType);
      
      return {
        status: 'FAILED',
        auditId,
        reason: 'INSUFFICIENT_DATA',
      };
    }
    
    // Execute calibration with retry wrapper
    const calibration = await withRetry(
      () => calibrator.calibrateConfidence(startDate, endDate),
      {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 60000,
        backoffMultiplier: 2,
      }
    );
    
    const endTime = new Date().toISOString();
    const duration = new Date(endTime).getTime() - new Date(startTime).getTime();
    
    // FIX 3.3: Check for significant drift (advisory only)
    let driftDetected = false;
    for (const bandCalibration of calibration.bandCalibrations) {
      if (Math.abs(bandCalibration.drift) > DRIFT_THRESHOLD) {
        driftDetected = true;
        
        // MUST notify humans
        if (ALERT_TOPIC_ARN) {
          await notifyDriftAlert(bandCalibration, calibration.calibrationId);
        }
      }
    }
    
    // Update audit with SUCCESS (drift does NOT cascade failures)
    await auditStore.updateAuditStatus(auditId, 'SUCCESS', {
      calibrationId: calibration.calibrationId,
      outcomesProcessed: outcomes.length,
      bandsCalibrated: calibration.bandCalibrations.length,
      driftDetected,
      maxDrift: calibration.driftAnalysis.maxDrift,
      duration,
    });
    
    // Emit metrics
    await emitMetric('Success', 1, triggerType);
    await emitMetric('Duration', duration, triggerType);
    await emitMetric('RecordsProcessed', outcomes.length, triggerType);
    
    if (driftDetected) {
      await emitMetric('DriftDetected', 1, triggerType);
    }
    
    return {
      status: 'SUCCESS',
      auditId,
      calibrationId: calibration.calibrationId,
      driftDetected,
    };
    
  } catch (error: any) {
    const endTime = new Date().toISOString();
    const duration = new Date(endTime).getTime() - new Date(startTime).getTime();
    
    // Update audit with failure
    await auditStore.updateAuditStatus(auditId, 'FAILED', {
      errorMessage: error.message,
      errorStack: error.stack,
      duration,
    });
    
    // Emit metrics
    await emitMetric('Failure', 1, triggerType);
    
    throw error;
  }
}

/**
 * FIX 3.1: Get calibration window (previous full calendar month)
 * 
 * REQUIRED INVARIANT: CalibrationWindow = PreviousMonth(UTC)
 */
export function getCalibrationWindow(now: Date = new Date()): { startDate: string; endDate: string } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-11
  
  // Previous month start: 1st day, 00:00:00
  const startDate = new Date(Date.UTC(
    month === 0 ? year - 1 : year,
    month === 0 ? 11 : month - 1,
    1, 0, 0, 0, 0
  ));
  
  // Previous month end: Last day, 23:59:59.999
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

/**
 * Check if kill switch is active
 */
async function isKillSwitchActive(): Promise<boolean> {
  try {
    const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
    const docClient = await import('@aws-sdk/lib-dynamodb').then(m => m.DynamoDBDocumentClient.from(dynamoClient));
    
    const result = await docClient.send(
      new GetCommand({
        TableName: CONFIG_TABLE_NAME,
        Key: {
          PK: 'CONFIG#KILL_SWITCH',
          SK: 'METADATA',
        },
      })
    );
    
    // If no record exists, kill switch is OFF (safe default)
    if (!result.Item) {
      return false;
    }
    
    // Kill switch is ACTIVE if enabled = false
    return result.Item.enabled === false;
  } catch (error) {
    // On error, assume kill switch is OFF (fail-open for kill switch check)
    console.error('Kill switch check failed, assuming OFF', error);
    return false;
  }
}

/**
 * FIX 3.3: Notify drift alert (advisory only)
 */
async function notifyDriftAlert(
  bandCalibration: any,
  calibrationId: string
): Promise<void> {
  try {
    await snsClient.send(
      new PublishCommand({
        TopicArn: ALERT_TOPIC_ARN,
        Subject: 'Significant Confidence Drift Detected',
        Message: JSON.stringify({
          calibrationId,
          band: bandCalibration.band,
          drift: bandCalibration.drift,
          predicted: bandCalibration.expectedAccuracy,
          actual: bandCalibration.accuracy,
          recommendation: 'Review confidence factors',
          action: 'ADVISORY_ONLY', // EXPLICIT: No auto-changes
        }, null, 2),
        MessageAttributes: {
          OperationType: {
            DataType: 'String',
            StringValue: 'CALIBRATION',
          },
          AlarmType: {
            DataType: 'String',
            StringValue: 'DRIFT_DETECTED',
          },
          CalibrationId: {
            DataType: 'String',
            StringValue: calibrationId,
          },
        },
      })
    );
  } catch (error) {
    console.error('Failed to send drift alert', error);
    // Don't throw - drift alerts are advisory, not critical
  }
}

/**
 * Emit CloudWatch metric
 */
async function emitMetric(
  metricName: string,
  value: number,
  triggerType: string,
  reason?: string
): Promise<void> {
  try {
    const dimensions = [
      { Name: 'OperationType', Value: 'CALIBRATION' },
      { Name: 'TriggerType', Value: triggerType },
    ];
    
    if (reason) {
      dimensions.push({ Name: 'Reason', Value: reason });
    }
    
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: 'LearningOperations',
        MetricData: [{
          MetricName: metricName,
          Value: value,
          Unit: metricName === 'Duration' ? 'Milliseconds' : 'Count',
          Dimensions: dimensions,
          Timestamp: new Date(),
        }],
      })
    );
  } catch (error) {
    console.error('Failed to emit metric', error);
    // Don't throw - metrics are best-effort
  }
}
