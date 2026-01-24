/**
 * Phase 5 - Step 1: Audit ID Generation Tests
 */

import { describe, it, expect } from 'vitest';
import { computeAuditId } from '../../src/automation/audit-id';

describe('computeAuditId', () => {
  it('should generate deterministic ID', () => {
    const id1 = computeAuditId('PATTERN_EXTRACTION', '2026-01-22T02:00:00.000Z', '1.0.0');
    const id2 = computeAuditId('PATTERN_EXTRACTION', '2026-01-22T02:00:00.000Z', '1.0.0');
    
    expect(id1).toBe(id2);
  });

  it('should generate 64-character hex string', () => {
    const id = computeAuditId('PATTERN_EXTRACTION', '2026-01-22T02:00:00.000Z', '1.0.0');
    
    expect(id).toHaveLength(64);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should generate different IDs for different operation types', () => {
    const id1 = computeAuditId('PATTERN_EXTRACTION', '2026-01-22T02:00:00.000Z', '1.0.0');
    const id2 = computeAuditId('CALIBRATION', '2026-01-22T02:00:00.000Z', '1.0.0');
    
    expect(id1).not.toBe(id2);
  });

  it('should generate different IDs for different start times', () => {
    const id1 = computeAuditId('PATTERN_EXTRACTION', '2026-01-22T02:00:00.000Z', '1.0.0');
    const id2 = computeAuditId('PATTERN_EXTRACTION', '2026-01-22T03:00:00.000Z', '1.0.0');
    
    expect(id1).not.toBe(id2);
  });

  it('should generate different IDs for different versions', () => {
    const id1 = computeAuditId('PATTERN_EXTRACTION', '2026-01-22T02:00:00.000Z', '1.0.0');
    const id2 = computeAuditId('PATTERN_EXTRACTION', '2026-01-22T02:00:00.000Z', '2.0.0');
    
    expect(id1).not.toBe(id2);
  });

  it('should handle all operation types', () => {
    const types = ['PATTERN_EXTRACTION', 'CALIBRATION', 'SNAPSHOT'] as const;
    const ids = types.map(type => 
      computeAuditId(type, '2026-01-22T02:00:00.000Z', '1.0.0')
    );
    
    // All IDs should be unique
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(types.length);
    
    // All IDs should be valid
    ids.forEach(id => {
      expect(id).toHaveLength(64);
      expect(id).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it('should be stable across multiple calls', () => {
    const ids = Array.from({ length: 100 }, () =>
      computeAuditId('PATTERN_EXTRACTION', '2026-01-22T02:00:00.000Z', '1.0.0')
    );
    
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(1); // All should be the same
  });

  it('should handle edge cases in timestamps', () => {
    const timestamps = [
      '2026-01-01T00:00:00.000Z', // Start of year
      '2026-12-31T23:59:59.999Z', // End of year
      '2026-02-29T12:00:00.000Z', // Leap year (2026 is not a leap year, but testing format)
    ];
    
    timestamps.forEach(timestamp => {
      const id = computeAuditId('PATTERN_EXTRACTION', timestamp, '1.0.0');
      expect(id).toHaveLength(64);
      expect(id).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it('should handle version strings with different formats', () => {
    const versions = ['1.0.0', '2.1.3', '10.20.30', '1.0.0-beta'];
    
    versions.forEach(version => {
      const id = computeAuditId('PATTERN_EXTRACTION', '2026-01-22T02:00:00.000Z', version);
      expect(id).toHaveLength(64);
      expect(id).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
