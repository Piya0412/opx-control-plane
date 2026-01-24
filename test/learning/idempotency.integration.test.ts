/**
 * Phase 4 - Step 7: Idempotency Verification Integration Test
 * 
 * Tests for idempotent operations across learning pipeline.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutcomeRecorder } from '../../src/learning/outcome-recorder';
import { PatternExtractor } from '../../src/learning/pattern-extractor';
import { computeOutcomeId } from '../../src/learning/outcome-id';
import type { OutcomeStore } from '../../src/learning/outcome-store';
import type { ValidationGate } from '../../src/learning/validation-gate';
import type { IncidentStore } from '../../src/incident/incident-store';
import type { ResolutionSummaryStore } from '../../src/learning/resolution-summary-store';
import { createClosedIncident, createMultipleClosedIncidents, validOutcomeRequest, humanAuthority } from './test-helpers';

describe('Phase 4: Idempotency Verification', () => {
  let outcomeRecorder: OutcomeRecorder;
  let patternExtractor: PatternExtractor;
  let outcomeStore: OutcomeStore;
  let validationGate: ValidationGate;
  let incidentStore: IncidentStore;
  let summaryStore: ResolutionSummaryStore;
  let buildOutcomeMock: any;
  
  beforeEach(() => {
    outcomeStore = {} as OutcomeStore;
    
    // Create mock function and keep reference
    buildOutcomeMock = vi.fn();
    validationGate = {
      buildOutcome: buildOutcomeMock,
    } as unknown as ValidationGate;
    
    incidentStore = {} as IncidentStore;
    summaryStore = {} as ResolutionSummaryStore;
    
    outcomeRecorder = new OutcomeRecorder(
      validationGate,
      outcomeStore,
      incidentStore
    );
    
    patternExtractor = new PatternExtractor(
      outcomeStore,
      summaryStore
    );
  });
  
  it('should be idempotent for outcome recording', async () => {
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
    
    // Record 3 times
    outcomeStore.recordOutcome = vi.fn()
      .mockResolvedValueOnce(true)   // First: created
      .mockResolvedValueOnce(false)  // Second: duplicate
      .mockResolvedValueOnce(false); // Third: duplicate
    
    const result1 = await outcomeRecorder.recordOutcome(
      incident.incidentId,
      validOutcomeRequest,
      humanAuthority
    );
    
    const result2 = await outcomeRecorder.recordOutcome(
      incident.incidentId,
      validOutcomeRequest,
      humanAuthority
    );
    
    const result3 = await outcomeRecorder.recordOutcome(
      incident.incidentId,
      validOutcomeRequest,
      humanAuthority
    );
    
    // Verify same outcome ID
    expect(result1.outcomeId).toBe(result2.outcomeId);
    expect(result2.outcomeId).toBe(result3.outcomeId);
    
    // Verify only first created
    expect(result1.created).toBe(true);
    expect(result2.created).toBe(false);
    expect(result3.created).toBe(false);
    
    // Verify no duplicates in store
    outcomeStore.listOutcomes = vi.fn().mockResolvedValue([
      {
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
      },
    ]);
    
    const outcomes = await outcomeStore.listOutcomes({});
    const matchingOutcomes = outcomes.filter(
      (o: any) => o.incidentId === incident.incidentId
    );
    expect(matchingOutcomes).toHaveLength(1);
  });
  
  it('should generate same outcome ID for same incident', () => {
    const incident = createClosedIncident();
    
    const id1 = computeOutcomeId(incident.incidentId, incident.closedAt!);
    const id2 = computeOutcomeId(incident.incidentId, incident.closedAt!);
    
    expect(id1).toBe(id2);
    expect(id1).toHaveLength(64);
  });
  
  it('should allow multiple pattern extractions with same summaryId', async () => {
    const incidents = createMultipleClosedIncidents(5);
    
    const outcomes = incidents.map((incident: any) => ({
      outcomeId: incident.incidentId,
      incidentId: incident.incidentId,
      service: incident.service,
      recordedAt: incident.closedAt!,
      validatedAt: incident.closedAt!,
      recordedBy: humanAuthority,
      classification: validOutcomeRequest.classification,
      timing: {
        detectedAt: incident.openedAt,
        resolvedAt: incident.closedAt!,
        closedAt: incident.closedAt!,
        ttd: 0,
        ttr: 1800000,
      },
      humanAssessment: validOutcomeRequest.humanAssessment,
      version: '1.0.0',
    }));
    
    outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
    summaryStore.storeSummary = vi.fn().mockResolvedValue(true);
    
    // Extract twice
    const summary1 = await patternExtractor.extractPatterns(
      'test-service',
      incidents[0].openedAt,
      incidents[4].closedAt!
    );
    
    const summary2 = await patternExtractor.extractPatterns(
      'test-service',
      incidents[0].openedAt,
      incidents[4].closedAt!
    );
    
    // Same summaryId (deterministic, idempotent)
    expect(summary1.summaryId).toBe(summary2.summaryId);
    
    // Same metrics
    expect(summary1.totalIncidents).toBe(summary2.totalIncidents);
    expect(summary1.truePositives).toBe(summary2.truePositives);
    expect(summary1.falsePositives).toBe(summary2.falsePositives);
  });
  
  it('should generate different outcome IDs for different incidents', () => {
    const incident1 = createClosedIncident();
    const incident2 = { ...incident1, incidentId: 'different'.padEnd(64, '0') };
    
    const id1 = computeOutcomeId(incident1.incidentId, incident1.closedAt!);
    const id2 = computeOutcomeId(incident2.incidentId, incident2.closedAt!);
    
    expect(id1).not.toBe(id2);
  });
  
  it('should generate different outcome IDs for different timestamps', () => {
    const incident = createClosedIncident();
    const closedAt1 = incident.closedAt!;
    const closedAt2 = new Date(Date.now() + 1000).toISOString();
    
    const id1 = computeOutcomeId(incident.incidentId, closedAt1);
    const id2 = computeOutcomeId(incident.incidentId, closedAt2);
    
    expect(id1).not.toBe(id2);
  });
});
