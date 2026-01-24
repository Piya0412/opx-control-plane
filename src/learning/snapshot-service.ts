/**
 * Phase 4 - Step 6: Snapshot Service
 * 
 * Create and manage learning snapshots.
 * 
 * CRITICAL RULES:
 * - snapshotId is deterministic (SHA256)
 * - Offline-only (no live system impact)
 * - Append-only storage
 */

import { createHash } from 'crypto';
import type { OutcomeStore } from './outcome-store';
import type { ResolutionSummaryStore } from './resolution-summary-store';
import type { CalibrationStore } from './calibration-store';
import type { SnapshotStore } from './snapshot-store';
import type { IncidentOutcome } from './outcome.schema';
import type { ResolutionSummary } from './resolution-summary.schema';
import type { ConfidenceCalibration } from './calibration.schema';
import type {
  LearningSnapshot,
  SnapshotType,
  SnapshotData,
} from './snapshot.schema';

/**
 * Snapshot Service
 * 
 * OFFLINE-ONLY: Creates versioned snapshots of learning data.
 */
export class SnapshotService {
  constructor(
    private readonly outcomeStore: OutcomeStore,
    private readonly summaryStore: ResolutionSummaryStore,
    private readonly calibrationStore: CalibrationStore,
    private readonly snapshotStore: SnapshotStore
  ) {}
  
  /**
   * Create snapshot for time window
   * 
   * @param snapshotType - Type of snapshot
   * @param startDate - Start date (ISO-8601)
   * @param endDate - End date (ISO-8601)
   * @returns Learning snapshot
   */
  async createSnapshot(
    snapshotType: SnapshotType,
    startDate: string,
    endDate: string
  ): Promise<LearningSnapshot> {
    // Step 1: Validate time window
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (end <= start) {
      throw new Error('End date must be after start date');
    }
    
    // Step 2: Load data
    const outcomes = await this.outcomeStore.listOutcomes({
      startDate,
      endDate,
    });
    
    const summaries = await this.summaryStore.listSummaries(
      undefined, // all services
      startDate,
      endDate
    );
    
    const calibrations = await this.calibrationStore.listCalibrations(
      startDate,
      endDate
    );
    
    // Step 3: Build snapshot data
    const data = this.buildSnapshotData(
      outcomes,
      summaries,
      calibrations,
      startDate,
      endDate
    );
    
    // Step 4: Extract IDs
    const outcomeIds = outcomes.map(o => o.outcomeId);
    const summaryIds = summaries.map(s => s.summaryId);
    const calibrationIds = calibrations.map(c => c.calibrationId);
    
    // Step 5: Generate deterministic snapshotId
    const snapshotId = this.computeSnapshotId(snapshotType, startDate, endDate, '1.0.0');
    const generatedAt = new Date().toISOString();
    
    // Step 6: Build snapshot
    const snapshot: LearningSnapshot = {
      snapshotId,
      snapshotType,
      startDate,
      endDate,
      generatedAt,
      data,
      outcomeIds,
      summaryIds,
      calibrationIds,
      version: '1.0.0',
    };
    
    // Step 7: Store snapshot (idempotent)
    await this.snapshotStore.storeSnapshot(snapshot);
    
    // Step 8: Return snapshot
    return snapshot;
  }
  
  /**
   * Create daily snapshot
   * 
   * @param date - Date (ISO-8601, defaults to yesterday)
   * @returns Learning snapshot
   */
  async createDailySnapshot(date?: string): Promise<LearningSnapshot> {
    // Default to yesterday
    const targetDate = date 
      ? new Date(date) 
      : new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const startDate = new Date(targetDate);
    startDate.setUTCHours(0, 0, 0, 0);
    
    const endDate = new Date(targetDate);
    endDate.setUTCHours(23, 59, 59, 999);
    
    return this.createSnapshot(
      'DAILY',
      startDate.toISOString(),
      endDate.toISOString()
    );
  }
  
