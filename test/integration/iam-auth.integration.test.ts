import { describe, it, expect } from 'vitest';
import { makeSignedRequest, assumeRole, getStackOutputs } from './aws-helpers.js';

/**
 * Integration Test: IAM Authorization
 * 
 * NO MOCKS - Real AWS resources.
 * 
 * Tests IAM role-based authorization with real role assumption.
 */
describe('Integration: IAM Authorization', () => {
  const outputs = getStackOutputs();

  it('Scenario 10: should allow Creator role to create incidents', async () => {
    // Assume Creator role
    const creatorCreds = await assumeRole(outputs.creatorRoleArn);

    // Create incident with unique title to avoid idempotency replay
    const response = await makeSignedRequest(
      'POST',
      '/incidents',
      {
        service: 'test-service',
        severity: 'SEV3',
        title: `IAM test - Creator role - ${Date.now()}`,
      },
      {},
      creatorCreds
    );

    expect(response.status).toBe(201);
    const incident: any = await response.json();
    expect(incident.incidentId).toBeDefined();
    expect(incident.state).toBe('CREATED');
  }, 30000);

  it('Scenario 11: should allow Reader role to view incidents', async () => {
    // First create an incident with default credentials
    const createResponse = await makeSignedRequest('POST', '/incidents', {
      service: 'test-service',
      severity: 'SEV3',
      title: `IAM test - Reader role - ${Date.now()}`,
    });
    const incident: any = await createResponse.json();
    const incidentId = incident.incidentId;

    // Assume Reader role
    const readerCreds = await assumeRole(outputs.readerRoleArn);

    // Read incident
    const response = await makeSignedRequest(
      'GET',
      `/incidents/${incidentId}`,
      undefined,
      {},
      readerCreds
    );

    expect(response.status).toBe(200);
    const readIncident: any = await response.json();
    expect(readIncident.incidentId).toBe(incidentId);
  }, 30000);

  it('Scenario 12: should allow Approver role to approve actions', async () => {
    // Create incident and transition to WAITING_FOR_HUMAN
    const createResponse = await makeSignedRequest('POST', '/incidents', {
      service: 'test-service',
      severity: 'SEV3',
      title: `IAM test - Approver role - ${Date.now()}`,
    });
    const incident: any = await createResponse.json();
    const incidentId = incident.incidentId;

    // Transition to WAITING_FOR_HUMAN
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

    // Assume Approver role
    const approverCreds = await assumeRole(outputs.approverRoleArn);

    // Approve
    const response = await makeSignedRequest(
      'POST',
      `/incidents/${incidentId}/approvals`,
      {
        action: 'APPROVE',
        reason: 'Approved by approver role',
      },
      {},
      approverCreds
    );

    expect(response.status).toBe(200);
    const closedIncident: any = await response.json();
    expect(closedIncident.state).toBe('CLOSED');
  }, 30000);
});
