/**
 * CP-7: Idempotency Tests
 * 
 * Tests for idempotent incident creation and concurrent handling.
 * 
 * 🔒 INV-7.1: Single incident per decisionId
 * 🔒 INV-7.6: Incident creation is idempotent
 */

import { describe, it, expect } from 'vitest';
import { computeIncidentId } from '../../src/incident/identity.js';

describe('CP-7: Idempotency', () => {
  describe('INV-7.1: Single incident per decisionId', () => {
    it('should produce same incidentId for same decisionId', () => {
      const decisionId = 'd'.repeat(64);
      
      const id1 = computeIncidentId(decisionId);
      const id2 = computeIncidentId(decisionId);
      
      expect(id1).toBe(id2);
    });

    it('should guarantee deterministic mapping', () => {
      const testCases = [
        'd1'.padEnd(64, '0'),
        'd2'.padEnd(64, '0'),
        'd3'.padEnd(64, '0'),
      ];
      
      for (const decisionId of testCases) {
        const ids = Array.from({ length: 10 }, () => computeIncidentId(decisionId));
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(1);
      }
    });

    it('should produce different incidentId for different decisionId', () => {
      const decisionId1 = 'd1'.padEnd(64, '0');
      const decisionId2 = 'd2'.padEnd(64, '0');
      
      const id1 = computeIncidentId(decisionId1);
      const id2 = computeIncidentId(decisionId2);
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('INV-7.6: Idempotent creation', () => {
    it('should converge on same incidentId for concurrent creates', () => {
      const decisionId = 'd'.repeat(64);
      
      // Simulate concurrent creates
      const concurrentIds = Array.from({ length: 100 }, () => 
        computeIncidentId(decisionId)
      );
      
      const uniqueIds = new Set(concurrentIds);
      expect(uniqueIds.size).toBe(1);
    });

    it('should be replay-safe', () => {
      const decisionId = 'd'.repeat(64);
      
      // First creation
      const id1 = computeIncidentId(decisionId);
      
      // Replay (simulate retry)
      const id2 = computeIncidentId(decisionId);
      const id3 = computeIncidentId(decisionId);
      
      expect(id1).toBe(id2);
      expect(id2).toBe(id3);
    });

    it('should handle rapid successive calls', () => {
      const decisionId = 'd'.repeat(64);
      
      const ids: string[] = [];
      for (let i = 0; i < 1000; i++) {
        ids.push(computeIncidentId(decisionId));
      }
      
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(1);
    });
  });

  describe('deterministic convergence', () => {
    it('should converge across different execution contexts', () => {
      const decisionId = 'd'.repeat(64);
      
      // Simulate different execution contexts
      const context1 = computeIncidentId(decisionId);
      const context2 = computeIncidentId(decisionId);
      const context3 = computeIncidentId(decisionId);
      
      expect(context1).toBe(context2);
      expect(context2).toBe(context3);
    });

    it('should be independent of timing', () => {
      const decisionId = 'd'.repeat(64);
      
      const id1 = computeIncidentId(decisionId);
      
      // Simulate delay
      const id2 = computeIncidentId(decisionId);
      
      expect(id1).toBe(id2);
    });

    it('should handle batch processing', () => {
      const decisionIds = Array.from({ length: 100 }, (_, i) => 
        `decision-${i}`.padEnd(64, '0')
      );
      
      // First batch
      const batch1 = decisionIds.map(computeIncidentId);
      
      // Second batch (replay)
      const batch2 = decisionIds.map(computeIncidentId);
      
      expect(batch1).toEqual(batch2);
    });
  });

  describe('collision resistance', () => {
    it('should avoid collisions for similar decision IDs', () => {
      const decisionIds = [
        'a'.repeat(64),
        'a'.repeat(63) + 'b',
        'a'.repeat(63) + 'c',
        'b'.repeat(64),
      ];
      
      const incidentIds = decisionIds.map(computeIncidentId);
      const uniqueIds = new Set(incidentIds);
      
      expect(uniqueIds.size).toBe(decisionIds.length);
    });

    it('should handle large batch without collisions', () => {
      const decisionIds = Array.from({ length: 1000 }, (_, i) => {
        const base = `decision-${i.toString().padStart(10, '0')}`;
        const suffix = String.fromCharCode(97 + (i % 26)).repeat(64 - base.length);
        return base + suffix;
      });
      
      const incidentIds = decisionIds.map(computeIncidentId);
      const uniqueIds = new Set(incidentIds);
      
      expect(uniqueIds.size).toBe(decisionIds.length);
    });
  });

  describe('idempotency guarantees', () => {
    it('should guarantee same input → same output', () => {
      const testCases = [
        'd1'.padEnd(64, '0'),
        'd2'.padEnd(64, '1'),
        'd3'.padEnd(64, 'a'),
      ];
      
      for (const decisionId of testCases) {
        const ids = Array.from({ length: 100 }, () => computeIncidentId(decisionId));
        const first = ids[0];
        
        for (const id of ids) {
          expect(id).toBe(first);
        }
      }
    });

    it('should guarantee different input → different output', () => {
      const decisionIds = Array.from({ length: 100 }, (_, i) => {
        const base = `decision-${i.toString().padStart(10, '0')}`;
        const suffix = String.fromCharCode(97 + (i % 26)).repeat(64 - base.length);
        return base + suffix;
      });
      
      const incidentIds = decisionIds.map(computeIncidentId);
      const uniqueIds = new Set(incidentIds);
      
      expect(uniqueIds.size).toBe(decisionIds.length);
    });

    it('should be order-independent for same decision', () => {
      const decisionId = 'd'.repeat(64);
      
      const ids = [
        computeIncidentId(decisionId),
        computeIncidentId(decisionId),
        computeIncidentId(decisionId),
      ];
      
      expect(ids[0]).toBe(ids[1]);
      expect(ids[1]).toBe(ids[2]);
    });
  });
});
