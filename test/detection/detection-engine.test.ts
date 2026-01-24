import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DetectionEngine, DetectionStore, EventEmitter } from '../../src/detection';
import { SignalEvent } from '../../src/signal/signal-event.schema';

describe('DetectionEngine', () => {
  let mockDetectionStore: DetectionStore;
  let mockEventEmitter: EventEmitter;
  let detectionEngine: DetectionEngine;

  beforeEach(() => {
    // Mock detection store
    mockDetectionStore = {
      putDetection: vi.fn().mockResolvedValue(true),
      getDetection: vi.fn(),
      exists: vi.fn()
    } as any;

    // Mock event emitter
    mockEventEmitter = {
      emit: vi.fn().mockResolvedValue(undefined)
    };

    // Create detection engine
    detectionEngine = new DetectionEngine({
      detectionStore: mockDetectionStore,
      eventEmitter: mockEventEmitter
    });
  });

  describe('Detection ID Computation', () => {
    it('should generate same ID for same signals and rule', async () => {
      const signal: SignalEvent = {
        signalId: 'signal-1',
        service: 'testapi',
        severity: 'SEV1',
        observedAt: '2026-01-21T00:00:00Z',
        rawSignal: {}
      };

      const result1 = await detectionEngine.processSignal(
        signal,
        'rule-1',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      const result2 = await detectionEngine.processSignal(
        signal,
        'rule-1',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      expect(result1.detection.detectionId).toBe(result2.detection.detectionId);
    });

    it('should generate same ID for different signal order', async () => {
      const signals1: SignalEvent[] = [
        { signalId: 'signal-1', service: 'testapi', severity: 'SEV1', observedAt: '2026-01-21T00:00:00Z', rawSignal: {} },
        { signalId: 'signal-2', service: 'testapi', severity: 'SEV1', observedAt: '2026-01-21T00:01:00Z', rawSignal: {} }
      ];

      const signals2: SignalEvent[] = [
        { signalId: 'signal-2', service: 'testapi', severity: 'SEV1', observedAt: '2026-01-21T00:01:00Z', rawSignal: {} },
        { signalId: 'signal-1', service: 'testapi', severity: 'SEV1', observedAt: '2026-01-21T00:00:00Z', rawSignal: {} }
      ];

      const result1 = await detectionEngine.processSignals(
        signals1,
        'rule-1',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      const result2 = await detectionEngine.processSignals(
        signals2,
        'rule-1',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      expect(result1.detection.detectionId).toBe(result2.detection.detectionId);
    });

    it('should generate different ID for different signals', async () => {
      const signal1: SignalEvent = {
        signalId: 'signal-1',
        service: 'testapi',
        severity: 'SEV1',
        observedAt: '2026-01-21T00:00:00Z',
        rawSignal: {}
      };

      const signal2: SignalEvent = {
        signalId: 'signal-2',
        service: 'testapi',
        severity: 'SEV1',
        observedAt: '2026-01-21T00:01:00Z',
        rawSignal: {}
      };

      const result1 = await detectionEngine.processSignal(
        signal1,
        'rule-1',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      const result2 = await detectionEngine.processSignal(
        signal2,
        'rule-1',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      expect(result1.detection.detectionId).not.toBe(result2.detection.detectionId);
    });

    it('should generate different ID for different rule', async () => {
      const signal: SignalEvent = {
        signalId: 'signal-1',
        service: 'testapi',
        severity: 'SEV1',
        observedAt: '2026-01-21T00:00:00Z',
        rawSignal: {}
      };

      const result1 = await detectionEngine.processSignal(
        signal,
        'rule-1',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      const result2 = await detectionEngine.processSignal(
        signal,
        'rule-2',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      expect(result1.detection.detectionId).not.toBe(result2.detection.detectionId);
    });

    it('should generate different ID for different rule version', async () => {
      const signal: SignalEvent = {
        signalId: 'signal-1',
        service: 'testapi',
        severity: 'SEV1',
        observedAt: '2026-01-21T00:00:00Z',
        rawSignal: {}
      };

      const result1 = await detectionEngine.processSignal(
        signal,
        'rule-1',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      const result2 = await detectionEngine.processSignal(
        signal,
        'rule-1',
        '2.0.0',
        '2026-01-21T00:00:00Z'
      );

      expect(result1.detection.detectionId).not.toBe(result2.detection.detectionId);
    });
  });

  describe('Single Signal Processing', () => {
    it('should create detection from valid signal', async () => {
      const signal: SignalEvent = {
        signalId: 'signal-1',
        service: 'testapi',
        severity: 'SEV1',
        observedAt: '2026-01-21T00:00:00Z',
        rawSignal: {}
      };

      const result = await detectionEngine.processSignal(
        signal,
        'rule-1',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      expect(result.detection).toMatchObject({
        signalIds: ['signal-1'],
        service: 'testapi',
        severity: 'SEV1',
        ruleId: 'rule-1',
        ruleVersion: '1.0.0',
        detectedAt: '2026-01-21T00:00:00Z',
        confidence: 1.0,
        attributes: { signalCount: 1 }
      });
      expect(result.detection.detectionId).toBeTruthy();
    });

    it('should store detection in DynamoDB', async () => {
      const signal: SignalEvent = {
        signalId: 'signal-1',
        service: 'testapi',
        severity: 'SEV1',
        observedAt: '2026-01-21T00:00:00Z',
        rawSignal: {}
      };

      await detectionEngine.processSignal(
        signal,
        'rule-1',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      expect(mockDetectionStore.putDetection).toHaveBeenCalledWith(
        expect.objectContaining({
          signalIds: ['signal-1'],
          service: 'testapi',
          severity: 'SEV1'
        })
      );
    });

    it('should emit DetectionCreated event', async () => {
      const signal: SignalEvent = {
        signalId: 'signal-1',
        service: 'testapi',
        severity: 'SEV1',
        observedAt: '2026-01-21T00:00:00Z',
        rawSignal: {}
      };

      await detectionEngine.processSignal(
        signal,
        'rule-1',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'DetectionCreated',
          service: 'testapi',
          severity: 'SEV1'
        })
      );
    });

    it('should be idempotent - same signal returns same detection', async () => {
      const signal: SignalEvent = {
        signalId: 'signal-1',
        service: 'testapi',
        severity: 'SEV1',
        observedAt: '2026-01-21T00:00:00Z',
        rawSignal: {}
      };

      // First call - new detection
      vi.mocked(mockDetectionStore.putDetection).mockResolvedValueOnce(true);
      const result1 = await detectionEngine.processSignal(
        signal,
        'rule-1',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      // Second call - existing detection
      vi.mocked(mockDetectionStore.putDetection).mockResolvedValueOnce(false);
      const result2 = await detectionEngine.processSignal(
        signal,
        'rule-1',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      expect(result1.isNew).toBe(true);
      expect(result2.isNew).toBe(false);
      expect(result1.detection.detectionId).toBe(result2.detection.detectionId);
    });

    it('should not emit event if detection already exists', async () => {
      const signal: SignalEvent = {
        signalId: 'signal-1',
        service: 'testapi',
        severity: 'SEV1',
        observedAt: '2026-01-21T00:00:00Z',
        rawSignal: {}
      };

      // Detection already exists
      vi.mocked(mockDetectionStore.putDetection).mockResolvedValueOnce(false);

      await detectionEngine.processSignal(
        signal,
        'rule-1',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('Multiple Signal Processing', () => {
    it('should create detection from multiple signals', async () => {
      const signals: SignalEvent[] = [
        { signalId: 'signal-1', service: 'testapi', severity: 'SEV1', observedAt: '2026-01-21T00:00:00Z', rawSignal: {} },
        { signalId: 'signal-2', service: 'testapi', severity: 'SEV1', observedAt: '2026-01-21T00:01:00Z', rawSignal: {} },
        { signalId: 'signal-3', service: 'testapi', severity: 'SEV1', observedAt: '2026-01-21T00:02:00Z', rawSignal: {} }
      ];

      const result = await detectionEngine.processSignals(
        signals,
        'rule-1',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      expect(result.detection).toMatchObject({
        signalIds: ['signal-1', 'signal-2', 'signal-3'],
        service: 'testapi',
        severity: 'SEV1',
        ruleId: 'rule-1',
        ruleVersion: '1.0.0',
        detectedAt: '2026-01-21T00:00:00Z',
        confidence: 0.3,  // 3 signals / 10
        attributes: { signalCount: 3 }
      });
    });

    it('should sort signal IDs in detection', async () => {
      const signals: SignalEvent[] = [
        { signalId: 'signal-3', service: 'testapi', severity: 'SEV1', observedAt: '2026-01-21T00:02:00Z', rawSignal: {} },
        { signalId: 'signal-1', service: 'testapi', severity: 'SEV1', observedAt: '2026-01-21T00:00:00Z', rawSignal: {} },
        { signalId: 'signal-2', service: 'testapi', severity: 'SEV1', observedAt: '2026-01-21T00:01:00Z', rawSignal: {} }
      ];

      const result = await detectionEngine.processSignals(
        signals,
        'rule-1',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      expect(result.detection.signalIds).toEqual(['signal-1', 'signal-2', 'signal-3']);
    });

    it('should compute confidence correctly', async () => {
      // 5 signals = 0.5 confidence
      const signals5: SignalEvent[] = Array.from({ length: 5 }, (_, i) => ({
        signalId: `signal-${i}`,
        service: 'testapi',
        severity: 'SEV1',
        observedAt: '2026-01-21T00:00:00Z',
        rawSignal: {}
      }));

      const result5 = await detectionEngine.processSignals(
        signals5,
        'rule-1',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      expect(result5.detection.confidence).toBe(0.5);

      // 15 signals = 1.0 confidence (capped)
      const signals15: SignalEvent[] = Array.from({ length: 15 }, (_, i) => ({
        signalId: `signal-${i}`,
        service: 'testapi',
        severity: 'SEV1',
        observedAt: '2026-01-21T00:00:00Z',
        rawSignal: {}
      }));

      const result15 = await detectionEngine.processSignals(
        signals15,
        'rule-1',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      expect(result15.detection.confidence).toBe(1.0);
    });

    it('should throw error if signals have different service', async () => {
      const signals: SignalEvent[] = [
        { signalId: 'signal-1', service: 'testapi', severity: 'SEV1', observedAt: '2026-01-21T00:00:00Z', rawSignal: {} },
        { signalId: 'signal-2', service: 'otherapi', severity: 'SEV1', observedAt: '2026-01-21T00:01:00Z', rawSignal: {} }
      ];

      await expect(
        detectionEngine.processSignals(signals, 'rule-1', '1.0.0', '2026-01-21T00:00:00Z')
      ).rejects.toThrow('All signals must have same service');
    });

    it('should throw error if signals have different severity', async () => {
      const signals: SignalEvent[] = [
        { signalId: 'signal-1', service: 'testapi', severity: 'SEV1', observedAt: '2026-01-21T00:00:00Z', rawSignal: {} },
        { signalId: 'signal-2', service: 'testapi', severity: 'SEV2', observedAt: '2026-01-21T00:01:00Z', rawSignal: {} }
      ];

      await expect(
        detectionEngine.processSignals(signals, 'rule-1', '1.0.0', '2026-01-21T00:00:00Z')
      ).rejects.toThrow('All signals must have same severity');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for invalid signal - missing signalId', async () => {
      const signal: any = {
        service: 'testapi',
        severity: 'SEV1',
        observedAt: '2026-01-21T00:00:00Z',
        rawSignal: {}
      };

      await expect(
        detectionEngine.processSignal(signal, 'rule-1', '1.0.0', '2026-01-21T00:00:00Z')
      ).rejects.toThrow('Invalid signal');
    });

    it('should throw error for empty signal array', async () => {
      await expect(
        detectionEngine.processSignals([], 'rule-1', '1.0.0', '2026-01-21T00:00:00Z')
      ).rejects.toThrow('Cannot create detection with zero signals');
    });

    it('should throw error if storage fails', async () => {
      const signal: SignalEvent = {
        signalId: 'signal-1',
        service: 'testapi',
        severity: 'SEV1',
        observedAt: '2026-01-21T00:00:00Z',
        rawSignal: {}
      };

      vi.mocked(mockDetectionStore.putDetection).mockRejectedValueOnce(
        new Error('DynamoDB error')
      );

      await expect(
        detectionEngine.processSignal(signal, 'rule-1', '1.0.0', '2026-01-21T00:00:00Z')
      ).rejects.toThrow('DynamoDB error');
    });

    it('should continue if event emission fails', async () => {
      const signal: SignalEvent = {
        signalId: 'signal-1',
        service: 'testapi',
        severity: 'SEV1',
        observedAt: '2026-01-21T00:00:00Z',
        rawSignal: {}
      };

      vi.mocked(mockEventEmitter.emit).mockRejectedValueOnce(
        new Error('EventBridge error')
      );

      // Should not throw - event emission is best-effort
      const result = await detectionEngine.processSignal(
        signal,
        'rule-1',
        '1.0.0',
        '2026-01-21T00:00:00Z'
      );

      expect(result.detection).toBeTruthy();
      expect(result.isNew).toBe(true);
    });
  });
});