  /**
   * Create weekly snapshot
   * 
   * @param weekStart - Week start date (ISO-8601, defaults to last week)
   * @returns Learning snapshot
   */
  async createWeeklySnapshot(weekStart?: string): Promise<LearningSnapshot> {
    // Default to last week (Monday to Sunday)
    const targetDate = weekStart 
      ? new Date(weekStart) 
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Find Monday of the week
    const startDate = new Date(targetDate);
    const day = startDate.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day; // Adjust to Monday
    startDate.setUTCDate(startDate.getUTCDate() + diff);
    startDate.setUTCHours(0, 0, 0, 0);
    
    // Find Sunday of the week
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 6);
    endDate.setUTCHours(23, 59, 59, 999);
    
    return this.createSnapshot(
      'WEEKLY',
      startDate.toISOString(),
      endDate.toISOString()
    );
  }
  
  /**
   * Create monthly snapshot
   * 
   * @param month - Month (YYYY-MM, defaults to last month)
   * @returns Learning snapshot
   */
  async createMonthlySnapshot(month?: string): Promise<LearningSnapshot> {
    // Default to last month
    const targetDate = month 
      ? new Date(`${month}-01T00:00:00.000Z`) 
      : new Date(new Date().setMonth(new Date().getMonth() - 1));
    
    // First day of month (UTC)
    const startDate = new Date(Date.UTC(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth(),
      1,
      0, 0, 0, 0
    ));
    
    // Last day of month (UTC)
    const endDate = new Date(Date.UTC(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth() + 1,
      0,
      23, 59, 59, 999
    ));
    
    return this.createSnapshot(
      'MONTHLY',
      startDate.toISOString(),
      endDate.toISOString()
    );
  }
  
  /**
   * List snapshots
   * 
   * @param snapshotType - Type filter (optional)
   * @param startDate - Start date (optional)
   * @param endDate - End date (optional)
   * @returns Array of snapshots
   */
  async listSnapshots(
    snapshotType?: SnapshotType,
    startDate?: string,
    endDate?: string
  ): Promise<LearningSnapshot[]> {
    return this.snapshotStore.listSnapshots(snapshotType, startDate, endDate);
  }
  
  /**
   * Get snapshot by ID
   * 
   * @param snapshotId - Snapshot ID
   * @returns Snapshot or null if not found
   */
  async getSnapshot(snapshotId: string): Promise<LearningSnapshot | null> {
    return this.snapshotStore.getSnapshot(snapshotId);
  }
  
  /**
   * Build snapshot data
   */
  private buildSnapshotData(
    outcomes: IncidentOutcome[],
    summaries: ResolutionSummary[],
    calibrations: ConfidenceCalibration[],
    startDate: string,
    endDate: string
  ): SnapshotData {
    const services = this.extractServices(outcomes);
    
    return {
      totalOutcomes: outcomes.length,
      totalSummaries: summaries.length,
      totalCalibrations: calibrations.length,
      services,
      dateRange: {
        start: startDate,
        end: endDate,
      },
    };
  }
  
  /**
   * Extract unique services from outcomes
   */
  private extractServices(outcomes: IncidentOutcome[]): string[] {
    const serviceSet = new Set<string>();
    
    for (const outcome of outcomes) {
      serviceSet.add(outcome.service);
    }
    
    return Array.from(serviceSet).sort();
  }
  
  /**
   * Compute deterministic snapshot ID
   * 
   * LOCKED RULE: snapshotId = SHA256(snapshotType + ":" + startDate + ":" + endDate + ":" + version)
   */
  private computeSnapshotId(
    snapshotType: SnapshotType,
    startDate: string,
    endDate: string,
    version: string
  ): string {
    const input = `${snapshotType}:${startDate}:${endDate}:${version}`;
    const hash = createHash('sha256');
    hash.update(input);
    return hash.digest('hex');
  }
}
