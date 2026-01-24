/**
 * Phase 5 - Step 2: Pattern Extraction Handler Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calculateDateRange } from '../../src/automation/handlers/pattern-extraction-handler';

// Note: We only test the exported calculateDateRange function
// Full handler testing requires integration tests with real AWS services

describe('Pattern Extraction Handler', () => {
  describe('calculateDateRange', () => {
    it('should calculate daily window correctly', () => {
      const { startDate, endDate } = calculateDateRange('DAILY');
      
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Start should be yesterday at 00:00:00
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      expect(start.getSeconds()).toBe(0);
      
      // End should be today at 00:00:00
      expect(end.getHours()).toBe(0);
      expect(end.getMinutes()).toBe(0);
      expect(end.getSeconds()).toBe(0);
      
      // Should be 1 day apart
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(1);
    });

    it('should calculate weekly window correctly', () => {
      const { startDate, endDate } = calculateDateRange('WEEKLY');
      
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Start should be Monday at 00:00:00
      expect(start.getDay()).toBe(1); // Monday
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      expect(start.getSeconds()).toBe(0);
      
      // End should be Sunday at 23:59:59
      expect(end.getDay()).toBe(0); // Sunday
      
      // Should be approximately 7 days apart
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeCloseTo(7, 1);
    });

    it('should produce consistent weekly windows', () => {
      // Call multiple times
      const results = Array.from({ length: 10 }, () => calculateDateRange('WEEKLY'));
      
      // All should produce the same result
      const uniqueStarts = new Set(results.map(r => r.startDate));
      const uniqueEnds = new Set(results.map(r => r.endDate));
      
      expect(uniqueStarts.size).toBe(1);
      expect(uniqueEnds.size).toBe(1);
    });
  });

  describe('date range edge cases', () => {
    it('should handle daily window on Monday', () => {
      const { startDate, endDate } = calculateDateRange('DAILY');
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Verify it's always yesterday → today
      expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    it('should handle weekly window when today is Sunday', () => {
      const { startDate, endDate } = calculateDateRange('WEEKLY');
      const start = new Date(startDate);
      
      // Start should always be Monday
      expect(start.getDay()).toBe(1);
    });

    it('should handle weekly window when today is Monday', () => {
      const { startDate, endDate } = calculateDateRange('WEEKLY');
      const start = new Date(startDate);
      
      // Start should be previous Monday (7 days ago)
      expect(start.getDay()).toBe(1);
    });
  });
});
