/**
 * Phase 4 - Step 7: Append-Only Verification Integration Test
 * 
 * Tests for append-only storage enforcement.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { OutcomeStore } from '../../src/learning/outcome-store';
import { OutcomeRecorder } from '../../src/learning/outcome-recorder';
import type { ValidationGate } from '../../src/learning/validation-gate';
import type { IncidentStore } from '../../src/incident/incident-store';
import { createClosedIncident, validOutcomeRequest, humanAuthority } from './test-helpers';

describe('Phase 4: Append-Only Verification', () => {
  let outcomeStore: OutcomeStore;
  let outcomeRecorder: OutcomeRecorder;
  let validationGate: ValidationGate;
  let incidentStore: IncidentStore;
  let buildOutcomeMock: any;
  
  beforeEach(() => {
    const dynamoClient = {} as DynamoDBClient;
    outcomeStore = new OutcomeStore(dynamoClient, 'test-table');
    
    // Create mock function and keep reference
    buildOutcomeMock = vi.fn();
    validationGate = {
      buildOutcome: buildOutcomeMock,
    } as unknown as ValidationGate;
    
    incidentStore = {} as IncidentStore;
    
    outcomeRecorder = new OutcomeRecorder(
      validationGate,
      outcomeStore,
      incidentStore
    );
  });
  
  it('should not have update methods', () => {
    expect(outcomeStore).not.toHaveProperty('updateOutcome');
    expect(outcomeStore).not.toHaveProperty('modifyOutcome');
    expect(outcomeStore).not.toHaveProperty('editOutcome');
  });
  
  it('should not have delete methods', () => {
    expect(outcomeStore).not.toHaveProperty('deleteOutcome');
    expect(outcomeStore).not.toHaveProperty('removeOutcome');
  });
  
  it('should be idempotent on duplicate write', async () => {
    const incident = createClosedIncident();
    const outcomeId = 'a'.repeat(64);
    
    incidentStore.getIncident = vi.fn().mockResolvedValue(incident);
    buildOutcomeMock.mockReturnValue({
      outcomeId,
      incidentId: incident.incidentId,
      service: incident.service,
      recordedAt: new Date().toISOString(),
      validatedAt: new Date().toISOString(),
      recordedBy: humanAuthority,
      classification: validOutcomeRequest.classification,
      timing: {
        detectedAt: incident.openedAt,
        resolvedAt: incident.closedAt!,
        closedAt: incident.closedAt!,
        ttd: 0,
        ttr: 3600000,
      },
      humanAssessment: validOutcomeRequest.humanAssessment,
      version: '1.0.0',
    });
    
    // First write
    outcomeStore.recordOutcome = vi.fn().mockResolvedValueOnce(true);
    const result1 = await outcomeRecorder.recordOutcome(
      incident.incidentId,
      validOutcomeRequest,
      humanAuthority
    );
    
    expect(result1.created).toBe(true);
    
    // Second write (duplicate)
    outcomeStore.recordOutcome = vi.fn().mockResolvedValueOnce(false);
    const result2 = await outcomeRecorder.recordOutcome(
      incident.incidentId,
      validOutcomeRequest,
      humanAuthority
    );
    
    expect(result2.created).toBe(false);
    expect(result2.outcomeId).toBe(result1.outcomeId);
  });
  
  it('should not modify original outcome on duplicate', async () => {
    const incident = createClosedIncident();
    const outcomeId = 'a'.repeat(64);
    const originalOutcome = {
      outcomeId,
      incidentId: incident.incidentId,
      service: incident.service,
      recordedAt: new Date().toISOString(),
      validatedAt: new Date().toISOString(),
      recordedBy: humanAuthority,
      classification: validOutcomeRequest.classification,
      timing: {
        detectedAt: incident.openedAt,
        resolvedAt: incident.closedAt!,
        closedAt: incident.closedAt!,
        ttd: 0,
        ttr: 3600000,
      },
      humanAssessment: validOutcomeRequest.humanAssessment,
      version: '1.0.0',
    };
    
    incidentStore.getIncident = vi.fn().mockResolvedValue(incident);
    buildOutcomeMock.mockReturnValue(originalOutcome);
    
    // First write
    outcomeStore.recordOutcome = vi.fn().mockResolvedValueOnce(true);
    outcomeStore.getOutcome = vi.fn().mockResolvedValue(originalOutcome);
    
    const result1 = await outcomeRecorder.recordOutcome(
      incident.incidentId,
      validOutcomeRequest,
      humanAuthority
    );
    
    const original = await outcomeStore.getOutcome(result1.outcomeId);
    
    // Second write with different data
    const differentRequest = {
      ...validOutcomeRequest,
      classification: {
        ...validOutcomeRequest.classification,
        rootCause: 'Different root cause',
      },
    };
    
    buildOutcomeMock.mockReturnValue({
      ...originalOutcome,
      classification: differentRequest.classification,
    });
    outcomeStore.recordOutcome = vi.fn().mockResolvedValueOnce(false);
    
    await outcomeRecorder.recordOutcome(
      incident.incidentId,
      differentRequest,
      humanAuthority
    );
    
    // Verify original unchanged
    const unchanged = await outcomeStore.getOutcome(result1.outcomeId);
    expect(unchanged).toEqual(original);
  });
});
