/**
 * Signal Ingestor Lambda Handler
 * 
 * Phase 2.1: Signal Ingestion
 * 
 * Purpose: Ingest and normalize signals from CloudWatch alarms
 * 
 * CORRECTIONS APPLIED:
 * - CORRECTION 4: EventBridge emission is best-effort (non-blocking)
 * 
 * INV-P2.1: Read-only w.r.t. incidents (only writes to opx-signals)
 * INV-P2.5: Failure must not block Phase 1
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { SNSEvent } from 'aws-lambda';
import { SignalStore } from './signal-store';
import { SignalNormalizer, type CloudWatchAlarmEvent } from './signal-normalizer';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const eventBridgeClient = new EventBridgeClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const signalStore = new SignalStore(
  dynamoClient,
  process.env.SIGNALS_TABLE_NAME || 'opx-signals'
);

const normalizer = new SignalNormalizer();

/**
 * Emit signal to EventBridge (best-effort, non-blocking)
 * 
 * CORRECTION 4: EventBridge failure does NOT fail the handler
 * Signal storage (DynamoDB) is the source of truth, not EventBridge
 */
async function emitSignalEvent(signal: any): Promise<void> {
  try {
    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'opx.signal',
            DetailType: 'SignalIngested',
            Detail: JSON.stringify(signal),
            EventBusName: process.env.EVENT_BUS_NAME || 'default',
          },
        ],
      })
    );
  } catch (err) {
    // CORRECTION 4: Log warning but DO NOT throw
    console.warn('EventBridge emit failed (non-blocking)', {
      error: err instanceof Error ? err.message : String(err),
      signalId: signal.signalId,
    });
    
    // TODO: Increment CloudWatch metric: SignalEmitFailures
  }
}

/**
 * Lambda handler for signal ingestion
 * 
 * Flow:
 * 1. Receive SNS event
 * 2. Parse CloudWatch alarm
 * 3. Normalize to SignalEvent
 * 4. Validate schema
 * 5. Check for duplicate (idempotency)
 * 6. Write to DynamoDB (source of truth)
 * 7. Emit to EventBridge (best-effort, non-blocking)
 * 8. Return success
 * 
 * Error Handling:
 * - Invalid schema → Log error, return success (don't retry)
 * - Duplicate signal → Log info, return success (idempotent)
 * - DynamoDB error → Log error, throw (retry)
 * - Unknown source → Log error, return success (don't retry)
 * - EventBridge error → Log warning, continue (CORRECTION 4: non-blocking)
 */
export async function handler(event: SNSEvent): Promise<void> {
  // TEMP LOG for Step 8 debugging
  console.log('RAW EVENT:', JSON.stringify(event, null, 2));
  
  console.log('Signal ingestor invoked', {
    recordCount: event.Records.length,
  });

  for (const record of event.Records) {
    try {
      // Parse SNS message
      const message = JSON.parse(record.Sns.Message);
      
      // Normalize CloudWatch alarm
      const signal = normalizer.normalizeCloudWatchAlarm(message as CloudWatchAlarmEvent);
      
      if (!signal) {
        // Invalid signal (wrong state, missing service/severity, schema validation failed)
        console.error('Failed to normalize signal', {
          alarmName: message.AlarmName,
          newStateValue: message.NewStateValue,
        });
        // TODO: Increment CloudWatch metric: SignalValidationErrors
        continue; // Don't retry
      }

      // Check for duplicate (idempotency)
      const existing = await signalStore.getSignal(signal.signalId);
      if (existing) {
        console.info('Duplicate signal (idempotent)', {
          signalId: signal.signalId,
        });
        // TODO: Increment CloudWatch metric: SignalDuplicates
        continue; // Already stored, no-op
      }

      // Write to DynamoDB (source of truth)
      await signalStore.putSignal(signal);

      console.info('Signal ingested', {
        signalId: signal.signalId,
        source: signal.source,
        service: signal.service,
        severity: signal.severity,
        observedAt: signal.observedAt,
        identityWindow: signal.identityWindow,
      });

      // TODO: Increment CloudWatch metric: SignalsIngested

      // Emit to EventBridge (best-effort, non-blocking)
      // CORRECTION 4: Failure here does NOT fail the handler
      await emitSignalEvent(signal);

    } catch (err) {
      // DynamoDB error or unexpected error → throw (retry)
      console.error('Signal ingestion failed', {
        error: err instanceof Error ? err.message : String(err),
        record: record.Sns.MessageId,
      });
      throw err; // Retry
    }
  }
}
