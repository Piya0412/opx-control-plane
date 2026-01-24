/**
 * Phase 5 - Step 2: Pattern Extraction Handler
 * 
 * Automated pattern extraction from closed incidents.
 * 
 * MANDATORY FIXES APPLIED:
 * - FIX 1: Audit record created even when kill switch is active
 * - FIX 2: Audit written BEFORE any long work
 * - FIX 3: getAllServices() uses real implementation
 * - FIX 4: Retry wrapper used for extractor calls
 * - FIX 5: Weekly window uses calendar-correct dates
 * - FIX 6: CloudWatch metrics include TriggerType dimension
 */

import { EventBridgeEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { PatternExtractor } from '../../learning/pattern-extractor';
import { OutcomeStore } from '../../learning/outcome-store';
import { ResolutionSummaryStore } from '../../learning/resolution-summary-store';
import { AutomationAuditStore } from '../automation-audit-store';
import { computeAuditId } from '../audit-id';
import { withRetry } from '../retry';

interface PatternExtractionEvent {
  timeWindow: 'DAILY' | 'WEEKLY';
  services?: string[]; // Optional: specific services, undefined = all
}

const MAX_SERVICES_PER_RUN = 100; // Safety limit

export async function handler(
  event: EventBridgeEvent<'Scheduled Event', PatternExtractionEvent>
): Promise<void> {
  const startTime = new Date().toISOString();
  const operationType = 'PATTERN_EXTRACTION';
  const triggerType = 'SCHEDULED';
  const version = '1.0.0';
  
  // Initialize clients
  const dynamoClient = new DynamoDBClient({});
  const cloudwatchClient = new CloudWatchClient({});
  
  // Initialize stores
  const outcomeStore = new OutcomeStore({
    client: dynamoClient,
    tableName: process.env.OUTCOME_TABLE_NAME!,
  });
  const summaryStore = new ResolutionSummaryStore(
    dynamoClient,
    process.env.SUMMARY_TABLE_NAME!
  );
  const auditStore = new AutomationAuditStore(
    dynamoClient,
    process.env.AUDIT_TABLE_NAME!
  );
  
  // Initialize extractor
  const extractor = new PatternExtractor(outcomeStore, summaryStore);
  
  // Compute audit ID
  const auditId = computeAuditId(operationType, startTime, version);
  
  // FIX 1: Check kill switch BEFORE creating audit
  // But still create audit record if kill switch is active
  if (await isKillSwitchActive(dynamoClient)) {
    console.log('Kill switch active, skipping execution');
    
    // Create audit record for kill switch activation
    await auditStore.recordAudit({
      auditId,
      operationType,
      triggerType,
      startTime,
      endTime: startTime,
      status: 'SUCCESS',
      parameters: {
        timeWindow: event.detail.timeWindow,
        skipped: 'KILL_SWITCH_ACTIVE',
      },
      results: {
        recordsProcessed: 0,
        durationMs: 0,
      },
      triggeredBy: {
        type: 'SYSTEM',
        principal: 'arn:aws:events:*:*:rule/opx-pattern-extraction',
      },
      version,
    });
    
    // FIX 6: Emit metrics for kill switch activation
    await emitMetrics(cloudwatchClient, {
      operationType,
      triggerType,
      status: 'SKIPPED',
      durationMs: 0,
      recordsProcessed: 0,
    });
    
    return;
  }
  
  // FIX 2: Record audit BEFORE any long work
  await auditStore.recordAudit({
    auditId,
    operationType,
    triggerType,
    startTime,
    status: 'RUNNING',
    parameters: {
      timeWindow: event.detail.timeWindow,
    },
    triggeredBy: {
      type: 'SYSTEM',
      principal: 'arn:aws:events:*:*:rule/opx-pattern-extraction',
    },
    version,
  });
  
  try {
    // FIX 5: Calculate date range with calendar-correct weekly window
    const { startDate, endDate } = calculateDateRange(event.detail.timeWindow);
    
    console.log('Pattern extraction started', {
      timeWindow: event.detail.timeWindow,
      startDate,
      endDate,
      auditId,
    });
    
    // FIX 3: Get services using real implementation
    const services = event.detail.services || await getAllServices(outcomeStore, startDate, endDate);
    
    console.log(`Processing ${services.length} services`);
    
    // Safety check: Cap service count
    if (services.length > MAX_SERVICES_PER_RUN) {
      throw new Error(`Service count (${services.length}) exceeds safety limit (${MAX_SERVICES_PER_RUN})`);
    }
    
    // Extract patterns for each service
    const results = [];
    let failedServices = 0;
    
    for (const service of services) {
      try {
        console.log(`Extracting patterns for service: ${service}`);
        
        // FIX 4: Use retry wrapper for extractor calls
        const summary = await withRetry(
          () => extractor.extractPatterns(service, startDate, endDate),
          {
            maxRetries: 3,
            initialDelayMs: 1000,
            maxDelayMs: 60000,
            backoffMultiplier: 2,
          }
        );
        
        results.push({
          service,
          summaryId: summary.summaryId,
          totalIncidents: summary.metrics.totalIncidents,
        });
        
        console.log(`Successfully extracted patterns for ${service}`, {
          summaryId: summary.summaryId,
          totalIncidents: summary.metrics.totalIncidents,
        });
      } catch (error: any) {
        console.error(`Failed to extract patterns for ${service}:`, error);
        failedServices++;
        
        // Emit per-service failure metric
        await emitServiceFailureMetric(cloudwatchClient, {
          operationType,
          service,
        });
        
        // Continue with other services (fail-safe)
      }
    }
    
    const endTime = new Date().toISOString();
    const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
    
    console.log('Pattern extraction completed', {
      successfulServices: results.length,
      failedServices,
      durationMs,
    });
    
    // Update audit with success
    await auditStore.updateAuditStatus(
      auditId,
      'SUCCESS',
      endTime,
      {
        recordsProcessed: results.length,
        patternsFound: results.reduce((sum, r) => sum + r.totalIncidents, 0),
        durationMs,
        failedServices,
      }
    );
    
    // FIX 6: Emit CloudWatch metrics with TriggerType dimension
    await emitMetrics(cloudwatchClient, {
      operationType,
      triggerType,
      status: 'SUCCESS',
      durationMs,
      recordsProcessed: results.length,
      failedServices,
    });
    
  } catch (error: any) {
    const endTime = new Date().toISOString();
    
    console.error('Pattern extraction failed:', error);
    
    // Update audit with failure
    await auditStore.updateAuditStatus(
      auditId,
      'FAILED',
      endTime,
      undefined,
      error.message,
      error.stack
    );
    
    // Emit failure metrics
    await emitMetrics(cloudwatchClient, {
      operationType,
      triggerType,
      status: 'FAILED',
      durationMs: new Date(endTime).getTime() - new Date(startTime).getTime(),
    });
    
    throw error; // Re-throw for Lambda retry
  }
}

/**
 * FIX 5: Calculate date range with calendar-correct weekly window
 * 
 * DAILY: Yesterday 00:00:00 → Today 00:00:00
 * WEEKLY: Previous Monday 00:00:00 → Previous Sunday 23:59:59
 */
export function calculateDateRange(timeWindow: 'DAILY' | 'WEEKLY'): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  
  if (timeWindow === 'DAILY') {
    // Yesterday 00:00:00 → Today 00:00:00
    const endDate = new Date(now);
    endDate.setHours(0, 0, 0, 0);
    
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 1);
    
    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  } else {
    // WEEKLY: Previous Monday 00:00:00 → Previous Sunday 23:59:59
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    // Calculate days to subtract to get to previous Monday
    // If today is Sunday (0), go back 6 days to Monday
    // If today is Monday (1), go back 7 days to previous Monday
    // If today is Tuesday (2), go back 8 days to previous Monday
    const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek + 6;
    
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - daysToLastMonday);
    
    // End date is 6 days after start (Sunday 23:59:59)
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);
    endDate.setMilliseconds(-1); // 23:59:59.999
    
    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  }
}

