/**
 * Phase 3.5: Idempotency Keys Tests
 */

import { describe, it, expect } from 'vitest';
import {
  computeEvidenceKey,
  computeConfidenceKey,
  computePromotionKey,
  computeIncidentKey,
  extractIdFromKey,
  getKeyNamespace,
} from '../../src/replay/idempotency-keys';

describe('Idempotency Keys', () => {
  describe('computeEvidenceKey', () => {
    it('should generate deterministic key for same detections', () => {
      const detections = ['det1', 'det2', 'det3'];
      
      const key1 = computeEvidenceKey(detections);
      const key2 = computeEvidenceKey(detections);
      
      expect(key1).toBe(key2);
    });

    it('should generate same key regardless of order', () => {
      const detections1 = ['det1', 'det2', 'det3'];
      const detections2 = ['det3', 'det1', 'det2'];
      const detections3 = ['det2', 'det3', 'det1'];
      
      const key1 = computeEvidenceKey(detections1);
      const key2 = computeEvidenceKey(detections2);
      const key3 = computeEvidenceKey(detections3);
      
      expect(key1).toBe(key2);
      expect(key2).toBe(key3);
    });

    it('should generate different keys for different detections', () => {
      const detections1 = ['det1', 'det2', 'det3'];
      const detections2 = ['det1', 'det2', 'det4'];
      
      const key1 = computeEvidenceKey(detections1);
      const key2 = computeEvidenceKey(detections2);
      
      expect(key1).not.toBe(key2);
    });

    it('should have EVIDENCE namespace', () => {
      const key = computeEvidenceKey(['det1', 'det2']);
      
      expect(key).toMatch(/^EVIDENCE:/);
    });

    it('should handle empty array', () => {
      const key = computeEvidenceKey([]);
      
      expect(key).toMatch(/^EVIDENCE:/);
      expect(key.length).toBeGreaterThan(9); // "EVIDENCE:" + hash
    });

    it('should handle single detection', () => {
      const key = computeEvidenceKey(['det1']);
      
      expect(key).toMatch(/^EVIDENCE:/);
    });
  });

  describe('computeConfidenceKey', () => {
    it('should generate deterministic key', () => {
      const evidenceId = 'evidence123';
      
      const key1 = computeConfidenceKey(evidenceId);
      const key2 = computeConfidenceKey(evidenceId);
      
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different evidence', () => {
      const key1 = computeConfidenceKey('evidence1');
      const key2 = computeConfidenceKey('evidence2');
      
      expect(key1).not.toBe(key2);
    });

    it('should have CONFIDENCE namespace', () => {
      const key = computeConfidenceKey('evidence123');
      
      expect(key).toBe('CONFIDENCE:evidence123');
    });
  });

  describe('computePromotionKey', () => {
    it('should generate deterministic key', () => {
      const candidateId = 'candidate123';
      
      const key1 = computePromotionKey(candidateId);
      const key2 = computePromotionKey(candidateId);
      
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different candidates', () => {
      const key1 = computePromotionKey('candidate1');
      const key2 = computePromotionKey('candidate2');
      
      expect(key1).not.toBe(key2);
    });

    it('should have PROMOTION namespace', () => {
      const key = computePromotionKey('candidate123');
      
      expect(key).toBe('PROMOTION:candidate123');
    });
  });

  describe('computeIncidentKey', () => {
    it('should generate deterministic key', () => {
      const incidentId = 'incident123';
      
      const key1 = computeIncidentKey(incidentId);
      const key2 = computeIncidentKey(incidentId);
      
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different incidents', () => {
      const key1 = computeIncidentKey('incident1');
      const key2 = computeIncidentKey('incident2');
      
      expect(key1).not.toBe(key2);
    });

    it('should have INCIDENT namespace', () => {
      const key = computeIncidentKey('incident123');
      
      expect(key).toBe('INCIDENT:incident123');
    });
  });

  describe('extractIdFromKey', () => {
    it('should extract ID from evidence key', () => {
      const detections = ['det1', 'det2'];
      const key = computeEvidenceKey(detections);
      
      const id = extractIdFromKey(key);
      
      expect(id).toBeDefined();
      expect(id.length).toBe(64); // SHA256 hex length
    });

    it('should extract ID from confidence key', () => {
      const key = computeConfidenceKey('evidence123');
      
      const id = extractIdFromKey(key);
      
      expect(id).toBe('evidence123');
    });

    it('should extract ID from promotion key', () => {
      const key = computePromotionKey('candidate123');
      
      const id = extractIdFromKey(key);
      
      expect(id).toBe('candidate123');
    });

    it('should extract ID from incident key', () => {
      const key = computeIncidentKey('incident123');
      
      const id = extractIdFromKey(key);
      
      expect(id).toBe('incident123');
    });

    it('should throw on invalid key format', () => {
      expect(() => extractIdFromKey('invalid')).toThrow('Invalid idempotency key format');
      expect(() => extractIdFromKey('TOO:MANY:PARTS')).toThrow('Invalid idempotency key format');
    });
  });

  describe('getKeyNamespace', () => {
    it('should return EVIDENCE namespace', () => {
      const key = computeEvidenceKey(['det1']);
      
      const namespace = getKeyNamespace(key);
      
      expect(namespace).toBe('EVIDENCE');
    });

    it('should return CONFIDENCE namespace', () => {
      const key = computeConfidenceKey('evidence123');
      
      const namespace = getKeyNamespace(key);
      
      expect(namespace).toBe('CONFIDENCE');
    });

    it('should return PROMOTION namespace', () => {
      const key = computePromotionKey('candidate123');
      
      const namespace = getKeyNamespace(key);
      
      expect(namespace).toBe('PROMOTION');
    });

    it('should return INCIDENT namespace', () => {
      const key = computeIncidentKey('incident123');
      
      const namespace = getKeyNamespace(key);
      
      expect(namespace).toBe('INCIDENT');
    });

    it('should throw on invalid key format', () => {
      expect(() => getKeyNamespace('invalid')).toThrow('Invalid idempotency key format');
    });
  });

  describe('Namespace Isolation', () => {
    it('should ensure different namespaces for same ID', () => {
      const id = 'test123';
      
      const confidenceKey = computeConfidenceKey(id);
      const promotionKey = computePromotionKey(id);
      const incidentKey = computeIncidentKey(id);
      
      expect(confidenceKey).not.toBe(promotionKey);
      expect(promotionKey).not.toBe(incidentKey);
      expect(incidentKey).not.toBe(confidenceKey);
    });
  });
});
