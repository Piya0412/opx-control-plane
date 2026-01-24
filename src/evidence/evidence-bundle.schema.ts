/**
 * Phase 3.1: Evidence Bundle Schema
 * 
 * Formal evidence representation for incident construction.
 * 
 * INVARIANTS:
 * - Evidence bundles are immutable
 * - Built only from stored detections
 * - Rebuildable via replay
 * - Deterministic evidence IDs
 */

import { z } from 'zod';

/**
 * Normalized Severity (from Phase 2)
 * 
 * Aligned with signal normalization.
 */
export const NormalizedSeveritySchema = z.enum([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'INFO',
]);

export type NormalizedSeverity = z.infer<typeof NormalizedSeveritySchema>;

/**
 * Detection Summary
 * 
 * Simplified detection for evidence bundle.
 * Contains only fields needed for incident construction.
 */
export const DetectionSummarySchema = z.object({
  detectionId: z.string().min(1),
  ruleId: z.string().min(1),
  ruleVersion: z.string().min(1),
  severity: NormalizedSeveritySchema,
  confidence: z.number().min(0).max(1),
  detectedAt: z.string().datetime(),
  signalIds: z.array(z.string()).min(1),
  metadata: z.record(z.unknown()).optional(), // Observational data, does not affect logic
});

export type DetectionSummary = z.infer<typeof DetectionSummarySchema>;

/**
 * Signal Summary
 * 
 * Computed aggregation of signals across all detections.
 * Not stored separately - computed from detections.
 */
export const SignalSummarySchema = z.object({
  signalCount: z.number().int().min(1),
  severityDistribution: z.record(z.number().int().min(0)),
  timeSpread: z.number().min(0), // milliseconds
  uniqueRules: z.number().int().min(1),
});

export type SignalSummary = z.infer<typeof SignalSummarySchema>;

/**
 * Evidence Bundle
 * 
 * Immutable collection of detections representing evidence for an incident.
 * 
 * RULES:
 * - Cannot exist without detections (min 1)
 * - Window end must be >= window start
 * - Evidence ID is deterministic hash
 * - All detections must be from same service
 */
export const EvidenceBundleSchema = z.object({
  // Identity (deterministic)
  evidenceId: z.string().length(64), // SHA256 hash
  
  // Context
  service: z.string().min(1).max(256),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  
  // Core Evidence
  detections: z.array(DetectionSummarySchema).min(1),
  
  // Summary (computed)
  signalSummary: SignalSummarySchema,
  
  // Correlation (optional, from Phase 2.2)
  correlationKey: z.string().length(64).optional(),
  
  // Audit
  bundledAt: z.string().datetime(),
  bundleVersion: z.string().optional(), // Version of bundling logic
}).refine(
  (data) => new Date(data.windowEnd) >= new Date(data.windowStart),
  {
    message: 'windowEnd must be >= windowStart',
    path: ['windowEnd'],
  }
);

export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;
