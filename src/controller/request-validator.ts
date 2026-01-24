/**
 * CP-8: Request Validator
 * 
 * Validates incoming requests against strict schemas.
 * 
 * 🔒 CORRECTION 2: EMERGENCY_OVERRIDE requires justification
 */

import { z } from 'zod';

// Incident action types
export const IncidentActionSchema = z.enum([
  'OPEN',
  'MITIGATE',
  'RESOLVE',
  'CLOSE',
  'READ',
]);

export type IncidentAction = z.infer<typeof IncidentActionSchema>;

// Authority context (from headers/auth)
export const AuthorityContextSchema = z.object({
  authorityType: z.enum(['AUTO_ENGINE', 'HUMAN_OPERATOR', 'ON_CALL_SRE', 'EMERGENCY_OVERRIDE']),
  authorityId: z.string().min(1),
  sessionId: z.string().optional(),
});

export type AuthorityContext = z.infer<typeof AuthorityContextSchema>;

// Base mutation request (all mutations may have justification)
const BaseMutationRequestSchema = z.object({
  justification: z.string().min(20).max(2048).optional(),
}).passthrough(); // Allow additional fields, ignore unknown

// Open incident request
export const OpenIncidentRequestSchema = BaseMutationRequestSchema;
export type OpenIncidentRequest = z.infer<typeof OpenIncidentRequestSchema>;

// Start mitigation request
export const StartMitigationRequestSchema = BaseMutationRequestSchema;
export type StartMitigationRequest = z.infer<typeof StartMitigationRequestSchema>;

// Resolve incident request
export const ResolveIncidentRequestSchema = BaseMutationRequestSchema.extend({
  resolutionSummary: z.string().min(20).max(2048),
  resolutionType: z.enum(['FIXED', 'FALSE_POSITIVE', 'DUPLICATE', 'WONT_FIX']),
});
export type ResolveIncidentRequest = z.infer<typeof ResolveIncidentRequestSchema>;

// Close incident request
export const CloseIncidentRequestSchema = BaseMutationRequestSchema;
export type CloseIncidentRequest = z.infer<typeof CloseIncidentRequestSchema>;

// List incidents filters
export const ListIncidentsFiltersSchema = z.object({
  status: z.enum(['PENDING', 'OPEN', 'MITIGATING', 'RESOLVED', 'CLOSED']).optional(),
  service: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
});
export type ListIncidentsFilters = z.infer<typeof ListIncidentsFiltersSchema>;

// Validation result
export interface ValidationResult {
  valid: boolean;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export class RequestValidator {
  /**
   * Validate incident ID format
   */
  validateIncidentId(incidentId: string): ValidationResult {
    if (!incidentId || incidentId.length !== 64) {
      return {
        valid: false,
        error: {
          code: 'INVALID_INCIDENT_ID',
          message: 'Incident ID must be 64 characters',
          details: { incidentId },
        },
      };
    }

    if (!/^[0-9a-f]{64}$/.test(incidentId)) {
      return {
        valid: false,
        error: {
          code: 'INVALID_INCIDENT_ID',
          message: 'Incident ID must be hexadecimal',
          details: { incidentId },
        },
      };
    }

    return { valid: true };
  }

  /**
   * Validate authority context
   */
  validateAuthority(authority: unknown): ValidationResult {
    const result = AuthorityContextSchema.safeParse(authority);
    
    if (!result.success) {
      return {
        valid: false,
        error: {
          code: 'INVALID_AUTHORITY',
          message: 'Invalid authority context',
          details: { errors: result.error.errors },
        },
      };
    }

    return { valid: true };
  }

  /**
   * Validate EMERGENCY_OVERRIDE justification requirement
   * 
   * 🔒 CORRECTION 2: EMERGENCY_OVERRIDE requires justification
   */
  validateEmergencyOverrideJustification(
    authority: AuthorityContext,
    request: { justification?: string }
  ): ValidationResult {
    if (authority.authorityType === 'EMERGENCY_OVERRIDE') {
      if (!request.justification) {
        return {
          valid: false,
          error: {
            code: 'MISSING_JUSTIFICATION',
            message: 'EMERGENCY_OVERRIDE requires justification field',
            details: { authorityType: authority.authorityType },
          },
        };
      }

      if (request.justification.length < 20 || request.justification.length > 2048) {
        return {
          valid: false,
          error: {
            code: 'INVALID_JUSTIFICATION',
            message: 'Justification must be between 20 and 2048 characters',
            details: { length: request.justification.length },
          },
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validate open incident request
   */
  validateOpenRequest(
    body: unknown,
    authority: AuthorityContext
  ): ValidationResult {
    const result = OpenIncidentRequestSchema.safeParse(body);
    
    if (!result.success) {
      return {
        valid: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid open incident request',
          details: { errors: result.error.errors },
        },
      };
    }

    return this.validateEmergencyOverrideJustification(authority, result.data);
  }

  /**
   * Validate start mitigation request
   */
  validateMitigateRequest(
    body: unknown,
    authority: AuthorityContext
  ): ValidationResult {
    const result = StartMitigationRequestSchema.safeParse(body);
    
    if (!result.success) {
      return {
        valid: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid start mitigation request',
          details: { errors: result.error.errors },
        },
      };
    }

    return this.validateEmergencyOverrideJustification(authority, result.data);
  }

  /**
   * Validate resolve incident request
   */
  validateResolveRequest(
    body: unknown,
    authority: AuthorityContext
  ): ValidationResult {
    const result = ResolveIncidentRequestSchema.safeParse(body);
    
    if (!result.success) {
      return {
        valid: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid resolve incident request',
          details: { errors: result.error.errors },
        },
      };
    }

    return this.validateEmergencyOverrideJustification(authority, result.data);
  }

  /**
   * Validate close incident request
   */
  validateCloseRequest(
    body: unknown,
    authority: AuthorityContext
  ): ValidationResult {
    const result = CloseIncidentRequestSchema.safeParse(body);
    
    if (!result.success) {
      return {
        valid: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid close incident request',
          details: { errors: result.error.errors },
        },
      };
    }

    return this.validateEmergencyOverrideJustification(authority, result.data);
  }

  /**
   * Validate list incidents filters
   */
  validateListFilters(filters: unknown): ValidationResult {
    const result = ListIncidentsFiltersSchema.safeParse(filters);
    
    if (!result.success) {
      return {
        valid: false,
        error: {
          code: 'INVALID_FILTERS',
          message: 'Invalid list filters',
          details: { errors: result.error.errors },
        },
      };
    }

    return { valid: true };
  }
}
