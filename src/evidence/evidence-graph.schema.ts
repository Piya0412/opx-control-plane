import { z } from 'zod';

/**
 * Evidence Graph Schema
 * 
 * Represents the evidence graph that links detections to candidates.
 * Evidence graphs provide the audit trail from signals → detections → candidates → incidents.
 * 
 * Invariants:
 * - Graph ID is deterministic (hash of candidateId + detectionIds)
 * - Same candidate + same detections → same graph ID
 * - Idempotent storage (safe to retry)
 * - Replay-safe (deterministic IDs)
 */
export const EvidenceGraphSchema = z.object({
  graphId: z.string().min(1),
  candidateId: z.string().min(1),
  detectionIds: z.array(z.string()).min(1),
  signalIds: z.array(z.string()).min(1),
  createdAt: z.string().datetime()
});

export type EvidenceGraph = z.infer<typeof EvidenceGraphSchema>;
