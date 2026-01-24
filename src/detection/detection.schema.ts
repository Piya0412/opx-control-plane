import { z } from 'zod';

/**
 * Detection Schema
 * 
 * Represents a detection created from one or more signals.
 * Detections are the evidence layer that makes incidents audit-valid.
 * 
 * Invariants:
 * - Detection ID is deterministic (hash of signalIds + ruleId + ruleVersion)
 * - Same signals + same rule → same detection ID
 * - Idempotent storage (safe to retry)
 * - Replay-safe (deterministic IDs)
 */
export const DetectionSchema = z.object({
  detectionId: z.string().min(1),
  signalIds: z.array(z.string()).min(1),
  service: z.string().min(1),
  severity: z.string().regex(/^SEV[1-5]$/),
  ruleId: z.string().min(1),
  ruleVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  detectedAt: z.string().datetime(),
  confidence: z.number().min(0).max(1),
  attributes: z.record(z.unknown())
});

export type Detection = z.infer<typeof DetectionSchema>;
