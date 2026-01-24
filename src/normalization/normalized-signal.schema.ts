/**
 * CP-2: Normalized Signal Schema
 * 
 * Pure, deterministic normalization output.
 * Does NOT extend CP-1 Signal (new entity).
 * 
 * INVARIANTS:
 * - Stateless (no memory between executions)
 * - Deterministic (same input → same output)
 * - Replay-safe (full recomputation from CP-1)
 * - Pure (no side effects beyond storage)
 */

import { z } from 'zod';

/**
 * Resource Reference
 * Extracted from explicit CP-1 fields only (no inference)
 */
export const ResourceRefSchema = z.object({
  refType: z.enum(['aws-arn', 'name', 'id']),
  refValue: z.string().min(1),
  sourceField: z.string().min(1), // Traceability: which CP-1 field
});

export type ResourceRef = z.infer<typeof ResourceRefSchema>;

/**
 * Environment Reference
 * Extracted from explicit CP-1 fields only (no inference)
 */
export const EnvironmentRefSchema = z.object({
  envType: z.enum(['account', 'region', 'stage']),
  value: z.string().min(1),
  sourceField: z.string().min(1), // Traceability: which CP-1 field
});

export type EnvironmentRef = z.infer<typeof EnvironmentRefSchema>;

/**
 * Evidence Reference
 * Pointer to CP-1 signal (no duplication, no summaries)
 */
export const EvidenceRefSchema = z.object({
  evidenceType: z.literal('raw-signal'),
  refId: z.string().min(1), // sourceSignalId
  checksum: z.string().min(1), // CP-1 rawChecksum
});

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

/**
 * Normalized Signal
 * 
 * Output of CP-2 normalization.
 * NEW ENTITY (does NOT extend CP-1 Signal).
 * 
 * RULES:
 * - 1 CP-1 Signal → 1 Normalized Signal
 * - No aggregation, no deduplication
 * - All fields are source-derived (no inference)
 * - Fully deterministic and replayable
 */
export const NormalizedSignalSchema = z.object({
  // Identity (deterministic)
  normalizedSignalId: z.string().min(1), // SHA256(version + sourceSignalId + signalType + timestamp)
  sourceSignalId: z.string().min(1),     // CP-1 signalId (read-only reference)
  
  // Classification (from CP-1, passed through)
  signalType: z.string().min(1),         // Canonicalized (lowercase, kebab-case)
  source: z.string().min(1),             // Enum-validated
  severity: z.string().min(1),           // Passed through (CP-1 decided)
  confidence: z.string().min(1),         // Passed through
  
  // Temporal (from CP-1, canonicalized)
  timestamp: z.string().datetime(),      // ISO-8601 UTC
  
  // References (extracted, not inferred)
  resourceRefs: z.array(ResourceRefSchema),
  environmentRefs: z.array(EnvironmentRefSchema),
  evidenceRefs: z.array(EvidenceRefSchema),
  
  // Metadata
  normalizationVersion: z.string().min(1), // e.g., "v1"
  normalizedAt: z.string().datetime(),     // ISO-8601 UTC
});

export type NormalizedSignal = z.infer<typeof NormalizedSignalSchema>;

/**
 * Normalization Result
 * Output of normalization engine
 */
export const NormalizationResultSchema = z.object({
  success: z.boolean(),
  normalizedSignalId: z.string().optional(),
  normalizedSignal: NormalizedSignalSchema.optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }).optional(),
});

export type NormalizationResult = z.infer<typeof NormalizationResultSchema>;
