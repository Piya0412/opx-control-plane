/**
 * CP-7: Determinism Tests
 * 
 * Tests for deterministic identity computation.
 * 
 * 🔒 INV-7.3: Incident identity is deterministic
 * 🔒 INV-7.6: Incident creation is idempotent
 */

import { describe, it, expect } from 'vitest';
import { computeIncidentId } from '../../src/incident/identity.js';

describe('CP-7: Deterministic Identity', () => {
  describe('INV-7.3: Deterministic identity computation', () => {
    it('should produce same incidentId for same decisionId', () => {
      const decisionId = 'd'.repeat(64);
      
      const id1 = computeIncidentId(decisionId);
      const id2 = computeIncidentId(decisionId);
      
      expect(id1).toBe(id2);
    });

    it('should produce different incidentId for different decisionId', () => {
      const decisionId1 = 'a'.repeat(64);
      const decisionId2 = 'b'.repeat(64);
      
      const id1 = computeIncidentId(decisionId1);
      const id2 = computeIncidentId(decisionId2);
      
      expect(id1).not.toBe(id2);
    });

    it('should produce 64-character hash', () => {
      const decisionId = 'd'.repeat(64);
      const incidentId = computeIncidentId(decisionId);
      
      expect(incidentId).toHaveLength(64);
    });

    it('should produce hex string', () => {
      const decisionId = 'd'.repeat(64);
      const incidentId = computeIncidentId(decisionId);
      
      expect(incidentId).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should be reproducible across multiple calls', () => {
      const decisionId = 'd'.repeat(64);
      const ids = Array.from({ length: 100 }, () => computeIncidentId(decisionId));
      
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(1);
    });

    it('should handle different decision ID formats', () => {
      const decisionIds = [
        '0'.repeat(64),
        'f'.repeat(64),
        'a1b2c3d4'.repeat(8),
      ];
      
      for (const decisionId of decisionIds) {
        const incidentId = computeIncidentId(decisionId);
        expect(incidentId).toHaveLength(64);
        expect(incidentId).toMatch(/^[0-9a-f]{64}$/);
      }
    });
  });

  describe('collision resistance', () => {
    it('should produce different IDs for similar decision IDs', () => {
      const decisionId1 = 'a'.repeat(63) + 'b';
      const decisionId2 = 'a'.repeat(63) + 'c';
      
      const id1 = computeIncidentId(decisionId1);
      const id2 = computeIncidentId(decisionId2);
      
      expect(id1).not.toBe(id2);
    });

    it('should produce different IDs for reversed decision IDs', () => {
      const decisionId1 = 'abc123'.repeat(10) + 'abcd';
      const decisionId2 = 'dcba321cba'.repeat(6) + 'dcba';
      
      const id1 = computeIncidentId(decisionId1);
      const id2 = computeIncidentId(decisionId2);
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('determinism guarantees', () => {
    it('should guarantee same input → same output', () => {
      const testCases = [
        'd'.repeat(64),
        'decision-id-test-1'.padEnd(64, '0'),
        'decision-id-test-2'.padEnd(64, '1'),
      ];
      
      for (const decisionId of testCases) {
        const id1 = computeIncidentId(decisionId);
        const id2 = computeIncidentId(decisionId);
        const id3 = computeIncidentId(decisionId);
        
        expect(id1).toBe(id2);
        expect(id2).toBe(id3);
      }
    });

    it('should guarantee different input → different output', () => {
      const decisionIds = Array.from({ length: 100 }, (_, i) => 
        `decision-${i.toString().padStart(10, '0')}`.padEnd(64, String.fromCharCode(97 + (i % 26)))
      );
      
      const incidentIds = decisionIds.map(computeIncidentId);
      const uniqueIds = new Set(incidentIds);
      
      expect(uniqueIds.size).toBe(decisionIds.length);
    });
  });
});
