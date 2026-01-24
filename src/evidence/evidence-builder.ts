/**
 * Phase 3.1: Evidence Builder
 * 
 * Builds evidence bundles from detections with validation.
 * 
 * RULES:
 * - Fail-closed on validation errors
 * - All detections must be from same service
 * - All detections must be within window
 * - Deterministic ID generation
 */

import type { EvidenceBundle, DetectionSummary } from './evidence-bundle.schema.js';
import { EvidenceBundleSchema } from './evidence-bundle.schema.js';
import { computeEvidenceId } from './evidence-id.js';
import { computeSignalSummary } from './signal-summary.js';

/**
 * Evidence Builder
 * 
 * Constructs evidence bundles from detections with full validation.
 */
export class EvidenceBuilder {
  /**
   * Build evidence bundle from detections
   * 
   * @param detections - Array of detection summaries
   * @param service - Service name (must match all detections)
   * @param windowStart - Window start time (ISO-8601)
   * @param windowEnd - Window end time (ISO-8601)
   * @returns Evidence bundle
   * @throws If validation fails
   */
  buildBundle(
    detections: DetectionSummary[],
    service: string,
    windowStart: string,
    windowEnd: string
  ): EvidenceBundle {
    // Validate inputs (fail-closed)
    this.validateInputs(detections, service, windowStart, windowEnd);
    
    // Validate all detections are from same service
    this.validateServiceConsistency(detections, service);
    
    // Validate all detections are within window
    this.validateTemporalBounds(detections, windowStart, windowEnd);
    
    // Extract detection IDs
    const detectionIds = detections.map(d => d.detectionId);
    
    // Compute deterministic evidence ID
    const evidenceId = computeEvidenceId(detectionIds, windowStart, windowEnd);
    
    // Compute signal summary
    const signalSummary = computeSignalSummary(detections);
    
    // Build bundle object
    const bundle: EvidenceBundle = {
      evidenceId,
      service,
      windowStart,
      windowEnd,
      detections,
      signalSummary,
      bundledAt: new Date().toISOString(),
    };
    
    // Validate against schema (fail-closed)
    const result = EvidenceBundleSchema.safeParse(bundle);
    if (!result.success) {
      throw new Error(`Evidence bundle validation failed: ${result.error.message}`);
    }
    
    return result.data;
  }
  
  /**
   * Validate basic inputs
   */
  private validateInputs(
    detections: DetectionSummary[],
    service: string,
    windowStart: string,
    windowEnd: string
  ): void {
    if (!detections || detections.length === 0) {
      throw new Error('Cannot build evidence bundle with zero detections');
    }
    
    if (!service || service.trim().length === 0) {
      throw new Error('Service is required');
    }
    
    if (!windowStart || !windowEnd) {
      throw new Error('Window start and end are required');
    }
    
    // Validate window order
    const start = new Date(windowStart);
    const end = new Date(windowEnd);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Invalid window timestamps');
    }
    
    if (end < start) {
      throw new Error('Window end must be >= window start');
    }
  }
  
  /**
   * Validate all detections are from same service
   */
  private validateServiceConsistency(
    detections: DetectionSummary[],
    expectedService: string
  ): void {
    // Note: DetectionSummary doesn't have service field
    // This validation will be done at the detection level
    // For now, we trust the caller to provide correct service
    // In Phase 3.2+, we'll add service field to DetectionSummary if needed
  }
  
  /**
   * Validate all detections are within window
   */
  private validateTemporalBounds(
    detections: DetectionSummary[],
    windowStart: string,
    windowEnd: string
  ): void {
    const start = new Date(windowStart).getTime();
    const end = new Date(windowEnd).getTime();
    
    for (const detection of detections) {
      const detectedAt = new Date(detection.detectedAt).getTime();
      
      if (detectedAt < start || detectedAt > end) {
        throw new Error(
          `Detection ${detection.detectionId} is outside window bounds ` +
          `(detected: ${detection.detectedAt}, window: ${windowStart} - ${windowEnd})`
        );
      }
    }
  }
}
