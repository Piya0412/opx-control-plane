/**
 * CP-8: Authority Validator Tests
 * 
 * Tests authority matrix enforcement.
 * 
 * 🔒 INV-8.3: Authority is explicit and validated
 * 🔒 INV-8.4: Fail-closed on authz failure
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AuthorityValidator } from '../../src/controller/authority-validator.js';
import type { AuthorityContext } from '../../src/controller/request-validator.js';
import type { Incident } from '../../src/incident/incident.schema.js';

describe('CP-8: Authority Validator', () => {
  let validator: AuthorityValidator;

  const createMockIncident = (severity: 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4'): Incident => ({
    incidentId: 'i'.repeat(64),
    decisionId: 'd'.repeat(64),
    candidateId: 'c'.repeat(64),
    severity,
    service: 'lambda',
    title: 'Test Incident',
    status: 'OPEN',
    createdAt: '2026-01-17T10:00:00.000Z',
    detectionCount: 2,
    evidenceGraphCount: 1,
    blastRadiusScope: 'SINGLE_SERVICE',
    incidentVersion: 1,
  });

  beforeEach(() => {
    validator = new AuthorityValidator();
  });

  describe('AUTO_ENGINE authority', () => {
    const authority: AuthorityContext = {
      authorityType: 'AUTO_ENGINE',
      authorityId: 'engine-001',
    };

    it('should allow OPEN for any severity', () => {
      const incident = createMockIncident('SEV1');
      const result = validator.validateAuthority('OPEN', incident, authority);
      expect(result.allowed).toBe(true);
    });

    it('should reject MITIGATE', () => {
      const incident = createMockIncident('SEV2');
      const result = validator.validateAuthority('MITIGATE', incident, authority);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('AUTO_ENGINE');
    });

    it('should reject RESOLVE', () => {
      const incident = createMockIncident('SEV2');
      const result = validator.validateAuthority('RESOLVE', incident, authority);
      expect(result.allowed).toBe(false);
    });

    it('should reject CLOSE', () => {
      const incident = createMockIncident('SEV2');
      const result = validator.validateAuthority('CLOSE', incident, authority);
      expect(result.allowed).toBe(false);
    });

    it('should allow READ', () => {
      const incident = createMockIncident('SEV1');
      const result = validator.validateAuthority('READ', incident, authority);
      expect(result.allowed).toBe(true);
    });
  });

  describe('HUMAN_OPERATOR authority', () => {
    const authority: AuthorityContext = {
      authorityType: 'HUMAN_OPERATOR',
      authorityId: 'user-123',
    };

    it('should allow OPEN for any severity', () => {
      const incident = createMockIncident('SEV1');
      const result = validator.validateAuthority('OPEN', incident, authority);
      expect(result.allowed).toBe(true);
    });

    it('should allow MITIGATE for any severity', () => {
      const incident = createMockIncident('SEV1');
      const result = validator.validateAuthority('MITIGATE', incident, authority);
      expect(result.allowed).toBe(true);
    });

    it('should allow RESOLVE for SEV2', () => {
      const incident = createMockIncident('SEV2');
      const result = validator.validateAuthority('RESOLVE', incident, authority);
      expect(result.allowed).toBe(true);
    });

    it('should allow RESOLVE for SEV3', () => {
      const incident = createMockIncident('SEV3');
      const result = validator.validateAuthority('RESOLVE', incident, authority);
      expect(result.allowed).toBe(true);
    });

    it('should allow RESOLVE for SEV4', () => {
      const incident = createMockIncident('SEV4');
      const result = validator.validateAuthority('RESOLVE', incident, authority);
      expect(result.allowed).toBe(true);
    });

    it('should reject RESOLVE for SEV1', () => {
      const incident = createMockIncident('SEV1');
      const result = validator.validateAuthority('RESOLVE', incident, authority);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('SEV1');
      expect(result.details?.requiredAuthority).toBe('ON_CALL_SRE');
    });

    it('should allow CLOSE for any severity', () => {
      const incident = createMockIncident('SEV1');
      const result = validator.validateAuthority('CLOSE', incident, authority);
      expect(result.allowed).toBe(true);
    });
  });

  describe('ON_CALL_SRE authority', () => {
    const authority: AuthorityContext = {
      authorityType: 'ON_CALL_SRE',
      authorityId: 'sre-001',
    };

    it('should allow all actions for SEV1', () => {
      const incident = createMockIncident('SEV1');
      const actions = ['OPEN', 'MITIGATE', 'RESOLVE', 'CLOSE', 'READ'] as const;
      
      for (const action of actions) {
        const result = validator.validateAuthority(action, incident, authority);
        expect(result.allowed).toBe(true);
      }
    });

    it('should allow all actions for SEV2', () => {
      const incident = createMockIncident('SEV2');
      const actions = ['OPEN', 'MITIGATE', 'RESOLVE', 'CLOSE', 'READ'] as const;
      
      for (const action of actions) {
        const result = validator.validateAuthority(action, incident, authority);
        expect(result.allowed).toBe(true);
      }
    });
  });

  describe('EMERGENCY_OVERRIDE authority', () => {
    const authority: AuthorityContext = {
      authorityType: 'EMERGENCY_OVERRIDE',
      authorityId: 'admin-001',
    };

    it('should allow all actions for any severity', () => {
      const severities = ['SEV1', 'SEV2', 'SEV3', 'SEV4'] as const;
      const actions = ['OPEN', 'MITIGATE', 'RESOLVE', 'CLOSE', 'READ'] as const;
      
      for (const severity of severities) {
        const incident = createMockIncident(severity);
        for (const action of actions) {
          const result = validator.validateAuthority(action, incident, authority);
          expect(result.allowed).toBe(true);
        }
      }
    });
  });

  describe('canPerformAction', () => {
    it('should return correct permissions for AUTO_ENGINE', () => {
      expect(validator.canPerformAction('OPEN', 'SEV1', 'AUTO_ENGINE')).toBe(true);
      expect(validator.canPerformAction('RESOLVE', 'SEV2', 'AUTO_ENGINE')).toBe(false);
    });

    it('should return correct permissions for HUMAN_OPERATOR', () => {
      expect(validator.canPerformAction('RESOLVE', 'SEV2', 'HUMAN_OPERATOR')).toBe(true);
      expect(validator.canPerformAction('RESOLVE', 'SEV1', 'HUMAN_OPERATOR')).toBe(false);
    });

    it('should return correct permissions for ON_CALL_SRE', () => {
      expect(validator.canPerformAction('RESOLVE', 'SEV1', 'ON_CALL_SRE')).toBe(true);
      expect(validator.canPerformAction('CLOSE', 'SEV1', 'ON_CALL_SRE')).toBe(true);
    });
  });

  describe('INV-8.4: Fail-closed on authz failure', () => {
    it('should provide reason for rejection', () => {
      const authority: AuthorityContext = {
        authorityType: 'AUTO_ENGINE',
        authorityId: 'engine-001',
      };
      const incident = createMockIncident('SEV2');
      const result = validator.validateAuthority('RESOLVE', incident, authority);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.reason).toContain('AUTO_ENGINE');
    });

    it('should provide details for rejection', () => {
      const authority: AuthorityContext = {
        authorityType: 'HUMAN_OPERATOR',
        authorityId: 'user-123',
      };
      const incident = createMockIncident('SEV1');
      const result = validator.validateAuthority('RESOLVE', incident, authority);
      
      expect(result.allowed).toBe(false);
      expect(result.details).toBeDefined();
      expect(result.details?.authorityType).toBe('HUMAN_OPERATOR');
      expect(result.details?.severity).toBe('SEV1');
    });
  });
});
