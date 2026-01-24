import { describe, it, expect } from 'vitest';
import { makeSignedRequest } from './aws-helpers.js';

/**
 * Integration Test: Full Incident Lifecycle
 * 
 * NO MOCKS - Real AWS resources.
 * 
 * Tests complete lifecycle: CREATED → ANALYZING → DECIDED → WAITING_FOR_HUMAN → CLOSED
 */
describe('Integration: Full Incident Lifecycle', () => {

  it('Scenario 1: should complete full incident lifecycle', async () => {
    // 1. Create incident (CREATED)
    // Use unique idempotency key per test run to ensure isolation
    const idempotencyKey = crypto.randomUUID();
    const createResponse = await makeSignedRequest('POST', '/incidents', {
      service: 'payment-service',
      severity: 'SEV2',
      title: 'Integration test incident - full lifecycle',
    }, { 'Idempotency-Key': idempotencyKey });

    expect(createResponse.status).toBe(201);
    const incident: any = await createResponse.json();
    expect(incident.state).toBe('CREATED');
    expect(incident.version).toBe(1);
    expect(incident.eventSeq).toBe(1);
    
    const incidentId = incident.incidentId;

    // 2. Transition to ANALYZING
    const analyzeResponse = await makeSignedRequest(
      'POST',
      `/incidents/${incidentId}/transitions`,
      {
        targetState: 'ANALYZING',
        reason: 'Starting investigation',
      }
    );

    expect(analyzeResponse.status).toBe(200);
    const analyzing: any = await analyzeResponse.json();
    expect(analyzing.state).toBe('ANALYZING');
    expect(analyzing.version).toBe(2);
    expect(analyzing.eventSeq).toBe(2);

    // 3. Transition to DECIDED
    const decidedResponse = await makeSignedRequest(
      'POST',
      `/incidents/${incidentId}/transitions`,
      {
        targetState: 'DECIDED',
        reason: 'Root cause identified',
      }
    );

    expect(decidedResponse.status).toBe(200);
    const decided: any = await decidedResponse.json();
    expect(decided.state).toBe('DECIDED');
    expect(decided.version).toBe(3);
    expect(decided.eventSeq).toBe(3);

    // 4. Transition to WAITING_FOR_HUMAN
    const waitingResponse = await makeSignedRequest(
      'POST',
      `/incidents/${incidentId}/transitions`,
      {
        targetState: 'WAITING_FOR_HUMAN',
        reason: 'Awaiting approval',
      }
    );

    expect(waitingResponse.status).toBe(200);
    const waiting: any = await waitingResponse.json();
    expect(waiting.state).toBe('WAITING_FOR_HUMAN');
    expect(waiting.version).toBe(4);
    expect(waiting.eventSeq).toBe(4);

    // 5. Approve (transition to CLOSED)
    const approveResponse = await makeSignedRequest(
      'POST',
      `/incidents/${incidentId}/approvals`,
      {
        action: 'APPROVE',
        reason: 'Approved for closure',
      }
    );

    expect(approveResponse.status).toBe(200);
    const closed: any = await approveResponse.json();
    expect(closed.state).toBe('CLOSED');
    expect(closed.version).toBe(5);
    expect(closed.eventSeq).toBe(5);

    // Verify timeline has all entries
    expect(closed.timeline.length).toBeGreaterThanOrEqual(5);

    // Verify version === eventSeq (recommendation 2)
    expect(closed.version).toBe(closed.eventSeq);

    // 6. Verify replay works
    const replayResponse = await makeSignedRequest('GET', `/incidents/${incidentId}/replay`);
    expect(replayResponse.status).toBe(200);
    const replayResult: any = await replayResponse.json();
    expect(replayResult.success).toBe(true);
    expect(replayResult.eventCount).toBe(5);
    expect(replayResult.finalState.state).toBe('CLOSED');
  }, 30000);

  it('Scenario 2: should reject concurrent transitions deterministically', async () => {
    // Create incident with unique idempotency key to ensure fresh state
    const idempotencyKey = crypto.randomUUID();
    const createResponse = await makeSignedRequest('POST', '/incidents', {
      service: 'test-service',
      severity: 'SEV3',
      title: 'Concurrent transition test',
    }, { 'Idempotency-Key': idempotencyKey });
    
    const incident: any = await createResponse.json();
    const incidentId = incident.incidentId;

    // Attempt two concurrent transitions
    const [response1, response2] = await Promise.all([
      makeSignedRequest('POST', `/incidents/${incidentId}/transitions`, {
        targetState: 'ANALYZING',
        reason: 'First transition',
      }),
      makeSignedRequest('POST', `/incidents/${incidentId}/transitions`, {
        targetState: 'ANALYZING',
        reason: 'Second transition',
      }),
    ]);

    // One should succeed (200), one should fail deterministically
    // Failure may be 409 (coordination conflict) or 400 (state machine rejection)
    // Both are valid outcomes depending on timing
    const statuses = [response1.status, response2.status].sort();
    expect(statuses).toContain(200); // One must succeed
    expect(statuses.some(s => s === 409 || s === 400)).toBe(true); // Other must fail deterministically

    // Verify final state is consistent
    const getResponse = await makeSignedRequest('GET', `/incidents/${incidentId}`);
    const finalIncident: any = await getResponse.json();
    expect(finalIncident.state).toBe('ANALYZING');
    expect(finalIncident.version).toBe(2);
  }, 30000);

  it('Scenario 3: should reject invalid transitions (fail-closed)', async () => {
    // Create incident
    // Use unique idempotency key to ensure fresh incident
    const idempotencyKey = crypto.randomUUID();
    const createResponse = await makeSignedRequest('POST', '/incidents', {
      service: 'test-service',
      severity: 'SEV3',
      title: 'Invalid transition test',
    }, { 'Idempotency-Key': idempotencyKey });
    const incident: any = await createResponse.json();
    const incidentId = incident.incidentId;

    // Attempt invalid transition: CREATED → CLOSED (must go through ANALYZING → DECIDED → WAITING_FOR_HUMAN)
    const invalidResponse = await makeSignedRequest('POST', `/incidents/${incidentId}/transitions`, {
      targetState: 'CLOSED',
      reason: 'Trying to skip states',
    });

    expect(invalidResponse.status).toBe(400);
    const error: any = await invalidResponse.json();
    expect(error.error.code).toBe('INVALID_TRANSITION');

    // Verify state unchanged
    const getResponse = await makeSignedRequest('GET', `/incidents/${incidentId}`);
    const finalIncident: any = await getResponse.json();
    expect(finalIncident.state).toBe('CREATED');
  }, 30000);

  it('Scenario 4: should replay after multiple transitions', async () => {
    // Create and transition incident through multiple states
    // Use unique idempotency key to ensure fresh incident
    const idempotencyKey = crypto.randomUUID();
    const createResponse = await makeSignedRequest('POST', '/incidents', {
      service: 'test-service',
      severity: 'SEV2',
      title: 'Replay test - multiple transitions',
    }, { 'Idempotency-Key': idempotencyKey });
    const incident: any = await createResponse.json();
    const incidentId = incident.incidentId;

    // Transition through states
    await makeSignedRequest('POST', `/incidents/${incidentId}/transitions`, {
      targetState: 'ANALYZING',
      reason: 'Step 1',
    });
    await makeSignedRequest('POST', `/incidents/${incidentId}/transitions`, {
      targetState: 'DECIDED',
      reason: 'Step 2',
    });
    await makeSignedRequest('POST', `/incidents/${incidentId}/transitions`, {
      targetState: 'WAITING_FOR_HUMAN',
      reason: 'Step 3',
    });

    // Replay
    const replayResponse = await makeSignedRequest('GET', `/incidents/${incidentId}/replay`);
    expect(replayResponse.status).toBe(200);
    const replayResult: any = await replayResponse.json();
    
    expect(replayResult.success).toBe(true);
    expect(replayResult.eventCount).toBe(4); // CREATE + 3 transitions
    expect(replayResult.finalState.state).toBe('WAITING_FOR_HUMAN');
    expect(replayResult.finalState.version).toBe(4);
  }, 30000);

  it('Scenario 5: should replay after rejected transition', async () => {
    // Create incident and transition to WAITING_FOR_HUMAN
    // Use unique idempotency key to ensure fresh incident
    const idempotencyKey = crypto.randomUUID();
    const createResponse = await makeSignedRequest('POST', '/incidents', {
      service: 'test-service',
      severity: 'SEV3',
      title: 'Replay test - rejection',
    }, { 'Idempotency-Key': idempotencyKey });
    const incident: any = await createResponse.json();
    const incidentId = incident.incidentId;

    await makeSignedRequest('POST', `/incidents/${incidentId}/transitions`, {
      targetState: 'ANALYZING',
      reason: 'Step 1',
    });
    await makeSignedRequest('POST', `/incidents/${incidentId}/transitions`, {
      targetState: 'DECIDED',
      reason: 'Step 2',
    });
    await makeSignedRequest('POST', `/incidents/${incidentId}/transitions`, {
      targetState: 'WAITING_FOR_HUMAN',
      reason: 'Step 3',
    });

    // Reject (goes back to ANALYZING)
    await makeSignedRequest('POST', `/incidents/${incidentId}/approvals`, {
      action: 'REJECT',
      reason: 'Need more investigation',
    });

    // Replay
    const replayResponse = await makeSignedRequest('GET', `/incidents/${incidentId}/replay`);
    expect(replayResponse.status).toBe(200);
    const replayResult: any = await replayResponse.json();
    
    expect(replayResult.success).toBe(true);
    expect(replayResult.eventCount).toBe(5); // CREATE + 3 transitions + 1 rejection
    expect(replayResult.finalState.state).toBe('ANALYZING');
  }, 30000);

  it('Scenario 15: should enforce terminal state (CLOSED)', async () => {
    // Create and close incident
    // Use unique idempotency key to ensure fresh incident
    const idempotencyKey = crypto.randomUUID();
    const createResponse = await makeSignedRequest('POST', '/incidents', {
      service: 'test-service',
      severity: 'SEV3',
      title: 'Terminal state test',
    }, { 'Idempotency-Key': idempotencyKey });
    const incident: any = await createResponse.json();
    const incidentId = incident.incidentId;

    // Transition to CLOSED
    await makeSignedRequest('POST', `/incidents/${incidentId}/transitions`, {
      targetState: 'ANALYZING',
      reason: 'Step 1',
    });
    await makeSignedRequest('POST', `/incidents/${incidentId}/transitions`, {
      targetState: 'DECIDED',
      reason: 'Step 2',
    });
    await makeSignedRequest('POST', `/incidents/${incidentId}/transitions`, {
      targetState: 'WAITING_FOR_HUMAN',
      reason: 'Step 3',
    });
    await makeSignedRequest('POST', `/incidents/${incidentId}/approvals`, {
      action: 'APPROVE',
      reason: 'Closing',
    });

    // Attempt transition from CLOSED (should fail)
    const invalidResponse = await makeSignedRequest('POST', `/incidents/${incidentId}/transitions`, {
      targetState: 'ANALYZING',
      reason: 'Trying to reopen',
    });

    expect(invalidResponse.status).toBe(400);
    const error: any = await invalidResponse.json();
    expect(error.error.code).toBe('INVALID_TRANSITION');
  }, 30000);
});
