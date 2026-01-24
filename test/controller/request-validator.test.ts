/**
 * CP-8: Request Validator Tests
 * 
 * 🔒 CORRECTION 2: EMERGENCY_OVERRIDE requires justification
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RequestValidator, type AuthorityContext } from '../../src/controller/request-validator.js';

describe('CP-8: Request Validator', () => {
  let validator: RequestValidator;

  beforeEach(() => {
    validator = new RequestValidator();
  });

  describe('validateIncidentId', () => {
    it('should accept valid 64-character hex incident ID', () => {
      const result = validator.validateIncidentId('a'.repeat(64));
      expect(result.valid).toBe(true);
    });

    it('should reject incident ID with invalid length', () => {
      const result = validator.validateIncidentId('too-short');
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_INCIDENT_ID');
    });

    it('should reject non-hex incident ID', () => {
      const result = validator.validateIncidentId('z'.repeat(64));
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_INCIDENT_ID');
    });

    it('should reject empty incident ID', () => {
      const result = validator.validateIncidentId('');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateAuthority', () => {
    it('should accept valid authority context', () => {
      const authority: AuthorityContext = {
        authorityType: 'HUMAN_OPERATOR',
        authorityId: 'user-123',
      };
      const result = validator.validateAuthority(authority);
      expect(result.valid).toBe(true);
    });

    it('should reject authority without authorityType', () => {
      const authority = { authorityId: 'user-123' };
      const result = validator.validateAuthority(authority);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_AUTHORITY');
    });

    it('should reject authority without authorityId', () => {
      const authority = { authorityType: 'HUMAN_OPERATOR' };
      const result = validator.validateAuthority(authority);
      expect(result.valid).toBe(false);
    });

    it('should reject invalid authority type', () => {
      const authority = { authorityType: 'INVALID', authorityId: 'user-123' };
      const result = validator.validateAuthority(authority);
      expect(result.valid).toBe(false);
    });
  });

  describe('CORRECTION 2: EMERGENCY_OVERRIDE justification', () => {
    const emergencyAuthority: AuthorityContext = {
      authorityType: 'EMERGENCY_OVERRIDE',
      authorityId: 'admin-001',
    };

    const normalAuthority: AuthorityContext = {
      authorityType: 'HUMAN_OPERATOR',
      authorityId: 'user-123',
    };

    it('should require justification for EMERGENCY_OVERRIDE', () => {
      const request = {};
      const result = validator.validateEmergencyOverrideJustification(emergencyAuthority, request);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('MISSING_JUSTIFICATION');
    });

    it('should accept justification for EMERGENCY_OVERRIDE', () => {
      const request = { justification: 'Critical production issue requiring immediate action' };
      const result = validator.validateEmergencyOverrideJustification(emergencyAuthority, request);
      expect(result.valid).toBe(true);
    });

    it('should reject justification shorter than 20 characters', () => {
      const request = { justification: 'Too short' };
      const result = validator.validateEmergencyOverrideJustification(emergencyAuthority, request);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_JUSTIFICATION');
    });

    it('should reject justification longer than 2048 characters', () => {
      const request = { justification: 'a'.repeat(2049) };
      const result = validator.validateEmergencyOverrideJustification(emergencyAuthority, request);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_JUSTIFICATION');
    });

    it('should not require justification for non-EMERGENCY_OVERRIDE', () => {
      const request = {};
      const result = validator.validateEmergencyOverrideJustification(normalAuthority, request);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateOpenRequest', () => {
    const authority: AuthorityContext = {
      authorityType: 'HUMAN_OPERATOR',
      authorityId: 'user-123',
    };

    it('should accept empty body for non-EMERGENCY_OVERRIDE', () => {
      const result = validator.validateOpenRequest({}, authority);
      expect(result.valid).toBe(true);
    });

    it('should require justification for EMERGENCY_OVERRIDE', () => {
      const emergencyAuth: AuthorityContext = {
        authorityType: 'EMERGENCY_OVERRIDE',
        authorityId: 'admin-001',
      };
      const result = validator.validateOpenRequest({}, emergencyAuth);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('MISSING_JUSTIFICATION');
    });
  });

  describe('validateResolveRequest', () => {
    const authority: AuthorityContext = {
      authorityType: 'HUMAN_OPERATOR',
      authorityId: 'user-123',
    };

    it('should accept valid resolve request', () => {
      const body = {
        resolutionSummary: 'Fixed by deploying patch version 1.2.3',
        resolutionType: 'FIXED',
      };
      const result = validator.validateResolveRequest(body, authority);
      expect(result.valid).toBe(true);
    });

    it('should reject resolve request without resolutionSummary', () => {
      const body = { resolutionType: 'FIXED' };
      const result = validator.validateResolveRequest(body, authority);
      expect(result.valid).toBe(false);
    });

    it('should reject resolve request without resolutionType', () => {
      const body = { resolutionSummary: 'Fixed by deploying patch' };
      const result = validator.validateResolveRequest(body, authority);
      expect(result.valid).toBe(false);
    });

    it('should reject resolutionSummary shorter than 20 characters', () => {
      const body = {
        resolutionSummary: 'Too short',
        resolutionType: 'FIXED',
      };
      const result = validator.validateResolveRequest(body, authority);
      expect(result.valid).toBe(false);
    });

    it('should accept all resolution types', () => {
      const types = ['FIXED', 'FALSE_POSITIVE', 'DUPLICATE', 'WONT_FIX'];
      
      for (const type of types) {
        const body = {
          resolutionSummary: 'Valid resolution summary with enough characters',
          resolutionType: type,
        };
        const result = validator.validateResolveRequest(body, authority);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('validateListFilters', () => {
    it('should accept empty filters', () => {
      const result = validator.validateListFilters({});
      expect(result.valid).toBe(true);
    });

    it('should accept valid status filter', () => {
      const result = validator.validateListFilters({ status: 'OPEN' });
      expect(result.valid).toBe(true);
    });

    it('should accept valid service filter', () => {
      const result = validator.validateListFilters({ service: 'lambda' });
      expect(result.valid).toBe(true);
    });

    it('should accept valid limit', () => {
      const result = validator.validateListFilters({ limit: 50 });
      expect(result.valid).toBe(true);
    });

    it('should reject limit exceeding 100', () => {
      const result = validator.validateListFilters({ limit: 101 });
      expect(result.valid).toBe(false);
    });

    it('should reject invalid status', () => {
      const result = validator.validateListFilters({ status: 'INVALID' });
      expect(result.valid).toBe(false);
    });
  });
});
