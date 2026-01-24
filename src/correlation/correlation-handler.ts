/**
 * Phase 2.2: Correlation Lambda Handler
 * 
 * MINIMAL WIRING ONLY
 * 
 * Responsibilities:
 * 1. Receive SignalIngested events from EventBridge
 * 2. Load enabled correlation rules
 * 3. Execute correlation engine
 * 4. Generate candidates via orchestrator
 * 
 * FAIL-FAST DISCIPLINE:
 * - Any error throws immediately
 * - Lambda retry is the only retry mechanism
 * - No error swallowing
 * - No partial success
 * 
 * FIX: EventBridge detail IS the signal (not detail.signal)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { EventBridgeEvent } from 'aws-lambda';
import { CorrelationEngine, type SignalQuery } from './correlation-engine.js';
import { CorrelationExecutor, type CorrelationDataProvider } from './correlation-executor.js';
import { CorrelationRuleStore } from './correlation-rule-store.js';
import { CandidateOrchestrator } from '../candidate/candidate-orchestrator.js';
import { CandidateStore } from '../candidate/candidate-store.js';
import { SignalStore } from '../signal/signal-store.js';
import { DetectionStore } from '../detection/detection-store.js';
import type { SignalEvent } from '../signal/signal-event.schema.js';
import type { DetectionResult } from '../detection/detection-result.js';
import type { EvidenceGraph } from '../evidence/evidence-graph.schema.js';
import type { NormalizedSignal } from '../normalization/normalized-signal.schema.js';

// Environment variables
const SIGNALS_TABLE_NAME = process.env.SIGNALS_TABLE_NAME!;
const CORRELATION_RULES_TABLE_NAME = process.env.CORRELATION_RULES_TABLE_NAME!;
const CANDIDATES_TABLE_NAME = process.env.CANDIDATES_TABLE_NAME!;
const DETECTIONS_TABLE_NAME = process.env.DETECTIONS_TABLE_NAME || 'opx-detections';

// AWS clients (singleton)
const dynamoClient = new DynamoDBClient({});
const eventBridgeClient = new EventBridgeClient({});

// Stores (singleton)
const signalStore = new SignalStore(dynamoClient, SIGNALS_TABLE_NAME);
const ruleStore = new CorrelationRuleStore(dynamoClient, CORRELATION_RULES_TABLE_NAME);
const candidateStore = new CandidateStore(dynamoClient, CANDIDATES_TABLE_NAME);
const detectionStore = new DetectionStore({
  tableName: DETECTIONS_TABLE_NAME,
  dynamoClient: dynamoClient
});

// Orchestrator (singleton)
const orchestrator = new CandidateOrchestrator(candidateStore);

/**
 * Signal query implementation
 * 
 * Queries signals from SignalStore within time windows.
 */
class SignalQueryImpl implements SignalQuery {
  constructor(private readonly store: SignalStore) {}

  async querySignalsInWindow(params: {
    start: string;
    end: string;
    service?: string;
    severity?: string;
  }): Promise<SignalEvent[]> {
    // Query by service if specified
    if (params.service) {
      return this.store.queryByService(
        params.service,
        params.start,
        params.end
      );
    }

    // Query by severity if specified
    if (params.severity) {
      return this.store.queryBySeverity(
        params.severity,
        params.start,
        params.end
      );
    }

    // Fallback: No efficient query available without service/severity
    // Return empty array to avoid expensive scan
    // In production, correlation rules should always specify service or severity
    console.warn('Cannot query signals without service/severity filter - returning empty array');
    return [];
  }
}

/**
 * Correlation data provider implementation
 * 
 * Fetches detections, graphs, and normalized signals.
 * 
 * Phase 2.4 Step 5: Detection fetching implemented.
 * Maps Phase 2.4 Detection schema to CP-3 DetectionResult format.
 */
class CorrelationDataProviderImpl implements CorrelationDataProvider {
  constructor(private readonly detectionStore: DetectionStore) {}

  async getDetections(signalIds: string[]): Promise<DetectionResult[]> {
    if (signalIds.length === 0) {
      return [];
    }

    // Fetch Phase 2.4 detections from store
    const detections = await this.detectionStore.getDetectionsBySignalIds(signalIds);
    
    // Map Phase 2.4 Detection to CP-3 DetectionResult format
    return detections.map(d => ({
      detectionId: d.detectionId,
      ruleId: d.ruleId,
      ruleVersion: d.ruleVersion,
      normalizedSignalId: d.signalIds[0], // Use first signal ID as normalized signal ID
      signalTimestamp: d.detectedAt,
      decision: 'MATCH' as const,
      severity: d.severity,
      confidence: d.confidence,
      evaluationTrace: [], // Empty trace for Phase 2.4 detections
      detectionVersion: 'v1'
    }));
  }

  async getGraphs(detectionIds: string[]): Promise<EvidenceGraph[]> {
    // TODO: Implement in Phase 2.5+
    // For now, return empty array (candidates will have no graphs)
    console.warn('getGraphs not implemented - returning empty array', {
      detectionIds: detectionIds.length,
    });
    return [];
  }

  async getNormalizedSignals(signalIds: string[]): Promise<NormalizedSignal[]> {
    // TODO: Implement in Phase 2.5+
    // For now, return empty array (candidates will have no normalized signals)
    console.warn('getNormalizedSignals not implemented - returning empty array', {
      signalIds: signalIds.length,
    });
    return [];
  }
}

// Engine and executor (singleton)
const signalQuery = new SignalQueryImpl(signalStore);
const dataProvider = new CorrelationDataProviderImpl(detectionStore);
const engine = new CorrelationEngine(signalQuery);
const executor = new CorrelationExecutor(engine, orchestrator, dataProvider);

/**
 * Lambda handler
 * 
 * FAIL-FAST DISCIPLINE:
 * - Any error throws immediately
 * - Lambda retry is the only retry mechanism
 */
export async function handler(
  event: EventBridgeEvent<'SignalIngested', SignalEvent>
): Promise<void> {
  console.log('Correlation handler invoked', {
    eventId: event.id,
    source: event.source,
    detailType: event['detail-type'],
    signalId: event.detail.signalId,
  });

  // Extract signal from event - the detail IS the signal
  const signal = event.detail as unknown as SignalEvent;

  // Load enabled correlation rules
  const rules = await ruleStore.listEnabledRules();

  console.log('Loaded enabled correlation rules', {
    ruleCount: rules.length,
    ruleIds: rules.map(r => r.ruleId),
  });

  // Execute correlation
  const result = await executor.execute(signal, rules);

  console.log('Correlation execution complete', {
    signalId: signal.signalId,
    evaluatedRules: result.evaluation.evaluatedRules,
    matchedRules: result.evaluation.matchedRules,
    thresholdMetRules: result.evaluation.thresholdMetRules,
    candidatesGenerated: result.candidatesGenerated,
    candidateIds: result.candidateIds,
  });

  // Success - Lambda will not retry
}
