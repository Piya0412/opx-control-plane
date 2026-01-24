/**
 * Phase 4 - Step 7: Human Validation Enforcement Integration Test
 * 
 * Tests for human-only validation enforcement.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutcomeRecorder } from '../../src/learning/outcome-recorder';
import type { OutcomeStore } from '../../src/learning/outcome-store';
import type { ValidationGate } from '../../src/learning/validation-gate';
import type { IncidentStore } from '../../src/incident/incident-store';
import { ValidationError } from '../../src/learning/validation-gate';
import { createClosedIncident, createOpenIncident, validOutcomeRequest } from './test-helpers';

describe('Phase 4: Human Validation Enforcement', () => {
  let outcomeRecorder: OutcomeRecorder;
  let outcomeStore: OutcomeStore;
  let validationGate: ValidationGate;
  let incidentStore: IncidentStore;
  let buildOutcomeMock: any;
  
  beforeEach(() => {
    outcomeStore = {} as OutcomeStore;
    
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
  
  it('should reject AUTO_ENGINE authority', async () => {
    const incident = createClosedIncident();
    
    incidentStore.getIncident = vi.fn().mockResolvedValue(incident);
    buildOutcomeMock.mockImplementation(() => {
      throw new ValidationError('AUTO_ENGINE cannot validate outcomes. Only human authorities are allowed.');
    });
    
    await expect(
      outcomeRecorder.recordOutcome(
        incident.incidentId,
        validOutcomeRequest,
        { type: 'AUTO_ENGINE', principal: 'system' }
      )
    ).rejects.toThrow('AUTO_ENGINE cannot validate outcomes');
  });
  
  it('should accept HUMAN_OPERATOR authority', async () => {
    const incident = createClosedIncident();
    
    incidentStore.getIncident = vi.fn().mockResolvedValue(incident);
    buildOutcomeMock.mockReturnValue({
      outcomeId: 'a'.repeat(64),
      incidentId: incident.incidentId,
      service: incident.service,
      recordedAt: new Date().toISOString(),
      validatedAt: new Date().toISOString(),
      recordedBy: { type: 'HUMAN_OPERATOR', principal: 'arn:aws:iam::123456789012:user/operator' },
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
    outcomeStore.recordOutcome = vi.fn().mockResolvedValue(true);
    
    const result = await outcomeRecorder.recordOutcome(
      incident.incidentId,
      validOutcomeRequest,
      { type: 'HUMAN_OPERATOR', principal: 'arn:aws:iam::123456789012:user/operator' }
    );
    
    expect(result.success).toBe(true);
  });
  
  it('should accept ON_CALL_SRE authority', async () => {
    const incident = createClosedIncident();
    
    incidentStore.getIncident = vi.fn().mockResolvedValue(incident);
    buildOutcomeMock.mockReturnValue({
      outcomeId: 'a'.repeat(64),
      incidentId: incident.incidentId,
      service: incident.service,
      recordedAt: new Date().toISOString(),
      validatedAt: new Date().toISOString(),
      recordedBy: { type: 'ON_CALL_SRE', principal: 'arn:aws:iam::123456789012:user/sre' },
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
    outcomeStore.recordOutcome = vi.fn().mockResolvedValue(true);
    
    const result = await outcomeRecorder.recordOutcome(
      incident.incidentId,
      validOutcomeRequest,
      { type: 'ON_CALL_SRE', principal: 'arn:aws:iam::123456789012:user/sre' }
    );
    
    expect(result.success).toBe(true);
  });
  
  it('should accept EMERGENCY_OVERRIDE authority', async () => {
    const incident = createClosedIncident();
    
    incidentStore.getIncident = vi.fn().mockResolvedValue(incident);
    buildOutcomeMock.mockReturnValue({
      outcomeId: 'a'.repeat(64),
      incidentId: incident.incidentId,
      service: incident.service,
      recordedAt: new Date().toISOString(),
      validatedAt: new Date().toISOString(),
      recordedBy: { type: 'EMERGENCY_OVERRIDE', principal: 'arn:aws:iam::123456789012:user/admin' },
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
    outcomeStore.recordOutcome = vi.fn().mockResolvedValue(true);
    
    const result = await outcomeRecorder.recordOutcome(
      incident.incidentId,
      validOutcomeRequest,
      { type: 'EMERGENCY_OVERRIDE', principal: 'arn:aws:iam::123456789012:user/admin' }
    );
    
    expect(result.success).toBe(true);
  });
  
  it('should reject non-CLOSED incident', async () => {
    const incident = createOpenIncident();
    
    incidentStore.getIncident = vi.fn().mockResolvedValue(incident);
    buildOutcomeMock.mockImplementation(() => {
      throw new ValidationError('Validation failed: Outcome can only be recorded for CLOSED incidents. Current state: OPEN. Please wait until incident is closed.');
    });
    
    await expect(
      outcomeRecorder.recordOutcome(
        incident.incidentId,
        validOutcomeRequest,
        { type: 'HUMAN_OPERATOR', principal: 'arn:aws:iam::123456789012:user/operator' }
      )
    ).rejects.toThrow('CLOSED incidents');
  });
});
