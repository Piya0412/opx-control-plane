/**
 * Detection Events Module
 * 
 * Phase 2.4: Detection & Evidence
 * 
 * This module defines event schemas for detection-related events.
 * Events are for observability and decoupled propagation.
 * 
 * IMPORTANT: Events are NOT authoritative.
 * Storage (DynamoDB) is the source of truth.
 */

export { 
  DetectionCreatedEvent, 
  DetectionCreatedEventSchema,
  createDetectionCreatedEvent 
} from './detection-created.schema';
