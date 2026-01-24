import { describe, it, expect } from 'vitest';
import {
  isValidTransition,
  getAllowedTransitions,
  IncidentState,
  VALID_TRANSITIONS,
  IncidentSchema,
  CreateIncidentRequestSchema,
} from '../../src/domain/incident.js';

/**
 * Incident Domain Tests
 * 
 * These tests verify DETERMINISTIC behavior.
 * Same input MUST always produce same output.
 */
describe('Incident State Machine', () => {
  describe('isValidTransition', () => {
    it('should allow CREATED → ANALYZING', () => {
      expect(isValidTransition('CREATED', 'ANALYZING')).toBe(true);
    });

    it('should allow ANALYZING → DECIDED', () => {
      expect(isValidTransition('ANALYZING', 'DECIDED')).toBe(true);
    });

    it('should allow DECIDED → WAITING_FOR_HUMAN', () => {
      expect(isValidTransition('DECIDED', 'WAITING_FOR_HUMAN')).toBe(true);
    });

    it('should allow WAITING_FOR_HUMAN → CLOSED', () => {
      expect(isValidTransition('WAITING_FOR_HUMAN', 'CLOSED')).toBe(true);
    });

    it('should allow WAITING_FOR_HUMAN → ANALYZING (rejection path)', () => {
      expect(isValidTransition('WAITING_FOR_HUMAN', 'ANALYZING')).toBe(true);
    });

    it('should NOT allow skipping states', () => {
      expect(isValidTransition('CREATED', 'DECIDED')).toBe(false);
      expect(isValidTransition('CREATED', 'WAITING_FOR_HUMAN')).toBe(false);
      expect(isValidTransition('CREATED', 'CLOSED')).toBe(false);
      expect(isValidTransition('ANALYZING', 'CLOSED')).toBe(false);
    });

    it('should NOT allow backward transitions (except rejection)', () => {
      expect(isValidTransition('DECIDED', 'ANALYZING')).toBe(false);
      expect(isValidTransition('DECIDED', 'CREATED')).toBe(false);
      expect(isValidTransition('CLOSED', 'WAITING_FOR_HUMAN')).toBe(false);
    });

    it('should NOT allow any transitions from CLOSED (terminal state)', () => {
      const allStates: IncidentState[] = ['CREATED', 'ANALYZING', 'DECIDED', 'WAITING_FOR_HUMAN', 'CLOSED'];
      for (const state of allStates) {
        expect(isValidTransition('CLOSED', state)).toBe(false);
      }
    });

    it('should be DETERMINISTIC - same input always produces same output', () => {
      // Run 100 times to verify determinism
      for (let i = 0; i < 100; i++) {
        expect(isValidTransition('CREATED', 'ANALYZING')).toBe(true);
        expect(isValidTransition('CREATED', 'CLOSED')).toBe(false);
      }
    });
  });

  describe('getAllowedTransitions', () => {
    it('should return correct transitions for each state', () => {
      expect(getAllowedTransitions('CREATED')).toEqual(['ANALYZING']);
      expect(getAllowedTransitions('ANALYZING')).toEqual(['DECIDED']);
      expect(getAllowedTransitions('DECIDED')).toEqual(['WAITING_FOR_HUMAN']);
      expect(getAllowedTransitions('WAITING_FOR_HUMAN')).toEqual(['CLOSED', 'ANALYZING']);
      expect(getAllowedTransitions('CLOSED')).toEqual([]);
    });

    it('should return a new array each time (immutability)', () => {
      const first = getAllowedTransitions('CREATED');
      const second = getAllowedTransitions('CREATED');
      expect(first).not.toBe(second);
      expect(first).toEqual(second);
    });
  });

  describe('VALID_TRANSITIONS constant', () => {
    it('should cover all states', () => {
      const allStates: IncidentState[] = ['CREATED', 'ANALYZING', 'DECIDED', 'WAITING_FOR_HUMAN', 'CLOSED'];
      for (const state of allStates) {
        expect(VALID_TRANSITIONS[state]).toBeDefined();
        expect(Array.isArray(VALID_TRANSITIONS[state])).toBe(true);
      }
    });

    it('should only contain valid states as targets', () => {
      const allStates = new Set<string>(['CREATED', 'ANALYZING', 'DECIDED', 'WAITING_FOR_HUMAN', 'CLOSED']);
      for (const [, targets] of Object.entries(VALID_TRANSITIONS)) {
        for (const target of targets) {
          expect(allStates.has(target)).toBe(true);
        }
      }
    });
  });
});

describe('Incident Schema Validation', () => {
  describe('CreateIncidentRequestSchema', () => {
    it('should accept valid request', () => {
      const valid = {
        service: 'payment-service',
        severity: 'SEV2',
        title: 'High latency in payment processing',
      };
      expect(() => CreateIncidentRequestSchema.parse(valid)).not.toThrow();
    });

    it('should reject empty service', () => {
      const invalid = {
        service: '',
        severity: 'SEV2',
        title: 'Test',
      };
      expect(() => CreateIncidentRequestSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid severity', () => {
      const invalid = {
        service: 'test-service',
        severity: 'CRITICAL', // Not a valid severity
        title: 'Test',
      };
      expect(() => CreateIncidentRequestSchema.parse(invalid)).toThrow();
    });

    it('should reject empty title', () => {
      const invalid = {
        service: 'test-service',
        severity: 'SEV1',
        title: '',
      };
      expect(() => CreateIncidentRequestSchema.parse(invalid)).toThrow();
    });
  });

  describe('IncidentSchema', () => {
    it('should accept valid incident', () => {
      const valid = {
        incidentId: '550e8400-e29b-41d4-a716-446655440000',
        service: 'payment-service',
        severity: 'SEV1',
        state: 'CREATED',
        title: 'Payment failures',
        signals: [],
        timeline: [{
          entryId: '550e8400-e29b-41d4-a716-446655440001',
          timestamp: '2024-01-15T10:30:00.000Z',
          type: 'CREATED',
          actor: 'user@example.com',
          newState: 'CREATED',
        }],
        createdAt: '2024-01-15T10:30:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
        createdBy: 'user@example.com',
        version: 1,
        eventSeq: 0,
      };
      expect(() => IncidentSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid state', () => {
      const invalid = {
        incidentId: '550e8400-e29b-41d4-a716-446655440000',
        service: 'payment-service',
        severity: 'SEV1',
        state: 'INVALID_STATE',
        title: 'Payment failures',
        signals: [],
        timeline: [],
        createdAt: '2024-01-15T10:30:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
        createdBy: 'user@example.com',
        version: 1,
      };
      expect(() => IncidentSchema.parse(invalid)).toThrow();
    });

    it('should reject non-positive version', () => {
      const invalid = {
        incidentId: '550e8400-e29b-41d4-a716-446655440000',
        service: 'payment-service',
        severity: 'SEV1',
        state: 'CREATED',
        title: 'Payment failures',
        signals: [],
        timeline: [],
        createdAt: '2024-01-15T10:30:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
        createdBy: 'user@example.com',
        version: 0,
      };
      expect(() => IncidentSchema.parse(invalid)).toThrow();
    });
  });
});
