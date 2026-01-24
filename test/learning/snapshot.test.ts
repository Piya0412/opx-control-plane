/**
 * Phase 4 - Step 6: Snapshot Schema Tests
 * 
 * Tests for snapshot schema validation.
 */

import { describe, it, expect } from 'vitest';
import {
  LearningSnapshotSchema,
  SnapshotDataSchema,
  SnapshotTypeSchema,
} from '../../src/learning/snapshot.schema';

describe('Phase 4 - Step 6: Snapshot Schema', () => {
  describe('SnapshotTypeSchema', () => {
    it('should validate valid snapshot types', () => {
      expect(SnapshotTypeSchema.parse('DAILY')).toBe('DAILY');
      expect(SnapshotTypeSchema.parse('WEEKLY')).toBe('WEEKLY');
      expect(SnapshotTypeSchema.parse('MONTHLY')).toBe('MONTHLY');
      expect(SnapshotTypeSchema.parse('CUSTOM')).toBe('CUSTOM');
    });
    
    it('should reject invalid snapshot type', () => {
      expect(() => SnapshotTypeSchema.parse('INVALID')).toThrow();
    });
  });
  
  describe('SnapshotDataSchema', () => {
    it('should validate valid snapshot data', () => {
      const data = {
        totalOutcomes: 10,
        totalSummaries: 2,
        totalCalibrations: 1,
        services: ['order-service', 'payment-service'],
        dateRange: {
          start: '2026-01-01T00:00:00.000Z',
          end: '2026-01-31T23:59:59.999Z',
        },
      };
      
      expect(SnapshotDataSchema.parse(data)).toEqual(data);
    });
    
    it('should reject negative metrics', () => {
      const data = {
        totalOutcomes: -1,
        totalSummaries: 0,
        totalCalibrations: 0,
        services: [],
        dateRange: {
          start: '2026-01-01T00:00:00.000Z',
          end: '2026-01-31T23:59:59.999Z',
        },
      };
      
      expect(() => SnapshotDataSchema.parse(data)).toThrow();
    });
  });
  
  describe('LearningSnapshotSchema', () => {
    it('should validate valid snapshot', () => {
      const snapshot = {
        snapshotId: 'a'.repeat(64),
        snapshotType: 'DAILY' as const,
        startDate: '2026-01-22T00:00:00.000Z',
        endDate: '2026-01-22T23:59:59.999Z',
        generatedAt: '2026-01-23T00:00:00.000Z',
        data: {
          totalOutcomes: 10,
          totalSummaries: 2,
          totalCalibrations: 1,
          services: ['order-service'],
          dateRange: {
            start: '2026-01-22T00:00:00.000Z',
            end: '2026-01-22T23:59:59.999Z',
          },
        },
        outcomeIds: ['b'.repeat(64)],
        summaryIds: ['c'.repeat(64)],
        calibrationIds: ['d'.repeat(64)],
        version: '1.0.0',
      };
      
      expect(LearningSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    });
    
    it('should reject invalid snapshotId (not 64 chars)', () => {
      const snapshot = {
        snapshotId: 'short',
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
      
      expect(() => LearningSnapshotSchema.parse(snapshot)).toThrow();
    });
    
    it('should reject invalid date', () => {
      const snapshot = {
        snapshotId: 'a'.repeat(64),
        snapshotType: 'DAILY' as const,
        startDate: 'invalid-date',
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
      
      expect(() => LearningSnapshotSchema.parse(snapshot)).toThrow();
    });
    
    it('should allow empty IDs', () => {
      const snapshot = {
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
      
      expect(LearningSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    });
  });
});
