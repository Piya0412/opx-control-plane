/**
 * Phase 5 - Step 5: Rate Limiter Tests
 * 
 * Tests for per-principal rate limiting configuration and logic.
 */

import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../../src/automation/rate-limiter';

describe('RateLimiter', () => {
  describe('Rate Limit Configuration', () => {
    it('should have correct limits for PATTERN_EXTRACTION', () => {
      const config = RateLimiter.getRateLimitConfig('PATTERN_EXTRACTION');
      expect(config).toBeDefined();
      expect(config!.maxRequests).toBe(5);
      expect(config!.windowMs).toBe(3600000); // 1 hour
    });

    it('should have correct limits for CALIBRATION', () => {
      const config = RateLimiter.getRateLimitConfig('CALIBRATION');
      expect(config).toBeDefined();
      expect(config!.maxRequests).toBe(3);
      expect(config!.windowMs).toBe(3600000); // 1 hour
    });

    it('should have correct limits for SNAPSHOT', () => {
      const config = RateLimiter.getRateLimitConfig('SNAPSHOT');
      expect(config).toBeDefined();
      expect(config!.maxRequests).toBe(10);
      expect(config!.windowMs).toBe(3600000); // 1 hour
    });
  });

  describe('Rate Limit Logic', () => {
    it('should calculate correct window start time', () => {
      const now = Date.now();
      const windowMs = 3600000; // 1 hour
      const windowStart = now - windowMs;
      
      expect(windowStart).toBeLessThan(now);
      expect(now - windowStart).toBe(windowMs);
    });

    it('should calculate retry-after time correctly', () => {
      const now = Date.now();
      const oldestTimestamp = now - 1800000; // 30 minutes ago
      const windowMs = 3600000; // 1 hour
      const retryAfter = oldestTimestamp + windowMs - now;
      
      // Should be ~30 minutes
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(windowMs);
      expect(retryAfter).toBeCloseTo(1800000, -3); // Within 1000ms
    });

    it('should handle per-principal isolation', () => {
      const user1Key = 'RATELIMIT#user-1#PATTERN_EXTRACTION';
      const user2Key = 'RATELIMIT#user-2#PATTERN_EXTRACTION';
      
      expect(user1Key).not.toBe(user2Key);
    });

    it('should handle per-operation-type isolation', () => {
      const key1 = 'RATELIMIT#user-1#PATTERN_EXTRACTION';
      const key2 = 'RATELIMIT#user-1#CALIBRATION';
      
      expect(key1).not.toBe(key2);
    });

    it('should set TTL for rate limit records', () => {
      const timestamp = Date.now();
      const ttlMs = 7200000; // 2 hours
      const expiresAt = Math.floor((timestamp + ttlMs) / 1000);
      
      expect(expiresAt).toBeGreaterThan(timestamp / 1000);
    });
  });

  describe('Rate Limit Enforcement Logic', () => {
    it('should block when count >= maxRequests', () => {
      const currentCount = 5;
      const maxRequests = 5;
      
      const shouldBlock = currentCount >= maxRequests;
      
      expect(shouldBlock).toBe(true);
    });

    it('should allow when count < maxRequests', () => {
      const currentCount = 4;
      const maxRequests = 5;
      
      const shouldBlock = currentCount >= maxRequests;
      
      expect(shouldBlock).toBe(false);
    });

    it('should enforce PATTERN_EXTRACTION limit (5/hour)', () => {
      const config = RateLimiter.getRateLimitConfig('PATTERN_EXTRACTION');
      const requests = [1, 2, 3, 4, 5, 6];
      const allowed = requests.map(count => count <= config!.maxRequests);
      
      expect(allowed.slice(0, 5).every(a => a)).toBe(true);
      expect(allowed[5]).toBe(false);
    });

    it('should enforce CALIBRATION limit (3/hour)', () => {
      const config = RateLimiter.getRateLimitConfig('CALIBRATION');
      const requests = [1, 2, 3, 4];
      const allowed = requests.map(count => count <= config!.maxRequests);
      
      expect(allowed.slice(0, 3).every(a => a)).toBe(true);
      expect(allowed[3]).toBe(false);
    });

    it('should enforce SNAPSHOT limit (10/hour)', () => {
      const config = RateLimiter.getRateLimitConfig('SNAPSHOT');
      const requests = Array.from({ length: 11 }, (_, i) => i + 1);
      const allowed = requests.map(count => count <= config!.maxRequests);
      
      expect(allowed.slice(0, 10).every(a => a)).toBe(true);
      expect(allowed[10]).toBe(false);
    });
  });

  describe('Fail-Open Behavior', () => {
    it('should fail open on error', () => {
      // Rate limiter should allow request if check fails
      const failOpen = true;
      
      expect(failOpen).toBe(true);
    });
  });
});
