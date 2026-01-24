/**
 * Detection Module
 * 
 * Phase 2.4: Detection & Evidence
 * 
 * This module provides the detection layer that makes incidents audit-valid.
 * Detections are created from signals and provide evidence for candidates.
 */

export { Detection, DetectionSchema } from './detection.schema';
export { DetectionEngine, DetectionEngineConfig, DetectionResult, EventEmitter } from './detection-engine';
export { DetectionStore, DetectionStoreConfig } from './detection-store';
export { DetectionCreatedEvent, DetectionCreatedEventSchema, createDetectionCreatedEvent } from './events';
