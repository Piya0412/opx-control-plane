import { describe, it, expect } from 'vitest';
import { computeStateHash, canonicalizeDeep } from '../../src/utils/hash.js';
import type { Incident } from '../../src/domain/incident.js';

/**
 * Event Store and Hash Tests
 * 
 * Verify deterministic hash computation and deep canonicalization.
 * 
 * CRITICAL INVARIANTS:
 * - Same incident state → same hash
 * - Deep canonicalization at all depths
 * - Hash is deterministic
 */
describe('Event Store', () => {
  describe('canonicalizeDeep', () => {
    it('should sort top-level keys', () => {
      const obj = { z: 1, a: 2, m: 3 };
      const canonical = canonicalizeDeep(obj);
      const keys = Object.keys(canonical);
      expect(keys).toEqual(['a', 'm', 'z']);
    });

    it('should sort nested object keys', () => {
      const obj = {
        outer: {
          z: 1,
          a: 2,
        },
      };
      const canonical = canonicalizeDeep(obj);
      const innerKeys = Object.keys(canonical.outer);
      expect(innerKeys).toEqual(['a', 'z']);
    });

    it('should handle arrays', () => {
      const obj = {
        items: [
          { z: 1, a: 2 },
          { y: 3, b: 4 },
        ],
      };
      const canonical = canonicalizeDeep(obj);
      expect(Object.keys(canonical.items[0])).toEqual(['a', 'z']);
      expect(Object.keys(canonical.items[1])).toEqual(['b', 'y']);
    });

    it('should handle deeply nested structures', () => {
      const obj = {
        level1: {
          z: 1,
          level2: {
            y: 2,
            level3: {
              x: 3,
              a: 4,
            },
          },
        },
      };
      const canonical = canonicalizeDeep(obj);
      expect(Object.keys(canonical.level1.level2.level3)).toEqual(['a', 'x']);
    });

    it('should handle null and undefined', () => {
      const obj = { a: null, b: undefined, c: 1 };
      const canonical = canonicalizeDeep(obj);
      expect(canonical.a).toBeNull();
      expect(canonical.b).toBeUndefined();
      expect(canonical.c).toBe(1);
    });
  });

  describe('computeStateHash', () => {
    const baseIncident: Incident = {
      incidentId: '550e8400-e29b-41d4-a716-446655440000',
      service: 'payment-service',
      severity: 'SEV1',
      state: 'CREATED',
      title: 'Payment failures',
      signals: [],
      timeline: [],
      createdAt: '2024-01-15T10:30:00.000Z',
      updatedAt: '2024-01-15T10:30:00.000Z',
      createdBy: 'user@example.com',
      version: 1,
      eventSeq: 0,
    };

    it('should produce same hash for same incident', () => {
      const hash1 = computeStateHash(baseIncident);
      const hash2 = computeStateHash(baseIncident);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hash when state changes', () => {
      const hash1 = computeStateHash(baseIncident);
      const modified = { ...baseIncident, state: 'ANALYZING' as const };
      const hash2 = computeStateHash(modified);
      expect(hash1).not.toBe(hash2);
    });

    it('should produce same hash regardless of updatedAt', () => {
      const hash1 = computeStateHash(baseIncident);
      const modified = { ...baseIncident, updatedAt: '2024-01-15T11:00:00.000Z' };
      const hash2 = computeStateHash(modified);
      expect(hash1).toBe(hash2); // updatedAt is excluded from canonical state
    });

    it('should produce same hash regardless of version', () => {
      const hash1 = computeStateHash(baseIncident);
      const modified = { ...baseIncident, version: 2 };
      const hash2 = computeStateHash(modified);
      expect(hash1).toBe(hash2); // version is excluded from canonical state
    });

    it('should produce same hash regardless of eventSeq', () => {
      const hash1 = computeStateHash(baseIncident);
      const modified = { ...baseIncident, eventSeq: 5 };
      const hash2 = computeStateHash(modified);
      expect(hash1).toBe(hash2); // eventSeq is excluded from canonical state
    });

    it('should produce same hash regardless of timeline', () => {
      const hash1 = computeStateHash(baseIncident);
      const modified = {
        ...baseIncident,
        timeline: [{
          entryId: '123',
          timestamp: '2024-01-15T10:30:00.000Z',
          type: 'CREATED' as const,
          actor: 'user@example.com',
        }],
      };
      const hash2 = computeStateHash(modified);
      expect(hash1).toBe(hash2); // timeline is excluded from canonical state
    });

    it('should produce different hash when signals change', () => {
      const hash1 = computeStateHash(baseIncident);
      const modified = {
        ...baseIncident,
        signals: [{
          signalId: '123',
          type: 'ALARM' as const,
          source: 'cloudwatch',
          timestamp: '2024-01-15T10:30:00.000Z',
          data: {},
        }],
      };
      const hash2 = computeStateHash(modified);
      expect(hash1).not.toBe(hash2);
    });

    it('should produce same hash regardless of signal data key order', () => {
      const incident1 = {
        ...baseIncident,
        signals: [{
          signalId: '123',
          type: 'ALARM' as const,
          source: 'cloudwatch',
          timestamp: '2024-01-15T10:30:00.000Z',
          data: { z: 1, a: 2, m: 3 },
        }],
      };
      const incident2 = {
        ...baseIncident,
        signals: [{
          signalId: '123',
          type: 'ALARM' as const,
          source: 'cloudwatch',
          timestamp: '2024-01-15T10:30:00.000Z',
          data: { a: 2, m: 3, z: 1 }, // Different key order
        }],
      };
      const hash1 = computeStateHash(incident1);
      const hash2 = computeStateHash(incident2);
      expect(hash1).toBe(hash2); // Deep canonicalization ensures same hash
    });

    it('should produce SHA-256 hex hash (64 characters)', () => {
      const hash = computeStateHash(baseIncident);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should be deterministic across multiple runs', () => {
      const hashes = [];
      for (let i = 0; i < 100; i++) {
        hashes.push(computeStateHash(baseIncident));
      }
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1); // All hashes should be identical
    });
  });
});
