import { describe, it, expect } from 'vitest';
import { IdempotencyService } from '../../src/controller/idempotency-service.js';
import type { CreateIncidentRequest } from '../../src/domain/incident.js';

/**
 * Idempotency Tests
 * 
 * CRITICAL INVARIANTS:
 * - "Idempotency records are audit artifacts, not caches."
 * - No bypass path - idempotency ALWAYS applied
 * - Same request → same key
 * - Different request → different key
 */
describe('Idempotency Service', () => {
  const service = new IdempotencyService();
  const principal = 'arn:aws:iam::123456789012:user/alice';

  const baseRequest: CreateIncidentRequest = {
    service: 'payment-service',
    severity: 'SEV2',
    title: 'High latency in payment processing',
  };

  describe('getIdempotencyKey', () => {
    it('should use client-provided key if present', () => {
      const clientKey = 'client-provided-key-123';
      const key = service.getIdempotencyKey(baseRequest, principal, clientKey);
      expect(key).toBe(clientKey);
    });

    it('should generate key if client key not provided', () => {
      const key = service.getIdempotencyKey(baseRequest, principal);
      expect(key).toBeDefined();
      expect(key).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });

    it('should generate same key for same request and principal', () => {
      const key1 = service.getIdempotencyKey(baseRequest, principal);
      const key2 = service.getIdempotencyKey(baseRequest, principal);
      expect(key1).toBe(key2);
    });

    it('should generate different key for different request', () => {
      const key1 = service.getIdempotencyKey(baseRequest, principal);
      const modifiedRequest = { ...baseRequest, title: 'Different title' };
      const key2 = service.getIdempotencyKey(modifiedRequest, principal);
      expect(key1).not.toBe(key2);
    });

    it('should generate different key for different principal', () => {
      const principal1 = 'arn:aws:iam::123456789012:user/alice';
      const principal2 = 'arn:aws:iam::123456789012:user/bob';
      const key1 = service.getIdempotencyKey(baseRequest, principal1);
      const key2 = service.getIdempotencyKey(baseRequest, principal2);
      expect(key1).not.toBe(key2);
    });

    it('should be deterministic across multiple calls', () => {
      const keys = [];
      for (let i = 0; i < 100; i++) {
        keys.push(service.getIdempotencyKey(baseRequest, principal));
      }
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(1); // All keys should be identical
    });

    it('should generate same key regardless of field order', () => {
      const request1 = {
        service: 'payment-service',
        severity: 'SEV2' as const,
        title: 'High latency',
      };
      const request2 = {
        title: 'High latency',
        service: 'payment-service',
        severity: 'SEV2' as const,
      };
      const key1 = service.getIdempotencyKey(request1, principal);
      const key2 = service.getIdempotencyKey(request2, principal);
      expect(key1).toBe(key2); // Deep canonicalization ensures same key
    });
  });

  describe('computeRequestHash', () => {
    it('should produce same hash for same request', () => {
      const hash1 = service.computeRequestHash(baseRequest);
      const hash2 = service.computeRequestHash(baseRequest);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different request', () => {
      const hash1 = service.computeRequestHash(baseRequest);
      const modifiedRequest = { ...baseRequest, title: 'Different title' };
      const hash2 = service.computeRequestHash(modifiedRequest);
      expect(hash1).not.toBe(hash2);
    });

    it('should produce SHA-256 hex hash (64 characters)', () => {
      const hash = service.computeRequestHash(baseRequest);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should be deterministic', () => {
      const hashes = [];
      for (let i = 0; i < 100; i++) {
        hashes.push(service.computeRequestHash(baseRequest));
      }
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1);
    });

    it('should produce same hash regardless of field order', () => {
      const request1 = {
        service: 'payment-service',
        severity: 'SEV2' as const,
        title: 'High latency',
      };
      const request2 = {
        title: 'High latency',
        service: 'payment-service',
        severity: 'SEV2' as const,
      };
      const hash1 = service.computeRequestHash(request1);
      const hash2 = service.computeRequestHash(request2);
      expect(hash1).toBe(hash2);
    });
  });
});
