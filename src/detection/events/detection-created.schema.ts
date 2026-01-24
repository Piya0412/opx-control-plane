import { z } from 'zod';

/**
 * DetectionCreated Event Schema
 * 
 * Emitted when a new detection is created from signals.
 * This event is for observability and decoupled propagation.
 * 
 * IMPORTANT: This event is NOT authoritative.
 * - Events are best-effort observability
 * - Replay MUST NOT depend on event emission
 * - Storage (DynamoDB) is the source of truth
 * - Event emission failures do NOT block detection creation
 * 
 * Consumers:
 * - Observability dashboards
 * - Audit trail
 * - Alerting systems
 * - Future: Feedback loops (Phase 4+)
 */
export const DetectionCreatedEventSchema = z.object({
  eventType: z.literal('DetectionCreated'),
  detectionId: z.string().min(1),
  signalIds: z.array(z.string()).min(1),
  service: z.string().min(1),
  severity: z.string().regex(/^SEV[1-5]$/),
  ruleId: z.string().min(1),
  ruleVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  detectedAt: z.string().datetime(),
  confidence: z.number().min(0).max(1).optional(),
  signalCount: z.number().int().positive().optional()
});

export type DetectionCreatedEvent = z.infer<typeof DetectionCreatedEventSchema>;

/**
 * Helper function to create DetectionCreated event
 * 
 * @param detection - Detection object
 * @returns DetectionCreated event
 */
export function createDetectionCreatedEvent(detection: {
  detectionId: string;
  signalIds: string[];
  service: string;
  severity: string;
  ruleId: string;
  ruleVersion: string;
  detectedAt: string;
  confidence?: number;
  attributes?: { signalCount?: number };
}): DetectionCreatedEvent {
  const event: DetectionCreatedEvent = {
    eventType: 'DetectionCreated',
    detectionId: detection.detectionId,
    signalIds: detection.signalIds,
    service: detection.service,
    severity: detection.severity,
    ruleId: detection.ruleId,
    ruleVersion: detection.ruleVersion,
    detectedAt: detection.detectedAt,
    confidence: detection.confidence,
    signalCount: detection.attributes?.signalCount
  };

  // Validate event
  return DetectionCreatedEventSchema.parse(event);
}
