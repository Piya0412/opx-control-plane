/**
 * Phase 4 - Step 6: Snapshot Schema
 * 
 * Versioned snapshots of learning data.
 * 
 * CRITICAL: snapshotId is DETERMINISTIC (SHA256, not UUID)
 */

import { z } from 'zod';

/**
 * Snapshot Type
 * 
 * Frequency of snapshot.
 */
export const SnapshotTypeSchema = z.enum([
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'CUSTOM',
]);

export type SnapshotType = z.infer<typeof SnapshotTypeSchema>;

/**
 * Snapshot Data
 * 
 * Aggregated data in snapshot.
 */
export const SnapshotDataSchema = z.object({
  totalOutcomes: z.number().nonnegative(),
  totalSummaries: z.number().nonnegative(),
  totalCalibrations: z.number().nonnegative(),
  services: z.array(z.string()),
  dateRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
});

/**
 * Learning Snapshot
 * 
 * Complete snapshot record.
 * 
 * CRITICAL: snapshotId is DETERMINISTIC (not UUID).
 * snapshotId = SHA256(snapshotType + ":" + startDate + ":" + endDate + ":" + version)
 */
export const LearningSnapshotSchema = z.object({
  snapshotId: z.string().length(64), // SHA256 hex (deterministic)
  snapshotType: SnapshotTypeSchema,
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  generatedAt: z.string().datetime(),
  data: SnapshotDataSchema,
  outcomeIds: z.array(z.string()),
  summaryIds: z.array(z.string()),
  calibrationIds: z.array(z.string()),
  version: z.string().min(1),
});

// Export types
export type SnapshotData = z.infer<typeof SnapshotDataSchema>;
export type LearningSnapshot = z.infer<typeof LearningSnapshotSchema>;
