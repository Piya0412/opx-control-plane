import { createHash } from 'crypto';
import { Detection, DetectionSchema } from './detection.schema.js';
import { DetectionStore } from './detection-store.js';
import { SignalEvent } from '../signal/signal-event.schema.js';

/**
 * Detection Engine Configuration
 */
export interface DetectionEngineConfig {
  detectionStore: DetectionStore;
  eventEmitter?: EventEmitter;
}

/**
 * Event Emitter Interface
 */
export interface EventEmitter {
  emit(event: any): Promise<void>;
}

/**
 * Detection Result
 */
export interface DetectionResult {
  detection: Detection;
  isNew: boolean;  // false if already existed (idempotent)
}

/**
 * Detection Engine
 * 
 * Converts signals into detections with deterministic IDs and audit-valid evidence.
 * 
 * Responsibilities:
 * - Consume signals
 * - Group signals deterministically
 * - Create detections with deterministic IDs
 * - Persist detections to DynamoDB
 * - Emit DetectionCreated events (best-effort)
 * 
 * Does NOT:
 * - Perform correlation (that's Phase 2.2)
 * - Create candidates (that's CP-5)
 * - Create incidents (that's CP-7)
 * - Make promotion decisions (that's CP-6)
 * 
 * Invariants:
 * - Same signals + same rule → same detection ID
 * - Detection ID is deterministic (replay-safe)
 * - Idempotent storage (safe to retry)
 * - Fail-closed on errors
 */
export class DetectionEngine {
  private detectionStore: DetectionStore;
  private eventEmitter?: EventEmitter;

  constructor(config: DetectionEngineConfig) {
    this.detectionStore = config.detectionStore;
    this.eventEmitter = config.eventEmitter;
  }

  /**
   * Compute deterministic detection ID
   * 
   * @param signalIds - Array of signal IDs
   * @param ruleId - Detection rule ID
   * @param ruleVersion - Detection rule version
   * @returns Deterministic detection ID (SHA-256 hash)
   */
  private computeDetectionId(
    signalIds: string[],
    ruleId: string,
    ruleVersion: string
  ): string {
    // Sort signal IDs for determinism (order-independent)
    const sortedSignalIds = [...signalIds].sort();
    
    // Concatenate inputs with delimiter
    const input = sortedSignalIds.join('|') + '|' + ruleId + '|' + ruleVersion;
    
    // Hash with SHA-256
    return createHash('sha256').update(input).digest('hex');
  }

  /**
   * Process a single signal and create detection
   * 
   * @param signal - The signal to process
   * @param ruleId - Detection rule ID
   * @param ruleVersion - Detection rule version
   * @param currentTime - Current timestamp (for determinism)
   * @returns Detection result
   * @throws If signal is invalid or storage fails
   */
  async processSignal(
    signal: SignalEvent,
    ruleId: string,
    ruleVersion: string,
    currentTime: string
  ): Promise<DetectionResult> {
    // Validate signal (fail-closed)
    if (!signal.signalId || !signal.service || !signal.severity) {
      throw new Error('Invalid signal: missing required fields (signalId, service, severity)');
    }

    // Compute detection ID (deterministic)
    const detectionId = this.computeDetectionId(
      [signal.signalId],
      ruleId,
      ruleVersion
    );

    // Build detection object
    const detection: Detection = {
      detectionId,
      signalIds: [signal.signalId],
      service: signal.service,
      severity: signal.severity,
      ruleId,
      ruleVersion,
      detectedAt: currentTime,
      confidence: 1.0,  // Single signal = high confidence
      attributes: {
        signalCount: 1
      }
    };

    // Validate detection schema (fail-closed)
    DetectionSchema.parse(detection);

    // Store detection (idempotent)
    const isNew = await this.detectionStore.putDetection(detection);

    // Emit event only if new (best-effort observability)
    if (isNew && this.eventEmitter) {
      try {
        await this.eventEmitter.emit({
          eventType: 'DetectionCreated',
          detectionId: detection.detectionId,
          signalIds: detection.signalIds,
          service: detection.service,
          severity: detection.severity,
          ruleId: detection.ruleId,
          ruleVersion: detection.ruleVersion,
          detectedAt: detection.detectedAt,
          confidence: detection.confidence,
          signalCount: 1
        });
      } catch (error) {
        // Log warning but continue - events are observability only
        console.warn('Failed to emit DetectionCreated event', { 
          error, 
          detectionId: detection.detectionId 
        });
        // Do NOT throw - detection is already stored
      }
    }

    return { detection, isNew };
  }

  /**
   * Process multiple signals and create detection
   * 
   * @param signals - Array of signals to process
   * @param ruleId - Detection rule ID
   * @param ruleVersion - Detection rule version
   * @param currentTime - Current timestamp (for determinism)
   * @returns Detection result
   * @throws If signals are invalid or storage fails
   */
  async processSignals(
    signals: SignalEvent[],
    ruleId: string,
    ruleVersion: string,
    currentTime: string
  ): Promise<DetectionResult> {
    // Validate signals (fail-closed)
    if (!signals || signals.length === 0) {
      throw new Error('Cannot create detection with zero signals');
    }

    // Extract signal IDs
    const signalIds = signals.map(s => s.signalId);

    // Verify all signals have same service and severity (fail-closed)
    const service = signals[0].service;
    const severity = signals[0].severity;

    for (const signal of signals) {
      if (!signal.signalId || !signal.service || !signal.severity) {
        throw new Error('Invalid signal: missing required fields (signalId, service, severity)');
      }
      if (signal.service !== service) {
        throw new Error('All signals must have same service');
      }
      if (signal.severity !== severity) {
        throw new Error('All signals must have same severity');
      }
    }

    // Compute detection ID (deterministic)
    const detectionId = this.computeDetectionId(
      signalIds,
      ruleId,
      ruleVersion
    );

    // Compute confidence (more signals = higher confidence, max 1.0)
    const confidence = Math.min(1.0, signals.length / 10);

    // Build detection object
    const detection: Detection = {
      detectionId,
      signalIds: [...signalIds].sort(),  // Sort for determinism
      service,
      severity,
      ruleId,
      ruleVersion,
      detectedAt: currentTime,
      confidence,
      attributes: {
        signalCount: signals.length
      }
    };

    // Validate detection schema (fail-closed)
    DetectionSchema.parse(detection);

    // Store detection (idempotent)
    const isNew = await this.detectionStore.putDetection(detection);

    // Emit event only if new (best-effort observability)
    if (isNew && this.eventEmitter) {
      try {
        await this.eventEmitter.emit({
          eventType: 'DetectionCreated',
          detectionId: detection.detectionId,
          signalIds: detection.signalIds,
          service: detection.service,
          severity: detection.severity,
          ruleId: detection.ruleId,
          ruleVersion: detection.ruleVersion,
          detectedAt: detection.detectedAt,
          confidence: detection.confidence,
          signalCount: signals.length
        });
      } catch (error) {
        // Log warning but continue - events are observability only
        console.warn('Failed to emit DetectionCreated event', { 
          error, 
          detectionId: detection.detectionId 
        });
        // Do NOT throw - detection is already stored
      }
    }

    return { detection, isNew };
  }
}
