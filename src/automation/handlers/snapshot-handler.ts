/**
 * Phase 5 - Step 4: Snapshot Handler
 * 
 * Lambda handler for automated snapshot creation.
 * 
 * MANDATORY FIXES APPLIED:
 * - FIX 4.1: Snapshots are immutable (deterministic IDs, conditional writes)
 * - FIX 4.2: Retention policy explicit (Daily: 30d, Weekly: 84d, Monthly: forever)
 * 
 * GLOBAL INVARIANTS:
 * - Audit before work
 * - Calendar-correct windows only
 * - Snapshots are immutable
 * - Kill switch respected
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { SnapshotService } from '../../learning/snapshot-service';
import { SnapshotStore } from '../../learning/snapshot-store';
import { OutcomeStore } from '../../learning/outcome-store';
import { CalibrationStore } from '../../learning/calibration-store';
import { AutomationAuditStore } from '../automation-audit-store';
import { computeAuditId } from '../audit-id.js';
import { withRetry } from '../retry';
import type { Authority } from '../../promotion/authority.schema';
import type { SnapshotType } from '../../learning/snapshot.schema';

// FIX 4.2: EXPLICIT retention policy
const RETENTION_POLICY = {
  DAILY: 30,    // 30 days
  WEEKLY: 84,   // 12 weeks
  MONTHLY: null, // Forever (no TTL)
} as const;

const VERSION = '1.0.0';

// Environment variables
const OUTCOME_TABLE_NAME = process.env.OUTCOME_TABLE_NAME!;
const CALIBRATION_TABLE_NAME = process.env.CALIBRATION_TABLE_NAME!;
const SNAPSHOT_TABLE_NAME = process.env.SNAPSHOT_TABLE_NAME!;
const AUDIT_TABLE_NAME = process.env.AUDIT_TABLE_NAME!;
const CONFIG_TABLE_NAME = process.env.CONFIG_TABLE_NAME || 'opx-automation-config';

// AWS clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const cloudwatchClient = new CloudWatchClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

// Stores
const outcomeStore = new OutcomeStore(dynamoClient, OUTCOME_TABLE_NAME);
const calibrationStore = new CalibrationStore(dynamoClient, CALIBRATION_TABLE_NAME);
const snapshotStore = new SnapshotStore(dynamoClient, SNAPSHOT_TABLE_NAME);
const auditStore = new AutomationAuditStore(dynamoClient, AUDIT_TABLE_NAME);
const snapshotService = new SnapshotService(
  outcomeStore,
  snapshotStore,
  calibrationStore
);

/**
 * Snapshot event from EventBridge
 */
