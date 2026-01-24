/**
 * Phase 4 - Step 4: Pattern Extractor Tests
 * 
 * Tests for pattern extraction from outcomes.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PatternExtractor } from '../../src/learning/pattern-extractor';
import { ResolutionSummaryStore } from '../../src/learning/resolution-summary-store';
import type { OutcomeStore } from '../../src/learning/outcome-store';
import type { IncidentOutcome } from '../../src/learning/outcome.schema';

describe('Phase 4 - Step 4: Pattern Extractor', () => {
  let extractor: PatternExtractor;
  let outcomeStore: OutcomeStore;
  let summaryStore: ResolutionSummaryStore;
  
  const createMockOutcome = (overrides: Partial<IncidentOutcome> = {}): IncidentOutcome => ({
    outcomeId: 'a'.repeat(64),
    incidentId: 'b'.repeat(64),
    service: 'order-service',
    recordedAt: '2026-01-22T10:00:00.000Z',
    validatedAt: '2026-01-22T10:00:00.000Z',
    recordedBy: { type: 'HUMAN_OPERATOR', principal: 'arn:aws:iam::123456789012:user/operator' },
    classification: {
      truePositive: true,
      falsePositive: false,
      rootCause: 'Database connection pool exhausted',
      resolutionType: 'FIXED',
    },
    timing: {
      detectedAt: '2026-01-22T09:00:00.000Z',
      resolvedAt: '2026-01-22T09:45:00.000Z',
      closedAt: '2026-01-22T10:00:00.000Z',
      ttd: 0,
      ttr: 2700000,
    },
    humanAssessment: {
      confidenceRating: 0.85,
      severityAccuracy: 'ACCURATE',
      detectionQuality: 'GOOD',
    },
    version: '1.0.0',
    ...overrides,
  });
  
  beforeEach(() => {
    outcomeStore = {} as OutcomeStore;
    summaryStore = {} as ResolutionSummaryStore;
    
    extractor = new PatternExtractor(outcomeStore, summaryStore);
  });
  
  describe('extractPatterns', () => {
    it('should extract patterns from outcomes', async () => {
      const outcomes = [
        createMockOutcome(),
        createMockOutcome({ outcomeId: 'c'.repeat(64) }),
      ];
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
      summaryStore.storeSummary = vi.fn().mockResolvedValue(true);
      
      const summary = await extractor.extractPatterns(
        'order-service',
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      expect(summary.summaryId).toHaveLength(64);
      expect(summary.service).toBe('order-service');
      expect(summary.metrics.totalIncidents).toBe(2);
    });
    
    it('should have deterministic summaryId', async () => {
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue([createMockOutcome()]);
      summaryStore.storeSummary = vi.fn().mockResolvedValue(true);
      
      const summary1 = await extractor.extractPatterns(
        'order-service',
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      const summary2 = await extractor.extractPatterns(
        'order-service',
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      expect(summary1.summaryId).toBe(summary2.summaryId);
    });
    
    it('should aggregate metrics correctly', async () => {
      const outcomes = [
        createMockOutcome({ timing: { ...createMockOutcome().timing, ttd: 100, ttr: 200 } }),
        createMockOutcome({ 
          outcomeId: 'c'.repeat(64),
          timing: { ...createMockOutcome().timing, ttd: 300, ttr: 400 },
        }),
      ];
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
      summaryStore.storeSummary = vi.fn().mockResolvedValue(true);
      
      const summary = await extractor.extractPatterns(
        'order-service',
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      expect(summary.metrics.totalIncidents).toBe(2);
      expect(summary.metrics.truePositives).toBe(2);
      expect(summary.metrics.falsePositives).toBe(0);
      expect(summary.metrics.averageTTD).toBe(200); // (100 + 300) / 2
      expect(summary.metrics.averageTTR).toBe(300); // (200 + 400) / 2
    });
    
    it('should identify common root causes (top 10)', async () => {
      const outcomes = [
        createMockOutcome({ classification: { ...createMockOutcome().classification, rootCause: 'Cause A' } }),
        createMockOutcome({ outcomeId: 'c'.repeat(64), classification: { ...createMockOutcome().classification, rootCause: 'Cause A' } }),
        createMockOutcome({ outcomeId: 'd'.repeat(64), classification: { ...createMockOutcome().classification, rootCause: 'Cause B' } }),
      ];
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
      summaryStore.storeSummary = vi.fn().mockResolvedValue(true);
      
      const summary = await extractor.extractPatterns(
        'order-service',
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      expect(summary.patterns.commonRootCauses).toHaveLength(2);
      expect(summary.patterns.commonRootCauses[0].value).toBe('Cause A');
      expect(summary.patterns.commonRootCauses[0].count).toBe(2);
      expect(summary.patterns.commonRootCauses[1].value).toBe('Cause B');
      expect(summary.patterns.commonRootCauses[1].count).toBe(1);
    });
    
    it('should not store percentages in patterns', async () => {
      const outcomes = [createMockOutcome()];
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
      summaryStore.storeSummary = vi.fn().mockResolvedValue(true);
      
      const summary = await extractor.extractPatterns(
        'order-service',
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      const pattern = summary.patterns.commonRootCauses[0];
      expect(pattern).toHaveProperty('value');
      expect(pattern).toHaveProperty('count');
      expect(pattern).not.toHaveProperty('percentage');
    });
    
    it('should identify detection warnings (FP rate > 30%)', async () => {
      const outcomes = [
        createMockOutcome({ service: 'payment-service', classification: { ...createMockOutcome().classification, truePositive: false, falsePositive: true } }),
        createMockOutcome({ outcomeId: 'c'.repeat(64), service: 'payment-service', classification: { ...createMockOutcome().classification, truePositive: false, falsePositive: true } }),
        createMockOutcome({ outcomeId: 'd'.repeat(64), service: 'payment-service', classification: { ...createMockOutcome().classification, truePositive: true, falsePositive: false } }),
      ];
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
      summaryStore.storeSummary = vi.fn().mockResolvedValue(true);
      
      const summary = await extractor.extractPatterns(
        undefined,
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      // FP rate = 2/3 = 66.7% > 30%
      expect(summary.patterns.detectionWarnings).toContain('payment-service');
    });
    
    it('should handle empty outcomes', async () => {
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue([]);
      summaryStore.storeSummary = vi.fn().mockResolvedValue(true);
      
      const summary = await extractor.extractPatterns(
        'order-service',
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      expect(summary.metrics.totalIncidents).toBe(0);
      expect(summary.patterns.commonRootCauses).toHaveLength(0);
    });
    
    it('should handle single outcome', async () => {
      const outcomes = [createMockOutcome()];
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
      summaryStore.storeSummary = vi.fn().mockResolvedValue(true);
      
      const summary = await extractor.extractPatterns(
        'order-service',
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      expect(summary.metrics.totalIncidents).toBe(1);
      expect(summary.patterns.commonRootCauses).toHaveLength(1);
    });
  });
  
  describe('extractAllPatterns', () => {
    it('should extract patterns for multiple services', async () => {
      const outcomes = [
        createMockOutcome({ service: 'order-service' }),
        createMockOutcome({ outcomeId: 'c'.repeat(64), service: 'payment-service' }),
      ];
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(outcomes);
      summaryStore.storeSummary = vi.fn().mockResolvedValue(true);
      
      const summaries = await extractor.extractAllPatterns(
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      // One per service + one aggregate
      expect(summaries.length).toBe(3);
      
      const orderSummary = summaries.find(s => s.service === 'order-service');
      const paymentSummary = summaries.find(s => s.service === 'payment-service');
      const aggregateSummary = summaries.find(s => s.service === undefined);
      
      expect(orderSummary).toBeDefined();
      expect(paymentSummary).toBeDefined();
      expect(aggregateSummary).toBeDefined();
      expect(aggregateSummary!.metrics.totalIncidents).toBe(2);
    });
  });
  
  describe('idempotency', () => {
    it('should generate same summaryId for same inputs', async () => {
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue([createMockOutcome()]);
      summaryStore.storeSummary = vi.fn()
        .mockResolvedValueOnce(true)  // First call: created
        .mockResolvedValueOnce(false); // Second call: duplicate
      
      const summary1 = await extractor.extractPatterns(
        'order-service',
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      const summary2 = await extractor.extractPatterns(
        'order-service',
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      expect(summary1.summaryId).toBe(summary2.summaryId);
      expect(summaryStore.storeSummary).toHaveBeenCalledTimes(2);
    });
    
    it('should generate different summaryId for different service', async () => {
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue([createMockOutcome()]);
      summaryStore.storeSummary = vi.fn().mockResolvedValue(true);
      
      const summary1 = await extractor.extractPatterns(
        'order-service',
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      const summary2 = await extractor.extractPatterns(
        'payment-service',
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      expect(summary1.summaryId).not.toBe(summary2.summaryId);
    });
    
    it('should generate different summaryId for different dates', async () => {
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue([createMockOutcome()]);
      summaryStore.storeSummary = vi.fn().mockResolvedValue(true);
      
      const summary1 = await extractor.extractPatterns(
        'order-service',
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      
      const summary2 = await extractor.extractPatterns(
        'order-service',
        '2026-02-01T00:00:00.000Z',
        '2026-02-28T23:59:59.999Z'
      );
      
      expect(summary1.summaryId).not.toBe(summary2.summaryId);
    });
  });
});
