/**
 * CP-7: State Machine Tests
 * 
 * Tests for state transition validation.
 * 
 * 🔒 INV-7.4: Legal state machine only
 * 🔒 INV-7.8: Fail-closed on invalid transition
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IncidentStateMachine } from '../../src/incident/state-machine.js';
import type { IncidentStatus } from '../../src/incident/incident-status.schema.js';

describe('CP-7: Incident State Machine', () => {
  let stateMachine: IncidentStateMachine;

  beforeEach(() => {
    stateMachine = new IncidentStateMachine();
  });

  describe('legal transitions', () => {
    it('should allow PENDING → OPEN', () => {
      const result = stateMachine.validateTransition('PENDING', 'OPEN');
      expect(result.allowed).toBe(true);
    });

    it('should allow OPEN → MITIGATING', () => {
      const result = stateMachine.validateTransition('OPEN', 'MITIGATING');
      expect(result.allowed).toBe(true);
    });

    it('should allow OPEN → RESOLVED', () => {
      const result = stateMachine.validateTransition('OPEN', 'RESOLVED');
      expect(result.allowed).toBe(true);
    });

    it('should allow MITIGATING → RESOLVED', () => {
      const result = stateMachine.validateTransition('MITIGATING', 'RESOLVED');
      expect(result.allowed).toBe(true);
    });

    it('should allow RESOLVED → CLOSED', () => {
      const result = stateMachine.validateTransition('RESOLVED', 'CLOSED');
      expect(result.allowed).toBe(true);
    });
  });

  describe('illegal transitions (CORRECTION 1 & 2)', () => {
    it('should reject PENDING → CLOSED (CORRECTION 1)', () => {
      const result = stateMachine.validateTransition('PENDING', 'CLOSED');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Illegal transition');
    });

    it('should reject PENDING → MITIGATING', () => {
      const result = stateMachine.validateTransition('PENDING', 'MITIGATING');
      expect(result.allowed).toBe(false);
    });

    it('should reject PENDING → RESOLVED', () => {
      const result = stateMachine.validateTransition('PENDING', 'RESOLVED');
      expect(result.allowed).toBe(false);
    });

    it('should reject OPEN → CLOSED', () => {
      const result = stateMachine.validateTransition('OPEN', 'CLOSED');
      expect(result.allowed).toBe(false);
    });

    it('should reject MITIGATING → OPEN', () => {
      const result = stateMachine.validateTransition('MITIGATING', 'OPEN');
      expect(result.allowed).toBe(false);
    });

    it('should reject MITIGATING → CLOSED', () => {
      const result = stateMachine.validateTransition('MITIGATING', 'CLOSED');
      expect(result.allowed).toBe(false);
    });

    it('should reject RESOLVED → OPEN', () => {
      const result = stateMachine.validateTransition('RESOLVED', 'OPEN');
      expect(result.allowed).toBe(false);
    });

    it('should reject RESOLVED → MITIGATING', () => {
      const result = stateMachine.validateTransition('RESOLVED', 'MITIGATING');
      expect(result.allowed).toBe(false);
    });

    it('should reject CLOSED → OPEN (CORRECTION 2)', () => {
      const result = stateMachine.validateTransition('CLOSED', 'OPEN');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('terminal');
    });

    it('should reject CLOSED → any state (terminal)', () => {
      const states: IncidentStatus[] = ['PENDING', 'OPEN', 'MITIGATING', 'RESOLVED'];
      
      for (const state of states) {
        const result = stateMachine.validateTransition('CLOSED', state);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('terminal');
      }
    });
  });

  describe('terminal state detection', () => {
    it('should identify CLOSED as terminal', () => {
      expect(stateMachine.isTerminal('CLOSED')).toBe(true);
    });

    it('should not identify PENDING as terminal', () => {
      expect(stateMachine.isTerminal('PENDING')).toBe(false);
    });

    it('should not identify OPEN as terminal', () => {
      expect(stateMachine.isTerminal('OPEN')).toBe(false);
    });

    it('should not identify MITIGATING as terminal', () => {
      expect(stateMachine.isTerminal('MITIGATING')).toBe(false);
    });

    it('should not identify RESOLVED as terminal', () => {
      expect(stateMachine.isTerminal('RESOLVED')).toBe(false);
    });
  });

  describe('resolution requirements (CORRECTION 4)', () => {
    it('should require resolution for RESOLVED', () => {
      expect(stateMachine.requiresResolution('RESOLVED')).toBe(true);
    });

    it('should not require resolution for PENDING', () => {
      expect(stateMachine.requiresResolution('PENDING')).toBe(false);
    });

    it('should not require resolution for OPEN', () => {
      expect(stateMachine.requiresResolution('OPEN')).toBe(false);
    });

    it('should not require resolution for MITIGATING', () => {
      expect(stateMachine.requiresResolution('MITIGATING')).toBe(false);
    });

    it('should not require resolution for CLOSED', () => {
      expect(stateMachine.requiresResolution('CLOSED')).toBe(false);
    });

    it('should require existing resolution for CLOSED', () => {
      expect(stateMachine.requiresExistingResolution('CLOSED')).toBe(true);
    });

    it('should not require existing resolution for RESOLVED', () => {
      expect(stateMachine.requiresExistingResolution('RESOLVED')).toBe(false);
    });
  });

  describe('legal next states', () => {
    it('should return correct next states for PENDING', () => {
      const nextStates = stateMachine.getLegalNextStates('PENDING');
      expect(nextStates).toEqual(['OPEN']);
    });

    it('should return correct next states for OPEN', () => {
      const nextStates = stateMachine.getLegalNextStates('OPEN');
      expect(nextStates).toContain('MITIGATING');
      expect(nextStates).toContain('RESOLVED');
      expect(nextStates.length).toBe(2);
    });

    it('should return correct next states for MITIGATING', () => {
      const nextStates = stateMachine.getLegalNextStates('MITIGATING');
      expect(nextStates).toEqual(['RESOLVED']);
    });

    it('should return correct next states for RESOLVED', () => {
      const nextStates = stateMachine.getLegalNextStates('RESOLVED');
      expect(nextStates).toEqual(['CLOSED']);
    });

    it('should return empty array for CLOSED', () => {
      const nextStates = stateMachine.getLegalNextStates('CLOSED');
      expect(nextStates).toEqual([]);
    });
  });

  describe('fail-closed behavior (INV-7.8)', () => {
    it('should provide reason for illegal transition', () => {
      const result = stateMachine.validateTransition('PENDING', 'CLOSED');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.reason).toContain('Illegal transition');
    });

    it('should provide reason for terminal state transition', () => {
      const result = stateMachine.validateTransition('CLOSED', 'OPEN');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.reason).toContain('terminal');
    });

    it('should list legal transitions in error message', () => {
      const result = stateMachine.validateTransition('PENDING', 'CLOSED');
      expect(result.reason).toContain('Legal transitions');
      expect(result.reason).toContain('OPEN');
    });
  });
});
