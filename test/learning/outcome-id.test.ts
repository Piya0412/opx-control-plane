/**
 * Phase 4 - Step 3: Outcome ID Tests
 * 
 * Tests for deterministic outcome ID generation.
 */

import { describe, it, expect } from 'vitest';
import { computeOutcomeId } from '../../src/learning/outcome-id';

describe('Phase 4 - Step 3: Outcome ID Generation', () => {
  const validIncidentId = 'a'.repeat(64);
  const validClosedAt = '2026-01-22T10:00:00.000Z';
  
  describe('Determinism', () => {
    it('should generate same ID for same inputs', () => {
      const id1 = computeOutcomeId(validIncidentId, validClosedAt);
      const id2 = computeOutcomeId(validIncidentId, validClosedAt);
      
      expect(id1).toBe(id2);
    });
    
    it('should be deterministic across multiple calls', () => {
      const ids = Array.from({ length: 10 }, () =>
        computeOutcomeId(validIncidentId, validClosedAt)
      );
      
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(1);
    });
  });
  
  describe('Uniqueness', () => {
    it('should generate different ID for different incidentId', () => {
      const id1 = computeOutcomeId('a'.repeat(64), validClosedAt);
      const id2 = computeOutcomeId('b'.repeat(64), validClosedAt);
      
      expect(id1).not.toBe(id2);
    });
    
    it('should generate different ID for different closedAt', () => {
      const id1 = computeOutcomeId(validIncidentId, '2026-01-22T10:00:00.000Z');
      const id2 = computeOutcomeId(validIncidentId, '2026-01-22T11:00:00.000Z');
      
      expect(id1).not.toBe(id2);
    });
  });
  
  describe('Format', () => {
    it('should return 64 character string', () => {
      const id = computeOutcomeId(validIncidentId, validClosedAt);
      
      expect(id).toHaveLength(64);
    });
    
    it('should return hex string', () => {
      const id = computeOutcomeId(validIncidentId, validClosedAt);
      
      expect(id).toMatch(/^[0-9a-f]{64}$/);
    });
  });
  
  describe('Error Handling', () => {
    it('should throw error for empty incidentId', () => {
      expect(() => {
        computeOutcomeId('', validClosedAt);
      }).toThrow('incidentId must be 64 characters');
    });
    
    it('should throw error for invalid incidentId length', () => {
      expect(() => {
        computeOutcomeId('abc', validClosedAt);
      }).toThrow('incidentId must be 64 characters');
    });
    
    it('should throw error for empty closedAt', () => {
      expect(() => {
        computeOutcomeId(validIncidentId, '');
      }).toThrow('closedAt is required');
    });
  });
});
