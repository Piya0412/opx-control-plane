/**
 * Phase 3.3: Incident Identity Tests
 * 
 * Tests for evidence-derived incident identity computation.
 */

import { describe, it, expect } from 'vitest';
import { computeIncidentId } from '../../src/promotion/incident-identity.js';

describe('Incident Identity', () => {
  describe('computeIncidentId', () => {
    const validEvidenceId = 'a'.repeat(64); // 64-char SHA256 hex
    
    it('should compute deterministic incident ID', () => {
      const id1 = computeIncidentId('test-service', validEvidenceId);
      const id2 = computeIncidentId('test-service', validEvidenceId);
      
      expect(id1).toBe(id2);
      expect(id1).toHaveLength(64);
    });
    
    it('should generate different IDs for different services', () => {
      const id1 = computeIncidentId('service-a', validEvidenceId);
      const id2 = computeIncidentId('service-b', validEvidenceId);
      
      expect(id1).not.toBe(id2);
    });
    
    it('should generate different IDs for different evidence', () => {
      const evidence1 = 'a'.repeat(64);
      const evidence2 = 'b'.repeat(64);
      
      const id1 = computeIncidentId('test-service', evidence1);
      const id2 = computeIncidentId('test-service', evidence2);
      
      expect(id1).not.toBe(id2);
    });
    
    it('should be evidence-derived only (no time dependency)', () => {
      // Call multiple times - should always return same ID
      const ids = Array.from({ length: 10 }, () =>
        computeIncidentId('test-service', validEvidenceId)
      );
      
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(1);
    });
    
    it('should throw for empty service', () => {
      expect(() => computeIncidentId('', validEvidenceId)).toThrow('service cannot be empty');
      expect(() => computeIncidentId('  ', validEvidenceId)).toThrow('service cannot be empty');
    });
    
    it('should throw for invalid evidence ID', () => {
      expect(() => computeIncidentId('test-service', '')).toThrow('evidenceId must be 64-character SHA256 hex');
      expect(() => computeIncidentId('test-service', 'short')).toThrow('evidenceId must be 64-character SHA256 hex');
      expect(() => computeIncidentId('test-service', 'a'.repeat(63))).toThrow('evidenceId must be 64-character SHA256 hex');
    });
    
    it('should return 64-character hex string', () => {
      const id = computeIncidentId('test-service', validEvidenceId);
      
      expect(id).toHaveLength(64);
      expect(id).toMatch(/^[a-f0-9]{64}$/);
    });
  });
  
  describe('Determinism', () => {
    it('should produce same ID for same inputs (replay-safe)', () => {
      const service = 'payment-service';
      const evidenceId = 'abc123'.repeat(10) + 'abcd'; // 64 chars
      
      const id1 = computeIncidentId(service, evidenceId);
      const id2 = computeIncidentId(service, evidenceId);
      const id3 = computeIncidentId(service, evidenceId);
      
      expect(id1).toBe(id2);
      expect(id2).toBe(id3);
    });
  });
});
