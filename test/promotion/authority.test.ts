/**
 * CP-6: Authority Tests
 */

import { describe, it, expect } from 'vitest';
import {
  AUTHORITY_TRUST_LEVELS,
  validateAuthorityContext,
  checkAuthorityPermission,
  getAuthorityDescription,
} from '../../src/promotion/authority.schema.js';

describe('CP-6: Authority', () => {
  describe('AUTHORITY_TRUST_LEVELS', () => {
    it('should define trust levels for all authority types', () => {
      expect(AUTHORITY_TRUST_LEVELS.AUTO_ENGINE).toBeDefined();
      expect(AUTHORITY_TRUST_LEVELS.HUMAN_OPERATOR).toBeDefined();
      expect(AUTHORITY_TRUST_LEVELS.ON_CALL_SRE).toBeDefined();
      expect(AUTHORITY_TRUST_LEVELS.EMERGENCY_OVERRIDE).toBeDefined();
    });

    it('should have correct severity limits', () => {
      expect(AUTHORITY_TRUST_LEVELS.AUTO_ENGINE.maxSeverity).toBe('SEV3');
      expect(AUTHORITY_TRUST_LEVELS.HUMAN_OPERATOR.maxSeverity).toBe('SEV2');
      expect(AUTHORITY_TRUST_LEVELS.ON_CALL_SRE.maxSeverity).toBe('SEV1');
      expect(AUTHORITY_TRUST_LEVELS.EMERGENCY_OVERRIDE.maxSeverity).toBe('SEV1');
    });

    it('should require justification only for EMERGENCY_OVERRIDE', () => {
      expect(AUTHORITY_TRUST_LEVELS.AUTO_ENGINE.requiresJustification).toBe(false);
      expect(AUTHORITY_TRUST_LEVELS.HUMAN_OPERATOR.requiresJustification).toBe(false);
      expect(AUTHORITY_TRUST_LEVELS.ON_CALL_SRE.requiresJustification).toBe(false);
      expect(AUTHORITY_TRUST_LEVELS.EMERGENCY_OVERRIDE.requiresJustification).toBe(true);
    });
  });

  describe('validateAuthorityContext', () => {
    const validContext = {
      authorityType: 'HUMAN_OPERATOR' as const,
      authorityId: 'user:jane@example.com',
      timestamp: '2026-01-16T10:30:00.000Z',
    };

    it('should accept valid authority context', () => {
      const result = validateAuthorityContext(validContext);
      expect(result.valid).toBe(true);
      expect(result.context).toEqual(validContext);
    });

    it('should reject invalid authority type', () => {
      const context = { ...validContext, authorityType: 'INVALID' };
      const result = validateAuthorityContext(context);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid authority context');
    });

    it('should reject missing authority ID', () => {
      const context = { ...validContext, authorityId: undefined };
      const result = validateAuthorityContext(context);
      expect(result.valid).toBe(false);
    });

    it('should require justification for EMERGENCY_OVERRIDE', () => {
      const context = {
        ...validContext,
        authorityType: 'EMERGENCY_OVERRIDE' as const,
      };
      const result = validateAuthorityContext(context);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('requires justification');
    });

    it('should accept EMERGENCY_OVERRIDE with justification', () => {
      const context = {
        ...validContext,
        authorityType: 'EMERGENCY_OVERRIDE' as const,
        justification: 'Critical production outage affecting all customers',
      };
      const result = validateAuthorityContext(context);
      expect(result.valid).toBe(true);
    });

    it('should accept optional sessionId', () => {
      const context = { ...validContext, sessionId: 'session-123' };
      const result = validateAuthorityContext(context);
      expect(result.valid).toBe(true);
      expect(result.context?.sessionId).toBe('session-123');
    });
  });

  describe('checkAuthorityPermission', () => {
    it('should allow AUTO_ENGINE for SEV3', () => {
      const result = checkAuthorityPermission('AUTO_ENGINE', 'SEV3');
      expect(result.allowed).toBe(true);
    });

    it('should allow AUTO_ENGINE for SEV4', () => {
      const result = checkAuthorityPermission('AUTO_ENGINE', 'SEV4');
      expect(result.allowed).toBe(true);
    });

    it('should reject AUTO_ENGINE for SEV2', () => {
      const result = checkAuthorityPermission('AUTO_ENGINE', 'SEV2');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('cannot promote SEV2');
    });

    it('should reject AUTO_ENGINE for SEV1', () => {
      const result = checkAuthorityPermission('AUTO_ENGINE', 'SEV1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('cannot promote SEV1');
    });

    it('should allow HUMAN_OPERATOR for SEV2', () => {
      const result = checkAuthorityPermission('HUMAN_OPERATOR', 'SEV2');
      expect(result.allowed).toBe(true);
    });

    it('should reject HUMAN_OPERATOR for SEV1', () => {
      const result = checkAuthorityPermission('HUMAN_OPERATOR', 'SEV1');
      expect(result.allowed).toBe(false);
    });

    it('should allow ON_CALL_SRE for SEV1', () => {
      const result = checkAuthorityPermission('ON_CALL_SRE', 'SEV1');
      expect(result.allowed).toBe(true);
    });

    it('should allow EMERGENCY_OVERRIDE for SEV1', () => {
      const result = checkAuthorityPermission('EMERGENCY_OVERRIDE', 'SEV1');
      expect(result.allowed).toBe(true);
    });
  });

  describe('getAuthorityDescription', () => {
    it('should return descriptions for all authority types', () => {
      expect(getAuthorityDescription('AUTO_ENGINE')).toContain('automatic');
      expect(getAuthorityDescription('HUMAN_OPERATOR')).toContain('operator');
      expect(getAuthorityDescription('ON_CALL_SRE')).toContain('On-call');
      expect(getAuthorityDescription('EMERGENCY_OVERRIDE')).toContain('Emergency');
    });
  });
});