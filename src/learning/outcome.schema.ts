/**
 * Phase 4 - Step 1: Outcome Schema
 * 
 * Defines immutable outcome records for closed incidents.
 * 
 * RULES:
 * - Append-only (no updates/deletes)
 * - Human-validated only
 * - CLOSED incidents only
 * - No deleted* fields (GDPR handled separately)
 */

import { z } from 'zod';
import { AuthoritySchema } from '../incident/incident.schema';

/**
 * Outcome Classification
 * 
 * Human assessment of incident outcome.
 */
export const OutcomeClassificationSchema = z.object({
  truePositive: z.boolean(),
  falsePositive: z.boolean(),
  rootCause: z.string().min(1).max(500),
  resolutionType: z.enum(['FIXED', 'MITIGATED', 'FALSE_ALARM', 'DUPLICATE', 'OTHER']),
}).refine(
  (data) => !(data.truePositive && data.falsePositive),
  { message: 'Outcome cannot be both true positive and false positive' }
);

/**
 * Outcome Timing Metrics
 * 
 * Timing data derived from incident lifecycle.
 */
export const OutcomeTimingSchema = z.object({
  detectedAt: z.string().datetime(),
  acknowledgedAt: z.string().datetime().optional(),
  mitigatedAt: z.string().datetime().optional(),
  resolvedAt: z.string().datetime(),
  closedAt: z.string().datetime(),
  ttd: z.number().nonnegative(), // Time-to-detect: openedAt - earliest signal timestamp
  ttr: z.number().nonnegative(), // Time-to-resolve: resolvedAt - detectedAt
});

/**
 * Human Assessment
 * 
 * Human evaluation of system performance.
 */
export const HumanAssessmentSchema = z.object({
  confidenceRating: z.number().min(0).max(1),
  severityAccuracy: z.enum(['ACCURATE', 'TOO_HIGH', 'TOO_LOW']),
  detectionQuality: z.enum(['EXCELLENT', 'GOOD', 'FAIR', 'POOR']),
  notes: z.string().max(2000).optional(),
});

/**
 * Incident Outcome (Immutable)
 * 
 * Complete outcome record for a closed incident.
 * 
 * CRITICAL: No deleted* fields (GDPR handled separately)
 */
export const IncidentOutcomeSchema = z.object({
  // Identity
  outcomeId: z.string().length(64),
  incidentId: z.string().length(64),
  service: z.string().min(1), // Explicit field, copied from incident
  
  // Timestamps
  recordedAt: z.string().datetime(), // System write time
  validatedAt: z.string().datetime(), // Human confirmation time (>= recordedAt)
  
  // Authority
  recordedBy: AuthoritySchema,
  
  // Classification
  classification: OutcomeClassificationSchema,
  
  // Timing
  timing: OutcomeTimingSchema,
  
  // Human Assessment
  humanAssessment: HumanAssessmentSchema,
  
  // Metadata
  version: z.string().min(1),
}).refine(
  (data) => new Date(data.validatedAt) >= new Date(data.recordedAt),
  { message: 'validatedAt must be >= recordedAt' }
);

/**
 * Outcome Request (API Input)
 * 
 * User-provided data for outcome recording.
 * Timing metrics are derived from incident, not provided by user.
 */
export const OutcomeRequestSchema = z.object({
  classification: OutcomeClassificationSchema,
  humanAssessment: HumanAssessmentSchema,
});

/**
 * Outcome Filters
 * 
 * Query filters for listing outcomes.
 */
export const OutcomeFiltersSchema = z.object({
  service: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  truePositive: z.boolean().optional(),
  falsePositive: z.boolean().optional(),
}).optional();

// Export TypeScript types
export type IncidentOutcome = z.infer<typeof IncidentOutcomeSchema>;
export type OutcomeClassification = z.infer<typeof OutcomeClassificationSchema>;
export type OutcomeTiming = z.infer<typeof OutcomeTimingSchema>;
export type HumanAssessment = z.infer<typeof HumanAssessmentSchema>;
export type OutcomeRequest = z.infer<typeof OutcomeRequestSchema>;
export type OutcomeFilters = z.infer<typeof OutcomeFiltersSchema>;
