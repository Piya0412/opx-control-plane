/**
 * CP-8: Authority Validator
 * 
 * Validates authority permissions against action and severity.
 * 
 * 🔒 INV-8.3: Authority is explicit and validated
 * 🔒 INV-8.4: Fail-closed on authz failure
 */

import type { AuthorityContext, IncidentAction } from './request-validator';
import type { Incident, Severity } from '../incident/incident.schema';

// Severity constraint types
type SeverityConstraint = 'ALL' | 'SEV2_TO_SEV4' | 'NONE';

// Authority matrix (FROZEN)
const AUTHORITY_MATRIX: Record<
  AuthorityContext['authorityType'],
  Record<IncidentAction, SeverityConstraint>
> = {
  AUTO_ENGINE: {
    OPEN: 'ALL',
    MITIGATE: 'NONE',
    RESOLVE: 'NONE',
    CLOSE: 'NONE',
    READ: 'ALL',
  },
  HUMAN_OPERATOR: {
    OPEN: 'ALL',
    MITIGATE: 'ALL',
    RESOLVE: 'SEV2_TO_SEV4',
    CLOSE: 'ALL',
    READ: 'ALL',
  },
  ON_CALL_SRE: {
    OPEN: 'ALL',
    MITIGATE: 'ALL',
    RESOLVE: 'ALL',
    CLOSE: 'ALL',
    READ: 'ALL',
  },
  EMERGENCY_OVERRIDE: {
    OPEN: 'ALL',
    MITIGATE: 'ALL',
    RESOLVE: 'ALL',
    CLOSE: 'ALL',
    READ: 'ALL',
  },
};

export interface AuthorityValidationResult {
  allowed: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

export class AuthorityValidator {
  /**
   * Validate authority for action on incident
   * 
   * 🔒 INV-8.3: Authority is explicit and validated
   * 🔒 INV-8.4: Fail-closed on authz failure
   */
  validateAuthority(
    action: IncidentAction,
    incident: Incident,
    authority: AuthorityContext
  ): AuthorityValidationResult {
    // Check if action is allowed for authority type
    const constraint = AUTHORITY_MATRIX[authority.authorityType][action];

    if (constraint === 'NONE') {
      return {
        allowed: false,
        reason: `Authority type ${authority.authorityType} cannot perform ${action}`,
        details: {
          authorityType: authority.authorityType,
          action,
          requiredAuthority: this.getRequiredAuthority(action, incident.severity),
        },
      };
    }

    if (constraint === 'SEV2_TO_SEV4' && incident.severity === 'SEV1') {
      return {
        allowed: false,
        reason: `Authority type ${authority.authorityType} cannot ${action} SEV1 incidents`,
        details: {
          authorityType: authority.authorityType,
          action,
          severity: incident.severity,
          requiredAuthority: 'ON_CALL_SRE',
        },
      };
    }

    return { allowed: true };
  }

  /**
   * Check if authority can perform action on severity
   */
  canPerformAction(
    action: IncidentAction,
    severity: Severity,
    authorityType: AuthorityContext['authorityType']
  ): boolean {
    const constraint = AUTHORITY_MATRIX[authorityType][action];

    if (constraint === 'NONE') {
      return false;
    }

    if (constraint === 'SEV2_TO_SEV4' && severity === 'SEV1') {
      return false;
    }

    return true;
  }

  /**
   * Get required authority for action on severity
   */
  private getRequiredAuthority(
    action: IncidentAction,
    severity: Severity
  ): string {
    // Find minimum authority that can perform action
    const authorities: AuthorityContext['authorityType'][] = [
      'AUTO_ENGINE',
      'HUMAN_OPERATOR',
      'ON_CALL_SRE',
      'EMERGENCY_OVERRIDE',
    ];

    for (const auth of authorities) {
      if (this.canPerformAction(action, severity, auth)) {
        return auth;
      }
    }

    return 'EMERGENCY_OVERRIDE';
  }
}
