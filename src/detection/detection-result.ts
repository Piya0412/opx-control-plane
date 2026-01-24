/**
 * CP-3: Detection Result Schema
 * 
 * DetectionResult is the DETERMINISTIC payload.
 * Same input + same rule version → byte-for-byte identical result.
 * 
 * INVARIANTS:
 * - detectedAt is in metadata, NOT in result
 * - Hash computations exclude metadata
 * - Replay comparisons use only DetectionResult
 */

import { z } from 'zod';
import { createHash } from 'crypto';
import { SeveritySchema, ConfidenceSchema } from './rule-schema.js';

/**
 * Evaluation Step
 * Records one step in the evaluation trace.
 */
export const EvaluationStepSchema = z.object({
  stepIndex: z.number().int().min(0),
  conditionId: z.string().min(1),
  field: z.string(),
  operator: z.string(),
  expected: z.any(),
  actual: z.any(),
  result: z.boolean(),
});

export type EvaluationStep = z.infer<typeof EvaluationStepSchema>;

/**
 * Detection Decision
 */
export const DecisionSchema = z.enum(['MATCH', 'NO_MATCH']);
export type Decision = z.infer<typeof DecisionSchema>;

/**
 * Detection Result - DETERMINISTIC PAYLOAD
 * 
 * This is the replay-safe, deterministic portion.
 * Same input + same rule version → byte-for-byte identical result.
 */
export const DetectionResultSchema = z.object({
  // Identity (deterministic)
  detectionId: z.string().length(64),  // SHA256 hex
  
  // Rule reference
  ruleId: z.string().min(1),
  ruleVersion: z.string().min(1),
  
  // Signal reference
  normalizedSignalId: z.string().min(1),
  signalTimestamp: z.string().datetime(),
  
  // Decision (deterministic)
  decision: DecisionSchema,
  severity: SeveritySchema,
  confidence: ConfidenceSchema,
  
  // Explainability (deterministic)
  evaluationTrace: z.array(EvaluationStepSchema),
  
  // Version tracking
  detectionVersion: z.string().min(1),
});

export type DetectionResult = z.infer<typeof DetectionResultSchema>;

/**
 * Detection Metadata - OPERATIONAL (NON-DETERMINISTIC)
 * 
 * Stored alongside but NOT part of deterministic payload.
 * NOT included in hash comparisons.
 * NOT compared during replay verification.
 */
export const DetectionMetadataSchema = z.object({
  detectedAt: z.string().datetime(),
  detectionDurationMs: z.number().optional(),
});

export type DetectionMetadata = z.infer<typeof DetectionMetadataSchema>;

/**
 * Stored Detection - What goes in DynamoDB
 */
export const StoredDetectionSchema = z.object({
  result: DetectionResultSchema,
  metadata: DetectionMetadataSchema,
});

export type StoredDetection = z.infer<typeof StoredDetectionSchema>;

/**
 * Compute deterministic detection ID
 * 
 * Formula: SHA256(ruleId + ruleVersion + normalizedSignalId)
 * 
 * INVARIANT: Same inputs → same ID
 * 
 * Shared utility - use this everywhere to avoid divergence.
 */
export function computeDetectionId(
  ruleId: string,
  ruleVersion: string,
  normalizedSignalId: string
): string {
  const input = `${ruleId}|${ruleVersion}|${normalizedSignalId}`;
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Current detection schema version
 */
export const DETECTION_VERSION = 'v1';
