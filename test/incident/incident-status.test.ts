/**
 * CP-7: Incident Status Tests
 * 
 * Tests for incident status enum and legal transitions.
 * 
 * 🔒 CORRECTION 1: PENDING → CLOSED removed
 * 🔒 CORRECTION 2: CLOSED is terminal
 */

import { describe, it, expect } from 'vitest';
import {
  LEGAL_TRANSITIONS,
  TERMINAL_STATES,
  REQUIRES_RESOLUTION,
  REQUIRES_EXISTING_RESOLUTION,
  type IncidentStatus,
} from '../../src/incident/incident-status.schema.js';

describe('CP-7: Incident Status Schema', () => {
  describe('legal transitions', () => {
    it('should allow PENDING → OPEN', () => {
      expect(LEGAL_TRANSITIONS.PENDING).toContain('OPEN');
    });

    it('should NOT allow PENDING → CLOSED (CORRECTION 1)', () => {
      expect(LEGAL_TRANSITIONS.PENDING).not.toContain('CLOSED');
    });

    it('should allow OPEN → MITIGATING', () => {
      expect(LEGAL_TRANSITIONS.OPEN).toContain('MITIGATING');
    });

    it('should allow OPEN → RESOLVED', () => {
      expect(LEGAL_TRANSITIONS.OPEN).toContain('RESOLVED');
    });

    it('should allow MITIGATING → RESOLVED', () => {
      expect(LEGAL_TRANSITIONS.MITIGATING).toContain('RESOLVED');
    });

    it('should allow RESOLVED → CLOSED', () => {
      expect(LEGAL_TRANSITIONS.RESOLVED).toContain('CLOSED');
    });

    it('should NOT allow CLOSED → OPEN (CORRECTION 2)', () => {
      expect(LEGAL_TRANSITIONS.CLOSED).not.toContain('OPEN');
    });

    it('should NOT allow CLOSED → any state (terminal)', () => {
      expect(LEGAL_TRANSITIONS.CLOSED).toEqual([]);
    });
  });

  describe('terminal states', () => {
    it('should mark CLOSED as terminal', () => {
      expect(TERMINAL_STATES).toContain('CLOSED');
    });

    it('should have only CLOSED as terminal', () => {
      expect(TERMINAL_STATES).toEqual(['CLOSED']);
    });
  });

  describe('resolution requirements', () => {
    it('should require resolution for RESOLVED', () => {
      expect(REQUIRES_RESOLUTION).toContain('RESOLVED');
    });

    it('should require existing resolution for CLOSED', () => {
      expect(REQUIRES_EXISTING_RESOLUTION).toContain('CLOSED');
    });

    it('should not require resolution for PENDING', () => {
      expect(REQUIRES_RESOLUTION).not.toContain('PENDING');
    });

    it('should not require resolution for OPEN', () => {
      expect(REQUIRES_RESOLUTION).not.toContain('OPEN');
    });

    it('should not require resolution for MITIGATING', () => {
      expect(REQUIRES_RESOLUTION).not.toContain('MITIGATING');
    });
  });

  describe('state machine completeness', () => {
    it('should have transitions defined for all non-terminal states', () => {
      const allStates: IncidentStatus[] = ['PENDING', 'OPEN', 'MITIGATING', 'RESOLVED', 'CLOSED'];
      const nonTerminalStates = allStates.filter(s => !TERMINAL_STATES.includes(s));

      for (const state of nonTerminalStates) {
        expect(LEGAL_TRANSITIONS[state]).toBeDefined();
        expect(LEGAL_TRANSITIONS[state].length).toBeGreaterThan(0);
      }
    });

    it('should have empty transitions for terminal states', () => {
      for (const state of TERMINAL_STATES) {
        expect(LEGAL_TRANSITIONS[state]).toEqual([]);
      }
    });
  });
});
