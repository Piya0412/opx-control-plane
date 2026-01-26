/**
 * Phase 6 Invocation Handler
 * 
 * Receives IncidentCreated events and invokes Phase 6 intelligence layer.
 * 
 * CRITICAL RULES:
 * - Read-only access to incident and evidence
 * - No state mutation
 * - Advisory output only
 * - Fail-closed on errors
 */

import { EventBridgeEvent } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { IncidentCreatedEvent } from '../incident/incident-event.schema.js';
import { IncidentStore } from '../incident/incident-store.js';
import { EvidenceStore } from '../evidence/evidence-store.js';
import { AdvisoryStore } from './advisory-store.js';

const lambdaClient = new LambdaClient({});
const dynamoClient = new DynamoDBClient({});

const incidentStore = new IncidentStore(
  dynamoClient,
  process.env.INCIDENTS_TABLE_NAME || 'opx-incidents'
);

const evidenceStore = new EvidenceStore(
  dynamoClient,
  process.env.EVIDENCE_TABLE_NAME || 'opx-evidence-bundles'
);

const advisoryStore = new AdvisoryStore(
  dynamoClient,
  process.env.ADVISORY_TABLE_NAME || 'opx-agent-recommendations'
);

const PHASE6_LAMBDA_ARN = process.env.PHASE6_EXECUTOR_LAMBDA_ARN!;

/**
 * Lambda handler for IncidentCreated events
 * 
 * Flow:
 * 1. Receive IncidentCreated event
 * 2. Load incident (read-only)
 * 3. Load evidence bundle (read-only)
 * 4. Invoke Phase 6 executor Lambda
 * 5. Store advisory output
 * 6. Emit metrics
 * 
 * Error Handling:
 * - Incident not found → Log error, return success (don't retry)
 * - Evidence not found → Log error, return success (don't retry)
 * - Phase 6 invocation fails → Log error, throw (retry)
 * - Advisory storage fails → Log error, throw (retry)
 */
export async function handler(
  event: EventBridgeEvent<'IncidentCreated', IncidentCreatedEvent>
): Promise<void> {
  console.log('Phase 6 invocation handler invoked', {
    eventId: event.id,
    source: event.source,
    detailType: event['detail-type'],
  });

  const incidentEvent = event.detail;

  try {
    // ========================================================================
    // STEP 1: LOAD INCIDENT (READ-ONLY)
    // ========================================================================

    console.log('Loading incident (read-only)', {
      incidentId: incidentEvent.incidentId,
    });

    const incident = await incidentStore.getIncident(incidentEvent.incidentId);

    if (!incident) {
      console.error('Incident not found', {
        incidentId: incidentEvent.incidentId,
      });
      // Don't retry - incident should exist if event was emitted
      return;
    }

    // ========================================================================
    // STEP 2: LOAD EVIDENCE BUNDLE (READ-ONLY)
    // ========================================================================

    console.log('Loading evidence bundle (read-only)', {
      evidenceId: incidentEvent.evidenceId,
    });

    const evidence = await evidenceStore.getEvidenceBundle(incidentEvent.evidenceId);

    if (!evidence) {
      console.error('Evidence bundle not found', {
        evidenceId: incidentEvent.evidenceId,
      });
      // Don't retry - evidence should exist if incident was created
      return;
    }

    // ========================================================================
    // STEP 3: BUILD PHASE 6 INPUT
    // ========================================================================

    const phase6Input = {
      detail: {
        incident_id: incident.incidentId,
        evidence_bundle: {
          evidence_id: evidence.evidenceId,
          service: evidence.service,
          detections: evidence.detections.map((d) => ({
            detection_id: d.detectionId,
            rule_id: d.ruleId,
            severity: d.severity,
            signal_ids: d.signalIds,
            detected_at: d.detectedAt,
          })),
          signal_summary: evidence.signalSummary,
          correlation_key: evidence.correlationKey,
          confidence: evidence.confidence,
        },
        incident_context: {
          severity: incident.severity,
          status: incident.status,
          confidence_score: incident.confidenceScore,
          created_at: incident.createdAt,
          opened_at: incident.openedAt,
        },
        budget_remaining: 5.0, // Default $5 budget per incident
        session_id: `${incident.incidentId}-${Date.now()}`,
        execution_id: `exec-${incident.incidentId}-${Date.now()}`,
        timestamp: new Date().toISOString(),
      },
    };

    console.log('Phase 6 input prepared', {
      incidentId: incident.incidentId,
      evidenceId: evidence.evidenceId,
      detectionCount: evidence.detections.length,
      budgetRemaining: phase6Input.detail.budget_remaining,
    });

    // ========================================================================
    // STEP 4: INVOKE PHASE 6 EXECUTOR LAMBDA
    // ========================================================================

    console.log('Invoking Phase 6 executor Lambda', {
      lambdaArn: PHASE6_LAMBDA_ARN,
      executionId: phase6Input.detail.execution_id,
    });

    const invokeResult = await lambdaClient.send(
      new InvokeCommand({
        FunctionName: PHASE6_LAMBDA_ARN,
        InvocationType: 'RequestResponse', // Synchronous invocation
        Payload: Buffer.from(JSON.stringify(phase6Input)),
      })
    );

    if (invokeResult.FunctionError) {
      console.error('Phase 6 Lambda invocation failed', {
        functionError: invokeResult.FunctionError,
        payload: invokeResult.Payload?.toString(),
      });
      throw new Error(`Phase 6 Lambda failed: ${invokeResult.FunctionError}`);
    }

    // Parse response
    const responsePayload = JSON.parse(invokeResult.Payload?.toString() || '{}');
    const responseBody = JSON.parse(responsePayload.body || '{}');

    console.log('Phase 6 execution completed', {
      statusCode: responsePayload.statusCode,
      incidentId: responseBody.incident_id,
      executionId: responseBody.execution_id,
      totalCost: responseBody.cost?.total,
    });

    // ========================================================================
    // STEP 5: STORE ADVISORY OUTPUT
    // ========================================================================

    if (responsePayload.statusCode === 200 && responseBody.recommendation) {
      const advisoryRecommendation = {
        incidentId: incident.incidentId,
        executionId: responseBody.execution_id,
        recommendation: responseBody.recommendation,
        consensus: responseBody.consensus,
        cost: responseBody.cost,
        execution_summary: responseBody.execution_summary,
        timestamp: responseBody.timestamp,
        createdAt: new Date().toISOString(),
      };

      const stored = await advisoryStore.storeRecommendation(advisoryRecommendation);

      console.log('Advisory recommendation stored', {
        incidentId: incident.incidentId,
        executionId: responseBody.execution_id,
        isNew: stored,
      });
    } else {
      console.warn('Phase 6 execution did not produce recommendation', {
        statusCode: responsePayload.statusCode,
        error: responseBody.error,
      });
    }

    // ========================================================================
    // STEP 6: EMIT METRICS
    // ========================================================================

    // TODO: Emit CloudWatch metrics
    // - Phase6.InvocationCount
    // - Phase6.InvocationDuration
    // - Phase6.InvocationSuccess
    // - Phase6.InvocationFailure
    // - Phase6.TotalCost

    console.log('Phase 6 invocation completed successfully', {
      incidentId: incident.incidentId,
    });
  } catch (error) {
    console.error('Phase 6 invocation handler failed', {
      incidentId: incidentEvent.incidentId,
      error: error instanceof Error ? error.message : String(error),
    });

    // Fail closed - throw error to trigger retry
    throw error;
  }
}
