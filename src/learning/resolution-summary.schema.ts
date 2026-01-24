/**
 * Phase 4 - Step 4: Resolution Summary Schema
 * 
 * Aggregate summary of outcomes for a service/time window.
 * 
 * CRITICAL RULES:
 * - summaryId is DETERMINISTIC (SHA256, not UUID)
 * - Percentages are DERIVED at read-time (not stored)
 * - detectionWarnings are informational only (no automated action)
 */

import { z } from 'zod';

/**
 * Summary Metrics
 * 
 * Aggregated metrics from outcomes.
 */
export const SummaryMetricsSchema = z.object({
  totalIncidents: z.number().nonnegative(),
  truePositives: z.number().nonnegative(),
  falsePositives: z.number().nonnegative(),
  averageTTD: z.number().nonnegative(), // milliseconds
  averageTTR: z.number().nonnegative(), // milliseconds
  averageConfidence: z.number().min(0).max(1),
});

/**
 * Pattern Item
 * 
 * A single pattern (root cause, resolution, etc.)
 * 
 * CRITICAL: Percentage is DERIVED at read-time, not stored.
 */
export const PatternItemSchema = z.object({
  value: z.string(),
  count: z.number().positive(),
  // percentage is computed at read-time: (count / total) * 100
});

/**
 * Summary Patterns
 * 
 * Identified patterns from outcomes.
 */
export const SummaryPatternsSchema = z.object({
  commonRootCauses: z.array(PatternItemSchema), // Top 10
  commonResolutions: z.array(PatternItemSchema), // Top 10
  detectionWarnings: z.array(z.string()), // Services with high FP rate (informational only)
});

/**
 * Resolution Summary
 * 
 * Complete summary for a service/time window.
 * 
 * CRITICAL: summaryId is DETERMINISTIC (not UUID).
 * summaryId = SHA256(service + ":" + startDate + ":" + endDate + ":" + version)
 */
export const ResolutionSummarySchema = z.object({
  summaryId: z.string().length(64), // SHA256 hex (deterministic)
  service: z.string().min(1).optional(), // undefined = all services
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  generatedAt: z.string().datetime(),
  metrics: SummaryMetricsSchema,
  patterns: SummaryPatternsSchema,
  version: z.string().min(1),
});

// Export types
export type SummaryMetrics = z.infer<typeof SummaryMetricsSchema>;
export type PatternItem = z.infer<typeof PatternItemSchema>;
export type SummaryPatterns = z.infer<typeof SummaryPatternsSchema>;
export type ResolutionSummary = z.infer<typeof ResolutionSummarySchema>;
