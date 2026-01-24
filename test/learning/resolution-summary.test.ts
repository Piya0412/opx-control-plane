/**
 * Phase 4 - Step 4: Resolution Summary Schema Tests
 * 
 * Tests for resolution summary schema validation.
 */

import { describe, it, expect } from 'vitest';
import { ResolutionSummarySchema } from '../../src/learning/resolution-summary.schema';

describe('Phase 4 - Step 4: Resolution Summary Schema', () => {
  const validSummary = {
    summaryId: 'a'.repeat(64),
    service: 'order-service',
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-01-31T23:59:59.999Z',
    generatedAt: '2026-02-01T00:00:00.000Z',
    metrics: {
      totalIncidents: 42,
      truePositives: 38,
      falsePositives: 4,
      averageTTD: 300000,
      averageTTR: 1800000,
      averageConfidence: 0.85,
    },
    patterns: {
      commonRootCauses: [
        { value: 'Database connection pool exhausted', count: 15 },
        { value: 'Memory leak in cache', count: 10 },
      ],
      commonResolutions: [
        { value: 'FIXED', count: 30 },
        { value: 'MITIGATED', count: 8 },
      ],
      detectionWarnings: ['payment-service'],
    },
    version: '1.0.0',
  };
  
  it('should validate valid summary', () => {
    const result = ResolutionSummarySchema.safeParse(validSummary);
    
    expect(result.success).toBe(true);
  });
  
  it('should reject invalid summaryId (not 64 chars)', () => {
    const invalid = { ...validSummary, summaryId: 'abc' };
    
    const result = ResolutionSummarySchema.safeParse(invalid);
    
    expect(result.success).toBe(false);
  });
  
  it('should reject invalid date', () => {
    const invalid = { ...validSummary, startDate: 'invalid-date' };
    
    const result = ResolutionSummarySchema.safeParse(invalid);
    
    expect(result.success).toBe(false);
  });
  
  it('should reject negative metrics', () => {
    const invalid = {
      ...validSummary,
      metrics: { ...validSummary.metrics, totalIncidents: -1 },
    };
    
    const result = ResolutionSummarySchema.safeParse(invalid);
    
    expect(result.success).toBe(false);
  });
  
  it('should reject invalid confidence (>1)', () => {
    const invalid = {
      ...validSummary,
      metrics: { ...validSummary.metrics, averageConfidence: 1.5 },
    };
    
    const result = ResolutionSummarySchema.safeParse(invalid);
    
    expect(result.success).toBe(false);
  });
  
  it('should allow empty patterns', () => {
    const valid = {
      ...validSummary,
      patterns: {
        commonRootCauses: [],
        commonResolutions: [],
        detectionWarnings: [],
      },
    };
    
    const result = ResolutionSummarySchema.safeParse(valid);
    
    expect(result.success).toBe(true);
  });
  
  it('should allow undefined service (all services)', () => {
    const valid = { ...validSummary, service: undefined };
    
    const result = ResolutionSummarySchema.safeParse(valid);
    
    expect(result.success).toBe(true);
  });
  
  it('should validate pattern items without percentage', () => {
    // PatternItem should only have value and count
    const pattern = validSummary.patterns.commonRootCauses[0];
    
    expect(pattern).toHaveProperty('value');
    expect(pattern).toHaveProperty('count');
    expect(pattern).not.toHaveProperty('percentage');
  });
});
