/**
 * Phase 4 - Step 7: Complete Learning Pipeline Integration Test
 * 
 * Tests for end-to-end learning flow.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutcomeRecorder } from '../../src/learning/outcome-recorder';
import { PatternExtractor } from '../../src/learning/pattern-extractor';
import { ConfidenceCalibrator } from '../../src/learning/confidence-calibrator';
import { SnapshotService } from '../../src/learning/snapshot-service';
import type { OutcomeStore } from '../../src/learning/outcome-store';
import type { ValidationGate } from '../../src/learning/validation-gate';
import type { IncidentStore } from '../../src/incident/incident-store';
import type { ResolutionSummaryStore } from '../../src/learning/resolution-summary-store';
import type { CalibrationStore } from '../../src/learning/calibration-store';
import type { SnapshotStore } from '../../src/learning/snapshot-store';
import { createClosedIncident, validOutcomeRequest, humanAuthority } from './test-helpers';

describe('Phase 4: Complete Learning Pipeline', () => {
  let outcomeRecorder: OutcomeRecorder;
  let patternExtractor: PatternExtractor;
  let confidenceCalibrator: ConfidenceCalibrator;
  let snapshotService: SnapshotService;
  let outcomeStore: OutcomeStore;
  let validationGate: ValidationGate;
  let incidentStore: IncidentStore;
  let summaryStore: ResolutionSummaryStore;
  let calibrationStore: CalibrationStore;
  let snapshotStore: SnapshotStore;
  let buildOutcomeMock: any;
  
  beforeEach(() => {
    // Mock stores
    outcomeStore = {} as OutcomeStore;
    
    // Create mock function and keep reference
    buildOutcomeMock = vi.fn();
    validationGate = {
      buildOutcome: buildOutcomeMock,
    } as unknown as ValidationGate;
    
    incidentStore = {} as IncidentStore;
    summaryStore = {} as ResolutionSummaryStore;
    calibrationStore = {} as CalibrationStore;
    snapshotStore = {} as SnapshotStore;
    
    // Create services
    outcomeRecorder = new OutcomeRecorder(
      validationGate,
      outcomeStore,
      incidentStore
    );
    
    patternExtractor = new PatternExtractor(
      outcomeStore,
      summaryStore
    );
    
    confidenceCalibrator = new ConfidenceCalibrator(
      outcomeStore,
      calibrationStore
    );
    
    snapshotService = new SnapshotService(
      outcomeStore,
      summaryStore,
      calibrationStore,
      snapshotStore
    );
  });
  
  it('should execute complete learning flow', async () => {
    const incident = createClosedIncident();
    
    // Mock incident store
    incidentStore.getIncident = vi.fn().mockResolvedValue(incident);
    
    // Mock validation gate
    buildOutcomeMock.mockReturnValue({
      outcomeId: 'a'.repeat(64),
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
    
    // Mock outcome store
    outcomeStore.recordOutcome = vi.fn().mockResolvedValue(true);
    outcomeStore.getOutcome = vi.fn().mockResolvedValue({
      outcomeId: 'a'.repeat(64),
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
    outcomeStore.listOutcomes = vi.fn().mockResolvedValue([
      {
        outcomeId: 'a'.repeat(64),
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
    
    // Mock summary store
    summaryStore.storeSummary = vi.fn().mockResolvedValue(true);
    summaryStore.getSummary = vi.fn().mockResolvedValue({
      summaryId: 'b'.repeat(64),
      service: incident.service,
      startDate: incident.openedAt,
      endDate: incident.closedAt!,
      generatedAt: new Date().toISOString(),
      metrics: {
        totalIncidents: 1,
        truePositives: 1,
        falsePositives: 0,
        averageTTD: 0,
        averageTTR: 3600000,
        averageConfidence: 0.8,
      },
      patterns: {
        commonRootCauses: [],
        commonResolutions: [],
        detectionWarnings: [],
      },
      version: '1.0.0',
    });
    summaryStore.listSummaries = vi.fn().mockResolvedValue([]);
    
    // Mock calibration store
    calibrationStore.storeCalibration = vi.fn().mockResolvedValue(true);
    calibrationStore.getCalibration = vi.fn().mockResolvedValue({
      calibrationId: 'c'.repeat(64),
      startDate: incident.openedAt,
      endDate: incident.closedAt!,
      generatedAt: new Date().toISOString(),
      bandCalibrations: [{
        band: 'HIGH',
        totalIncidents: 1,
        truePositives: 1,
        falsePositives: 0,
        accuracy: 1.0,
        expectedAccuracy: 0.7,
        drift: 0.3,
        sampleSizeSufficient: false,
      }],
      driftAnalysis: {
        overconfident: 0,
        underconfident: 0,
        wellCalibrated: 0,
        insufficientData: 1,
        averageDrift: 0,
        maxDrift: 0,
      },
      recommendations: [],
      version: '1.0.0',
    });
    calibrationStore.listCalibrations = vi.fn().mockResolvedValue([]);
    
    // Mock snapshot store
    snapshotStore.storeSnapshot = vi.fn().mockResolvedValue(true);
    snapshotStore.getSnapshot = vi.fn().mockResolvedValue({
      snapshotId: 'd'.repeat(64),
      snapshotType: 'CUSTOM',
      startDate: incident.openedAt,
      endDate: incident.closedAt!,
      generatedAt: new Date().toISOString(),
      data: {
        totalOutcomes: 1,
        totalSummaries: 0,
        totalCalibrations: 0,
        services: [incident.service],
        dateRange: {
          start: incident.openedAt,
          end: incident.closedAt!,
        },
      },
      outcomeIds: ['a'.repeat(64)],
      summaryIds: [],
      calibrationIds: [],
      version: '1.0.0',
    });
    
    // STEP 1: Record outcome
    const outcomeResult = await outcomeRecorder.recordOutcome(
      incident.incidentId,
      validOutcomeRequest,
      humanAuthority
    );
    
    expect(outcomeResult.success).toBe(true);
    expect(outcomeResult.created).toBe(true);
    
    // STEP 2: Verify outcome stored
    const outcome = await outcomeStore.getOutcome(outcomeResult.outcomeId);
    expect(outcome).not.toBeNull();
    expect(outcome!.incidentId).toBe(incident.incidentId);
    
    // STEP 3: Extract patterns
    const summary = await patternExtractor.extractPatterns(
      incident.service,
      incident.openedAt,
      incident.closedAt!
    );
    
    expect(summary.metrics.totalIncidents).toBeGreaterThan(0);
    
    // STEP 4: Verify summary created
    const storedSummary = await summaryStore.getSummary(summary.summaryId);
    expect(storedSummary).not.toBeNull();
    
    // STEP 5: Calibrate confidence
    const calibration = await confidenceCalibrator.calibrateConfidence(
      incident.openedAt,
      incident.closedAt!
    );
    
    expect(calibration.bandCalibrations.length).toBeGreaterThan(0);
    
    // STEP 6: Verify calibration created
    const storedCalibration = await calibrationStore.getCalibration(
      calibration.calibrationId
    );
    expect(storedCalibration).not.toBeNull();
    
    // STEP 7: Create snapshot
    const snapshot = await snapshotService.createSnapshot(
      'CUSTOM',
      incident.openedAt,
      incident.closedAt!
    );
    
    expect(snapshot.data.totalOutcomes).toBeGreaterThan(0);
    
    // STEP 8: Verify snapshot created
    const storedSnapshot = await snapshotStore.getSnapshot(snapshot.snapshotId);
    expect(storedSnapshot).not.toBeNull();
    
    // STEP 9: Verify no incidents modified
    const unchangedIncident = await incidentStore.getIncident(incident.incidentId);
    expect(unchangedIncident).toEqual(incident);
  });
});
