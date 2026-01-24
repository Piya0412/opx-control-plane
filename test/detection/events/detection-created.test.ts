import { describe, it, expect } from 'vitest';
import { 
  DetectionCreatedEventSchema, 
  createDetectionCreatedEvent,
  DetectionCreatedEvent 
} from '../../../src/detection/events/detection-created.schema';

describe('DetectionCreatedEvent', () => {
  const validEvent: DetectionCreatedEvent = {
    eventType: 'DetectionCreated',
    detectionId: 'detection-123',
    signalIds: ['signal-1', 'signal-2'],
    service: 'testapi',
    severity: 'SEV1',
    ruleId: 'rule-1',
    ruleVersion: '1.0.0',
    detectedAt: '2026-01-21T00:00:00Z',
    confidence: 0.8,
    signalCount: 2
  };

  describe('Schema Validation', () => {
    it('should validate valid event', () => {
      const result = DetectionCreatedEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it('should reject event with missing required fields', () => {
      const invalidEvent = {
        eventType: 'DetectionCreated',
        detectionId: 'detection-123'
        // Missing other required fields
      };

      const result = DetectionCreatedEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });

    it('should reject event with invalid severity format', () => {
      const invalidEvent = {
        ...validEvent,
        severity: 'CRITICAL'  // Invalid format
      };

      const result = DetectionCreatedEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });

    it('should reject event with invalid ruleVersion format', () => {
      const invalidEvent = {
        ...validEvent,
        ruleVersion: 'v1.0'  // Invalid format (should be semantic version)
      };

      const result = DetectionCreatedEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });

    it('should reject event with invalid datetime format', () => {
      const invalidEvent = {
        ...validEvent,
        detectedAt: '2026-01-21'  // Invalid format (missing time)
      };

      const result = DetectionCreatedEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });

    it('should accept event without optional fields', () => {
      const minimalEvent = {
        eventType: 'DetectionCreated' as const,
        detectionId: 'detection-123',
        signalIds: ['signal-1'],
        service: 'testapi',
        severity: 'SEV1',
        ruleId: 'rule-1',
        ruleVersion: '1.0.0',
        detectedAt: '2026-01-21T00:00:00Z'
        // No confidence or signalCount
      };

      const result = DetectionCreatedEventSchema.safeParse(minimalEvent);
      expect(result.success).toBe(true);
    });

    it('should validate all severity levels', () => {
      const severities = ['SEV1', 'SEV2', 'SEV3', 'SEV4', 'SEV5'];

      for (const severity of severities) {
        const event = { ...validEvent, severity };
        const result = DetectionCreatedEventSchema.safeParse(event);
        expect(result.success).toBe(true);
      }
    });

    it('should reject confidence outside 0-1 range', () => {
      const invalidEvent1 = { ...validEvent, confidence: -0.1 };
      const invalidEvent2 = { ...validEvent, confidence: 1.1 };

      expect(DetectionCreatedEventSchema.safeParse(invalidEvent1).success).toBe(false);
      expect(DetectionCreatedEventSchema.safeParse(invalidEvent2).success).toBe(false);
    });

    it('should reject negative signalCount', () => {
      const invalidEvent = { ...validEvent, signalCount: -1 };

      const result = DetectionCreatedEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });

    it('should reject zero signalCount', () => {
      const invalidEvent = { ...validEvent, signalCount: 0 };

      const result = DetectionCreatedEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });

    it('should reject empty signalIds array', () => {
      const invalidEvent = { ...validEvent, signalIds: [] };

      const result = DetectionCreatedEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });
  });

  describe('createDetectionCreatedEvent', () => {
    it('should create valid event from detection', () => {
      const detection = {
        detectionId: 'detection-123',
        signalIds: ['signal-1', 'signal-2'],
        service: 'testapi',
        severity: 'SEV1',
        ruleId: 'rule-1',
        ruleVersion: '1.0.0',
        detectedAt: '2026-01-21T00:00:00Z',
        confidence: 0.8,
        attributes: { signalCount: 2 }
      };

      const event = createDetectionCreatedEvent(detection);

      expect(event).toEqual({
        eventType: 'DetectionCreated',
        detectionId: 'detection-123',
        signalIds: ['signal-1', 'signal-2'],
        service: 'testapi',
        severity: 'SEV1',
        ruleId: 'rule-1',
        ruleVersion: '1.0.0',
        detectedAt: '2026-01-21T00:00:00Z',
        confidence: 0.8,
        signalCount: 2
      });
    });

    it('should create event without optional fields', () => {
      const detection = {
        detectionId: 'detection-123',
        signalIds: ['signal-1'],
        service: 'testapi',
        severity: 'SEV1',
        ruleId: 'rule-1',
        ruleVersion: '1.0.0',
        detectedAt: '2026-01-21T00:00:00Z'
      };

      const event = createDetectionCreatedEvent(detection);

      expect(event.eventType).toBe('DetectionCreated');
      expect(event.confidence).toBeUndefined();
      expect(event.signalCount).toBeUndefined();
    });

    it('should extract signalCount from attributes', () => {
      const detection = {
        detectionId: 'detection-123',
        signalIds: ['signal-1', 'signal-2', 'signal-3'],
        service: 'testapi',
        severity: 'SEV1',
        ruleId: 'rule-1',
        ruleVersion: '1.0.0',
        detectedAt: '2026-01-21T00:00:00Z',
        attributes: { signalCount: 3 }
      };

      const event = createDetectionCreatedEvent(detection);

      expect(event.signalCount).toBe(3);
    });

    it('should validate created event', () => {
      const invalidDetection = {
        detectionId: 'detection-123',
        signalIds: ['signal-1'],
        service: 'testapi',
        severity: 'INVALID',  // Invalid severity
        ruleId: 'rule-1',
        ruleVersion: '1.0.0',
        detectedAt: '2026-01-21T00:00:00Z'
      };

      expect(() => createDetectionCreatedEvent(invalidDetection)).toThrow();
    });

    it('should handle detection with all optional fields', () => {
      const detection = {
        detectionId: 'detection-123',
        signalIds: ['signal-1', 'signal-2', 'signal-3', 'signal-4', 'signal-5'],
        service: 'testapi',
        severity: 'SEV2',
        ruleId: 'rule-high-volume',
        ruleVersion: '2.1.3',
        detectedAt: '2026-01-21T12:34:56.789Z',
        confidence: 0.95,
        attributes: { 
          signalCount: 5,
          otherMetadata: 'ignored'
        }
      };

      const event = createDetectionCreatedEvent(detection);

      expect(event).toEqual({
        eventType: 'DetectionCreated',
        detectionId: 'detection-123',
        signalIds: ['signal-1', 'signal-2', 'signal-3', 'signal-4', 'signal-5'],
        service: 'testapi',
        severity: 'SEV2',
        ruleId: 'rule-high-volume',
        ruleVersion: '2.1.3',
        detectedAt: '2026-01-21T12:34:56.789Z',
        confidence: 0.95,
        signalCount: 5
      });
    });
  });

  describe('Event Type', () => {
    it('should have literal eventType', () => {
      const event = { ...validEvent };
      expect(event.eventType).toBe('DetectionCreated');
    });

    it('should reject wrong eventType', () => {
      const invalidEvent = {
        ...validEvent,
        eventType: 'DetectionUpdated'
      };

      const result = DetectionCreatedEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });
  });

  describe('Field Constraints', () => {
    it('should require non-empty detectionId', () => {
      const invalidEvent = { ...validEvent, detectionId: '' };
      expect(DetectionCreatedEventSchema.safeParse(invalidEvent).success).toBe(false);
    });

    it('should require non-empty service', () => {
      const invalidEvent = { ...validEvent, service: '' };
      expect(DetectionCreatedEventSchema.safeParse(invalidEvent).success).toBe(false);
    });

    it('should require non-empty ruleId', () => {
      const invalidEvent = { ...validEvent, ruleId: '' };
      expect(DetectionCreatedEventSchema.safeParse(invalidEvent).success).toBe(false);
    });

    it('should accept confidence at boundaries', () => {
      const event0 = { ...validEvent, confidence: 0.0 };
      const event1 = { ...validEvent, confidence: 1.0 };

      expect(DetectionCreatedEventSchema.safeParse(event0).success).toBe(true);
      expect(DetectionCreatedEventSchema.safeParse(event1).success).toBe(true);
    });

    it('should require positive integer signalCount', () => {
      const validEvent1 = { ...validEvent, signalCount: 1 };
      const validEvent100 = { ...validEvent, signalCount: 100 };
      const invalidEventFloat = { ...validEvent, signalCount: 1.5 };

      expect(DetectionCreatedEventSchema.safeParse(validEvent1).success).toBe(true);
      expect(DetectionCreatedEventSchema.safeParse(validEvent100).success).toBe(true);
      expect(DetectionCreatedEventSchema.safeParse(invalidEventFloat).success).toBe(false);
    });
  });
});
