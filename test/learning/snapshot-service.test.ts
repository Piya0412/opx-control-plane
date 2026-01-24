/**
 * Phase 4 - Step 6: Snapshot Service Tests
 * 
 * Tests for snapshot service logic.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SnapshotService } from '../../src/learning/snapshot-service';
import type { OutcomeStore } from '../../src/learning/outcome-store';
import type { ResolutionSummaryStore } from '../../src/learning/resolution-summary-store';
import type { CalibrationStore } from '../../src/learning/calibration-store';
import type { SnapshotStore } from '../../src/learning/snapshot-store';
import type { IncidentOutcome } from '../../src/learning/outcome.schema';
import type { ResolutionSummary } from '../../src/learning/resolution-summary.schema';
import type { ConfidenceCalibration } from '../../src/learning/calibration.schema';

describe('Phase 4 - Step 6: Snapshot Service', () => {
  let service: SnapshotService;
  let outcomeStore: OutcomeStore;
  let summaryStore: ResolutionSummaryStore;
  let calibrationStore: CalibrationStore;
  let snapshotStore: SnapshotStore;
  
  const createMockOutcome = (service: string): IncidentOutcome => ({
    outcomeId: 'a'.repeat(64),
    incidentId: 'b'.repeat(64),
    service,
    recordedAt: '2026-01-22T10:00:00.000Z',
    validatedAt: '2026-01-22T10:00:00.000Z',
    recordedBy: { type: 'HUMAN_OPERATOR', principal: 'arn:aws:iam::123456789012:user/operator' },
    classification: {
      truePositive: true,
      falsePositive: false,
      rootCause: 'Test',
      resolutionType: 'FIXED',
    },
    timing: {
      detectedAt: '2026-01-22T09:00:00.000Z',
      resolvedAt: '2026-01-22T09:45:00.000Z',
      closedAt: '2026-01-22T10:00:00.000Z',
      ttd: 0,
      ttr: 2700000,
    },
    humanAssessment: {
      confidenceRating: 0.8,
      severityAccuracy: 'ACCURATE',
      detectionQuality: 'GOOD',
    },
    version: '1.0.0',
  });
  
  const createMockSummary = (): ResolutionSummary => ({
    summaryId: 'c'.repeat(64),
    service: 'order-service',
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-01-31T23:59:59.999Z',
    generatedAt: '2026-02-01T00:00:00.000Z',
    totalIncidents: 10,
    truePositives: 8,
    falsePositives: 2,
    commonRootCauses: [],
    commonResolutions: [],
    detectionWarnings: [],
    version: '1.0.0',
  });
  
  const createMockCalibration = (): ConfidenceCalibration => ({
    calibrationId: 'd'.repeat(64),
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-01-31T23:59:59.999Z',
    generatedAt: '2026-02-01T00:00:00.000Z',
    bandCalibrations: [],
    driftAnalysis: {
      overconfident: 0,
      underconfident: 0,
      wellCalibrated: 0,
      insufficientData: 0,
      averageDrift: 0,
      maxDrift: 0,
    },
    recommendations: [],
    version: '1.0.0',
  });
  
  beforeEach(() => {
    outcomeStore = {} as OutcomeStore;
    summaryStore = {} as ResolutionSummaryStore;
    calibrationStore = {} as CalibrationStore;
    snapshotStore = {} as SnapshotStore;
    
    service = new SnapshotService(
      outcomeStore,
      summaryStore,
      calibrationStore,
      snapshotStore
    );
  });
  
  describe('createSnapshot', () => {
    it('should create snapshot with data', async () => {
      const outcomes = [
        createMockOutcome('order-service'),
        createMockOutcome('payment-service'),
      ];
      const summaries = [createMockSummary()];
      const calibrations = [createMockCalibration()];
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
      summaryStore.listSummaries = vi.fn().mockResolvedValue(summaries);
      calibrationStore.listCalibrations = vi.fn().mockResolvedValue(calibrations);
      snapshotStore.storeSnapshot = vi.fn().mockResolvedValue(true);
      
      const snapshot = await service.createSnapshot(
        'CUSTOM',
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      expect(snapshot.snapshotId).toHaveLength(64);
      expect(snapshot.snapshotType).toBe('CUSTOM');
      expect(snapshot.data.totalOutcomes).toBe(2);
      expect(snapshot.data.totalSummaries).toBe(1);
      expect(snapshot.data.totalCalibrations).toBe(1);
      expect(snapshot.data.services).toEqual(['order-service', 'payment-service']);
      expect(snapshot.outcomeIds).toHaveLength(2);
      expect(snapshot.summaryIds).toHaveLength(1);
      expect(snapshot.calibrationIds).toHaveLength(1);
    });
    
    it('should have deterministic snapshotId', async () => {
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue([]);
      summaryStore.listSummaries = vi.fn().mockResolvedValue([]);
      calibrationStore.listCalibrations = vi.fn().mockResolvedValue([]);
      snapshotStore.storeSnapshot = vi.fn().mockResolvedValue(true);
      
      const snapshot1 = await service.createSnapshot(
        'DAILY',
        '2026-01-22T00:00:00.000Z',
        '2026-01-22T23:59:59.999Z'
      );
      
      const snapshot2 = await service.createSnapshot(
        'DAILY',
        '2026-01-22T00:00:00.000Z',
        '2026-01-22T23:59:59.999Z'
      );
      
      expect(snapshot1.snapshotId).toBe(snapshot2.snapshotId);
    });
    
    it('should generate different snapshotId for different dates', async () => {
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue([]);
      summaryStore.listSummaries = vi.fn().mockResolvedValue([]);
      calibrationStore.listCalibrations = vi.fn().mockResolvedValue([]);
      snapshotStore.storeSnapshot = vi.fn().mockResolvedValue(true);
      
      const snapshot1 = await service.createSnapshot(
        'DAILY',
        '2026-01-22T00:00:00.000Z',
        '2026-01-22T23:59:59.999Z'
      );
      
      const snapshot2 = await service.createSnapshot(
        'DAILY',
        '2026-01-23T00:00:00.000Z',
        '2026-01-23T23:59:59.999Z'
      );
      
      expect(snapshot1.snapshotId).not.toBe(snapshot2.snapshotId);
    });
    
    it('should generate different snapshotId for different types', async () => {
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue([]);
      summaryStore.listSummaries = vi.fn().mockResolvedValue([]);
      calibrationStore.listCalibrations = vi.fn().mockResolvedValue([]);
      snapshotStore.storeSnapshot = vi.fn().mockResolvedValue(true);
      
      const snapshot1 = await service.createSnapshot(
        'DAILY',
        '2026-01-22T00:00:00.000Z',
        '2026-01-22T23:59:59.999Z'
      );
      
      const snapshot2 = await service.createSnapshot(
        'WEEKLY',
        '2026-01-22T00:00:00.000Z',
        '2026-01-22T23:59:59.999Z'
      );
      
      expect(snapshot1.snapshotId).not.toBe(snapshot2.snapshotId);
    });
    
    it('should throw error if end date before start date', async () => {
      await expect(
        service.createSnapshot(
          'DAILY',
          '2026-01-22T00:00:00.000Z',
          '2026-01-21T00:00:00.000Z'
        )
      ).rejects.toThrow('End date must be after start date');
    });
    
    it('should handle empty data', async () => {
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue([]);
      summaryStore.listSummaries = vi.fn().mockResolvedValue([]);
      calibrationStore.listCalibrations = vi.fn().mockResolvedValue([]);
      snapshotStore.storeSnapshot = vi.fn().mockResolvedValue(true);
      
      const snapshot = await service.createSnapshot(
        'DAILY',
        '2026-01-22T00:00:00.000Z',
        '2026-01-22T23:59:59.999Z'
      );
      
      expect(snapshot.data.totalOutcomes).toBe(0);
      expect(snapshot.data.totalSummaries).toBe(0);
      expect(snapshot.data.totalCalibrations).toBe(0);
      expect(snapshot.data.services).toEqual([]);
      expect(snapshot.outcomeIds).toEqual([]);
      expect(snapshot.summaryIds).toEqual([]);
      expect(snapshot.calibrationIds).toEqual([]);
    });
    
    it('should extract unique services sorted', async () => {
      const outcomes = [
        createMockOutcome('payment-service'),
        createMockOutcome('order-service'),
        createMockOutcome('payment-service'),
        createMockOutcome('user-service'),
      ];
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
      summaryStore.listSummaries = vi.fn().mockResolvedValue([]);
      calibrationStore.listCalibrations = vi.fn().mockResolvedValue([]);
      snapshotStore.storeSnapshot = vi.fn().mockResolvedValue(true);
      
      const snapshot = await service.createSnapshot(
        'DAILY',
        '2026-01-22T00:00:00.000Z',
        '2026-01-22T23:59:59.999Z'
      );
      
      expect(snapshot.data.services).toEqual([
        'order-service',
        'payment-service',
        'user-service',
      ]);
    });
  });
  
  describe('createDailySnapshot', () => {
    it('should create daily snapshot with correct date range', async () => {
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue([]);
      summaryStore.listSummaries = vi.fn().mockResolvedValue([]);
      calibrationStore.listCalibrations = vi.fn().mockResolvedValue([]);
      snapshotStore.storeSnapshot = vi.fn().mockResolvedValue(true);
      
      const snapshot = await service.createDailySnapshot('2026-01-22');
      
      expect(snapshot.snapshotType).toBe('DAILY');
      expect(snapshot.startDate).toContain('2026-01-22T00:00:00');
      expect(snapshot.endDate).toContain('2026-01-22T23:59:59');
    });
  });
  
  describe('createWeeklySnapshot', () => {
    it('should create weekly snapshot with correct date range', async () => {
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue([]);
      summaryStore.listSummaries = vi.fn().mockResolvedValue([]);
      calibrationStore.listCalibrations = vi.fn().mockResolvedValue([]);
      snapshotStore.storeSnapshot = vi.fn().mockResolvedValue(true);
      
      // 2026-01-22 is a Thursday, should get Monday (2026-01-19) to Sunday (2026-01-25)
      const snapshot = await service.createWeeklySnapshot('2026-01-22');
      
      expect(snapshot.snapshotType).toBe('WEEKLY');
      expect(snapshot.startDate).toContain('2026-01-19'); // Monday
      expect(snapshot.endDate).toContain('2026-01-25'); // Sunday
    });
  });
  
  describe('createMonthlySnapshot', () => {
    it('should create monthly snapshot with correct date range', async () => {
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue([]);
      summaryStore.listSummaries = vi.fn().mockResolvedValue([]);
      calibrationStore.listCalibrations = vi.fn().mockResolvedValue([]);
      snapshotStore.storeSnapshot = vi.fn().mockResolvedValue(true);
      
      const snapshot = await service.createMonthlySnapshot('2026-01');
      
      expect(snapshot.snapshotType).toBe('MONTHLY');
      expect(snapshot.startDate).toContain('2026-01-01T00:00:00');
      expect(snapshot.endDate).toContain('2026-01-31T23:59:59');
    });
  });
  
  describe('listSnapshots', () => {
    it('should list snapshots', async () => {
      const mockSnapshots = [
        {
          snapshotId: 'a'.repeat(64),
          snapshotType: 'DAILY' as const,
          startDate: '2026-01-22T00:00:00.000Z',
          endDate: '2026-01-22T23:59:59.999Z',
          generatedAt: '2026-01-23T00:00:00.000Z',
          data: {
            totalOutcomes: 0,
            totalSummaries: 0,
            totalCalibrations: 0,
            services: [],
            dateRange: {
              start: '2026-01-22T00:00:00.000Z',
              end: '2026-01-22T23:59:59.999Z',
            },
          },
          outcomeIds: [],
          summaryIds: [],
          calibrationIds: [],
          version: '1.0.0',
        },
      ];
      
      snapshotStore.listSnapshots = vi.fn().mockResolvedValue(mockSnapshots);
      
      const snapshots = await service.listSnapshots();
      
      expect(snapshots).toEqual(mockSnapshots);
    });
    
    it('should filter by type', async () => {
      snapshotStore.listSnapshots = vi.fn().mockResolvedValue([]);
      
      await service.listSnapshots('DAILY');
      
      expect(snapshotStore.listSnapshots).toHaveBeenCalledWith('DAILY', undefined, undefined);
    });
  });
  
  describe('getSnapshot', () => {
    it('should get snapshot by ID', async () => {
      const mockSnapshot = {
        snapshotId: 'a'.repeat(64),
        snapshotType: 'DAILY' as const,
        startDate: '2026-01-22T00:00:00.000Z',
        endDate: '2026-01-22T23:59:59.999Z',
        generatedAt: '2026-01-23T00:00:00.000Z',
        data: {
          totalOutcomes: 0,
          totalSummaries: 0,
          totalCalibrations: 0,
          services: [],
          dateRange: {
            start: '2026-01-22T00:00:00.000Z',
            end: '2026-01-22T23:59:59.999Z',
          },
        },
        outcomeIds: [],
        summaryIds: [],
        calibrationIds: [],
        version: '1.0.0',
      };
      
      snapshotStore.getSnapshot = vi.fn().mockResolvedValue(mockSnapshot);
      
      const snapshot = await service.getSnapshot('a'.repeat(64));
      
      expect(snapshot).toEqual(mockSnapshot);
    });
  });
});