interface SnapshotEvent {
  detail?: {
    snapshotType?: SnapshotType;
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
 * Snapshot result
 */
interface SnapshotResult {
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  auditId: string;
  reason?: string;
  snapshotId?: string;
}

/**
 * Lambda handler
 */
export async function handler(event: SnapshotEvent): Promise<SnapshotResult> {
  const startTime = new Date().toISOString();
  const triggerType = event.requestContext ? 'MANUAL' : 'SCHEDULED';
  
  // Extract authority (default to SYSTEM for scheduled)
  const authority: Authority = event.requestContext
    ? { type: 'HUMAN_OPERATOR', identifier: event.requestContext.identity?.userArn || 'unknown' }
    : { type: 'SYSTEM', identifier: 'snapshot-scheduler' };
  
  // Generate audit ID
  const auditId = computeAuditId('SNAPSHOT', startTime, VERSION);
  
  try {
    // Determine snapshot type and date range
    const snapshotType = event.detail?.snapshotType || determineSnapshotType();
    const { startDate, endDate } = event.detail?.startDate && event.detail?.endDate
      ? { startDate: event.detail.startDate, endDate: event.detail.endDate }
      : getSnapshotWindow(snapshotType);
    
    // GLOBAL INVARIANT: Check kill switch FIRST
    const killSwitchActive = await isKillSwitchActive();
    
    // GLOBAL INVARIANT: Write audit IMMEDIATELY (even if blocked)
    if (killSwitchActive) {
      await auditStore.recordAudit({
        auditId,
        operationType: 'SNAPSHOT',
        triggerType,
        startTime,
        endTime: new Date().toISOString(),
        status: 'SUCCESS', // Not a failure - intentional skip
        parameters: { snapshotType, startDate, endDate },
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
      operationType: 'SNAPSHOT',
      triggerType,
      startTime,
      endTime: startTime, // Will be updated later
      status: 'RUNNING',
      parameters: { snapshotType, startDate, endDate },
      results: {},
      triggeredBy: authority,
      version: VERSION,
    });
    
    // Execute snapshot creation with retry wrapper
    const snapshot = await withRetry(
      () => snapshotService.createSnapshot(snapshotType, startDate, endDate),
      {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 60000,
        backoffMultiplier: 2,
      }
    );
    
    const endTime = new Date().toISOString();
    const duration = new Date(endTime).getTime() - new Date(startTime).getTime();
    
    // Update audit with SUCCESS
    await auditStore.updateAuditStatus(auditId, 'SUCCESS', {
      snapshotId: snapshot.snapshotId,
      snapshotType: snapshot.snapshotType,
      outcomesIncluded: snapshot.data.outcomes.length,
      summariesIncluded: snapshot.data.summaries.length,
      calibrationsIncluded: snapshot.data.calibrations.length,
      servicesIncluded: snapshot.data.services.length,
      duration,
    });
    
    // Emit metrics
    await emitMetric('Success', 1, triggerType, snapshotType);
    await emitMetric('Duration', duration, triggerType, snapshotType);
    await emitMetric('RecordsProcessed', snapshot.data.outcomes.length, triggerType, snapshotType);
    
    return {
      status: 'SUCCESS',
      auditId,
      snapshotId: snapshot.snapshotId,
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
 * Determine snapshot type from current time
 */
function determineSnapshotType(): SnapshotType {
  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday
  
  // Monthly: 1st of month
  if (dayOfMonth === 1) {
    return 'MONTHLY';
  }
  
  // Weekly: Sunday
  if (dayOfWeek === 0) {
    return 'WEEKLY';
  }
  
  // Daily: all other days
  return 'DAILY';
}

/**
 * Get snapshot window based on type
 */
export function getSnapshotWindow(
  snapshotType: SnapshotType,
  now: Date = new Date()
): { startDate: string; endDate: string } {
  switch (snapshotType) {
    case 'DAILY':
      return getDailyWindow(now);
    case 'WEEKLY':
      return getWeeklyWindow(now);
    case 'MONTHLY':
      return getMonthlyWindow(now);
    case 'CUSTOM':
      throw new Error('CUSTOM snapshot type requires explicit startDate and endDate');
    default:
      throw new Error(`Unknown snapshot type: ${snapshotType}`);
  }
}

/**
 * Get daily window (yesterday)
 */
export function getDailyWindow(now: Date = new Date()): { startDate: string; endDate: string } {
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  
  const startDate = new Date(Date.UTC(
    yesterday.getUTCFullYear(),
    yesterday.getUTCMonth(),
    yesterday.getUTCDate(),
    0, 0, 0, 0
  ));
  
  const endDate = new Date(Date.UTC(
    yesterday.getUTCFullYear(),
    yesterday.getUTCMonth(),
    yesterday.getUTCDate(),
    23, 59, 59, 999
  ));
  
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

/**
 * Get weekly window (previous Monday - Sunday)
 * Same logic as pattern extraction handler (UTC version)
 */
export function getWeeklyWindow(now: Date = new Date()): { startDate: string; endDate: string } {
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  
  // Calculate days to subtract to get to previous Monday
  // If today is Sunday (0), go back 6 days to Monday
  // If today is Monday (1), go back 7 days to previous Monday
  // If today is Tuesday (2), go back 8 days to previous Monday
  const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek + 6;
  
  const previousMonday = new Date(now);
  previousMonday.setUTCDate(previousMonday.getUTCDate() - daysToLastMonday);
  
  const startDate = new Date(Date.UTC(
    previousMonday.getUTCFullYear(),
    previousMonday.getUTCMonth(),
    previousMonday.getUTCDate(),
    0, 0, 0, 0
  ));
  
  // End date is 6 days after start (Sunday 23:59:59.999)
  const previousSunday = new Date(startDate);
  previousSunday.setUTCDate(previousSunday.getUTCDate() + 6);
  
  const endDate = new Date(Date.UTC(
    previousSunday.getUTCFullYear(),
    previousSunday.getUTCMonth(),
    previousSunday.getUTCDate(),
    23, 59, 59, 999
  ));
  
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

/**
 * Get monthly window (previous month)
 * Same logic as calibration handler
 */
export function getMonthlyWindow(now: Date = new Date()): { startDate: string; endDate: string } {
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
 * FIX 4.2: Calculate expiration based on retention policy
 */
export function calculateExpiration(
  snapshotType: SnapshotType,
  generatedAt: string
): string | undefined {
  const retentionDays = RETENTION_POLICY[snapshotType as keyof typeof RETENTION_POLICY];
  
  // If no retention policy or null (forever), return undefined
  if (retentionDays === undefined || retentionDays === null) {
    return undefined;
  }
  
  const generated = new Date(generatedAt);
  const expires = new Date(generated.getTime() + retentionDays * 24 * 60 * 60 * 1000);
  return expires.toISOString();
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
 * Emit CloudWatch metric
 */
async function emitMetric(
  metricName: string,
  value: number,
  triggerType: string,
  snapshotType?: string
): Promise<void> {
  try {
    const dimensions = [
      { Name: 'OperationType', Value: 'SNAPSHOT' },
      { Name: 'TriggerType', Value: triggerType },
    ];
    
    if (snapshotType) {
      dimensions.push({ Name: 'SnapshotType', Value: snapshotType });
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
