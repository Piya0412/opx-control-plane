/**
 * Phase 2.4: Detection Engine Lambda Handler
 *
 * Processes SignalIngested events and creates detections.
 */

import { EventBridgeEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { DetectionEngine } from './detection-engine.js';
import { DetectionStore } from './detection-store.js';
import { RuleLoader } from './rule-loader.js';
import type { SignalEvent } from '../signal/signal-event.schema.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment variables
const DETECTIONS_TABLE_NAME = process.env.DETECTIONS_TABLE_NAME!;
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME!;
const RULES_PATH = path.join(__dirname, 'rules');

// AWS clients
const dynamoClient = new DynamoDBClient({});
const eventBridgeClient = new EventBridgeClient({});

// Detection components
const detectionStore = new DetectionStore({
  tableName: DETECTIONS_TABLE_NAME,
  dynamoClient,
});

const ruleLoader = new RuleLoader(RULES_PATH);
const detectionEngine = new DetectionEngine({
  detectionStore,
  eventEmitter: {
    emit: async (event: any) => {
      const command = new PutEventsCommand({
        Entries: [{
          Source: 'opx.detection',
          DetailType: event.eventType,
          Detail: JSON.stringify(event),
          EventBusName: EVENT_BUS_NAME,
        }],
      });
      await eventBridgeClient.send(command);
    },
  },
});

// Load rules at startup (cold start)
let rulesLoaded = false;

function ensureRulesLoaded() {
  if (!rulesLoaded) {
    console.log('Loading detection rules from', RULES_PATH);
    ruleLoader.loadAllRules();
    rulesLoaded = true;
    console.log('Detection rules loaded', { count: ruleLoader.getAllRules().length });
  }
}

/**
 * Lambda handler for SignalIngested events
 */
export async function handler(event: EventBridgeEvent<'SignalIngested', SignalEvent>) {
  console.log('Detection Engine invoked', {
    eventId: event.id,
    source: event.source,
    detailType: event['detail-type'],
  });

  try {
    // Ensure rules are loaded
    ensureRulesLoaded();

    // Extract signal from event
    const signal = event.detail;

    console.log('Processing signal', {
      signalId: signal.signalId,
      source: signal.source,
      signalType: signal.signalType,
      service: signal.service,
      severity: signal.severity,
    });

    // Get applicable rules for this signal
    const rules = ruleLoader.listApplicableRules(signal);
    console.log('Applicable detection rules', { count: rules.length });

    if (rules.length === 0) {
      console.log('No applicable rules for signal', { signalId: signal.signalId });
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'No applicable rules',
          signalId: signal.signalId,
        }),
      };
    }

    // Process signal through detection engine for each applicable rule
    const results = [];
    const currentTime = new Date().toISOString();
    
    for (const rule of rules) {
      const result = await detectionEngine.processSignal(
        signal,
        rule.ruleId,
        rule.ruleVersion,
        currentTime
      );
      results.push(result);

      console.log('Detection engine result', {
        detectionId: result.detection.detectionId,
        isNew: result.isNew,
        ruleId: result.detection.ruleId,
      });
    }

    // Return success
    return {
      statusCode: 200,
      body: JSON.stringify({
        detectionsCreated: results.length,
        detections: results.map(r => ({
          detectionId: r.detection.detectionId,
          isNew: r.isNew,
          ruleId: r.detection.ruleId,
        })),
      }),
    };
  } catch (error: any) {
    console.error('Detection engine failed', {
      error: error.message,
      stack: error.stack,
    });

    // Fail closed - throw error to trigger retry
    throw error;
  }
}
