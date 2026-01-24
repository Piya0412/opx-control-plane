/**
 * Phase 4 - Step 7: Offline Processing Verification Integration Test
 * 
 * Tests for offline-only processing (no live system impact).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PatternExtractor } from '../../src/learning/pattern-extractor';
import { ConfidenceCalibrator } from '../../src/learning/confidence-calibrator';
import { SnapshotService } from '../../src/learning/snapshot-service';
import type { OutcomeStore } from '../../src/learning/outcome-store';
import type { ResolutionSummaryStore } from '../../src/learning/resolution-summary-store';
import type { CalibrationStore } from '../../src/learning/calibration-store';
import type { SnapshotStore } from '../../src/learning/snapshot-store';
import type { IncidentStore } from '../../src/incident/incident-store';
import { createMultipleClosedIncidents, humanAuthority, validOutcomeRequest } from './test-helpers';

describe('Phase 4: Offline Processing Verification', () => {
  let patternExtractor: PatternExtractor;
  let confidenceCalibrator: ConfidenceCalibrator;
  let snapshotService: SnapshotService;
  let outcomeStore: OutcomeStore;
  let summaryStore: ResolutionSummaryStore;
  let calibrationStore: CalibrationStore;
  let snapshotStore: SnapshotStore;
  let incidentStore: IncidentStore;
  
  beforeEach(() => {
    outcomeStore = {} as OutcomeStore;
    summaryStore = {} as ResolutionSummaryStore;
    calibrationStore = {} as CalibrationStore;
    snapshotStore = {} as SnapshotStore;
    incidentStore = {} as IncidentStore;
    
    patternExtractor = new PatternExtractor(outcomeStore, summaryStore);
    confidenceCalibrator = new ConfidenceCalibrator(outcomeStore, calibrationStore);
    snapshotService = new SnapshotService(
      outcomeStore,
      summaryStore,
      calibrationStore,
      snapshotStore
    );
  });
  
  it('should not modify incidents during pattern extraction', async () => {
    const incidents = createMultipleClosedIncidents(10);
    
    // Mock outcomes
    const outcomes = incidents.map(incident => ({
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
    
    // Snapshot incidents before extraction
    const incidentsBefore = [...incidents];
    incidentStore.getIncident = vi.fn().mockImplementation((id: string) => {
      return Promise.resolve(incidents.find(i => i.incidentId === id));
    });
    
    // Run pattern extraction
    await patternExtractor.extractPatterns(
      'test-service',
      incidents[0].openedAt,
      incidents[9].closedAt!
    );
    
    // Verify incidents unchanged
    for (let i = 0; i < incidents.length; i++) {
      const unchangedIncident = await incidentStore.getIncident(incidents[i].incidentId);
      expect(unchangedIncident).toEqual(incidentsBefore[i]);
    }
  });
  
  it('should not modify outcomes during calibration', async () => {
    const incidents = createMultipleClosedIncidents(10);
    
    // Mock outcomes
    const outcomes = incidents.map(incident => ({
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
    
    // Snapshot outcomes before calibration
    const outcomesBefore = [...outcomes];
    outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
    calibrationStore.storeCalibration = vi.fn().mockResolvedValue(true);
    
    // Run calibration
    await confidenceCalibrator.calibrateConfidence(
      incidents[0].openedAt,
      incidents[9].closedAt!
    );
    
    // Verify outcomes unchanged
    const outcomesAfter = await outcomeStore.listOutcomes({
      startDate: incidents[0].openedAt,
      endDate: incidents[9].closedAt!,
    });
    
    expect(outcomesAfter).toEqual(outcomesBefore);
  });
  
  it('should not modify outcomes during snapshot creation', async () => {
    const incidents = createMultipleClosedIncidents(10);
    
    // Mock outcomes
    const outcomes = incidents.map(incident => ({
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
    
    // Snapshot outcomes before snapshot
    const outcomesBefore = [...outcomes];
    outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
    summaryStore.listSummaries = vi.fn().mockResolvedValue([]);
    calibrationStore.listCalibrations = vi.fn().mockResolvedValue([]);
    snapshotStore.storeSnapshot = vi.fn().mockResolvedValue(true);
    
    // Create snapshot
    await snapshotService.createSnapshot(
      'CUSTOM',
      incidents[0].openedAt,
      incidents[9].closedAt!
    );
    
    // Verify outcomes unchanged
    const outcomesAfter = await outcomeStore.listOutcomes({
      startDate: incidents[0].openedAt,
      endDate: incidents[9].closedAt!,
    });
    
    expect(outcomesAfter).toEqual(outcomesBefore);
  });
});