/**
 * FIX 3: Get all services using real implementation
 * 
 * Uses OutcomeStore.listDistinctServices() backed by bounded scan
 */
async function getAllServices(
  outcomeStore: OutcomeStore,
  startDate: string,
  endDate: string
): Promise<string[]> {
  // Query distinct services from outcomes within time window
  const services = await outcomeStore.listDistinctServices({
    startDate,
    endDate,
  });
  
  return services;
}

async function isKillSwitchActive(dynamoClient: DynamoDBClient): Promise<boolean> {
  // Check kill switch flag in DynamoDB
  // Implementation in Step 7
  return false;
}

/**
 * FIX 6: Emit metrics with TriggerType dimension
 */
async function emitMetrics(
  client: CloudWatchClient,
  metrics: {
    operationType: string;
    triggerType: string;
    status: string;
    durationMs: number;
    recordsProcessed?: number;
    failedServices?: number;
  }
): Promise<void> {
  const metricData = [
    {
      MetricName: 'Success',
      Value: metrics.status === 'SUCCESS' ? 1 : 0,
      Unit: 'Count',
      Dimensions: [
        { Name: 'OperationType', Value: metrics.operationType },
        { Name: 'TriggerType', Value: metrics.triggerType },
      ],
    },
    {
      MetricName: 'Duration',
      Value: metrics.durationMs,
      Unit: 'Milliseconds',
      Dimensions: [
        { Name: 'OperationType', Value: metrics.operationType },
        { Name: 'TriggerType', Value: metrics.triggerType },
      ],
    },
  ];
  
  if (metrics.recordsProcessed !== undefined) {
    metricData.push({
      MetricName: 'RecordsProcessed',
      Value: metrics.recordsProcessed,
      Unit: 'Count',
      Dimensions: [
        { Name: 'OperationType', Value: metrics.operationType },
        { Name: 'TriggerType', Value: metrics.triggerType },
      ],
    });
  }
  
  if (metrics.failedServices !== undefined && metrics.failedServices > 0) {
    metricData.push({
      MetricName: 'FailedServices',
      Value: metrics.failedServices,
      Unit: 'Count',
      Dimensions: [
        { Name: 'OperationType', Value: metrics.operationType },
        { Name: 'TriggerType', Value: metrics.triggerType },
      ],
    });
  }
  
  await client.send(
    new PutMetricDataCommand({
      Namespace: 'LearningOperations',
      MetricData: metricData,
    })
  );
}

/**
 * Emit per-service failure metric
 */
async function emitServiceFailureMetric(
  client: CloudWatchClient,
  metrics: {
    operationType: string;
    service: string;
  }
): Promise<void> {
  await client.send(
    new PutMetricDataCommand({
      Namespace: 'LearningOperations',
      MetricData: [
        {
          MetricName: 'ServiceFailure',
          Value: 1,
          Unit: 'Count',
          Dimensions: [
            { Name: 'OperationType', Value: metrics.operationType },
            { Name: 'Service', Value: metrics.service },
          ],
        },
      ],
    })
  );
}
