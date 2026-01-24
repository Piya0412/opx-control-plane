/**
 * CP-8: Incident Controller
 * 
 * Thin, stateless control surface for incident operations.
 * 
 * 🔒 INV-8.1: Never mutates incident state directly
 * 🔒 INV-8.2: All mutations go through CP-7
 * 🔒 INV-8.7: Controller is stateless
 */

import { randomUUID } from 'crypto';
import type { IncidentManager } from '../incident/incident-manager';
import type { Incident, ResolutionMetadata } from '../incident/incident.schema';
import { RequestValidator, type AuthorityContext, type IncidentAction, type ListIncidentsFilters } from './request-validator';
import { AuthorityValidator } from './authority-validator';
import { RateLimiter } from './rate-limiter';
import { ResponseBuilder, type ControllerResponse } from './response-builder';

export interface IncidentControllerConfig {
  incidentManager: IncidentManager;
  rateLimiterTableName: string;
}

export class IncidentController {
  private readonly incidentManager: IncidentManager;
  private readonly requestValidator: RequestValidator;
  private readonly authorityValidator: AuthorityValidator;
  private readonly rateLimiter: RateLimiter;
  private readonly responseBuilder: ResponseBuilder;

  constructor(config: IncidentControllerConfig) {
    this.incidentManager = config.incidentManager;
    this.requestValidator = new RequestValidator();
    this.authorityValidator = new AuthorityValidator();
    this.rateLimiter = new RateLimiter({ tableName: config.rateLimiterTableName });
    this.responseBuilder = new ResponseBuilder();
  }

  /**
   * Open incident (PENDING → OPEN)
   * 
   * 🔒 INV-8.1: Never mutates state directly
   * 🔒 INV-8.2: All mutations go through CP-7
   */
  async openIncident(
    incidentId: string,
    body: unknown,
    authority: AuthorityContext
  ): Promise<ControllerResponse<Incident>> {
    const requestId = randomUUID();
    const currentTime = new Date().toISOString();

    try {
      // Step 1: Validate request schema first (cheap, no I/O)
      const requestValidation = this.requestValidator.validateOpenRequest(body, authority);
      if (!requestValidation.valid) {
        return this.responseBuilder.error(
          400,
          requestValidation.error!.code,
          requestValidation.error!.message,
          requestId,
          requestValidation.error!.details
        );
      }

      const idValidation = this.requestValidator.validateIncidentId(incidentId);
      if (!idValidation.valid) {
        return this.responseBuilder.error(
          400,
          idValidation.error!.code,
          idValidation.error!.message,
          requestId,
          idValidation.error!.details
        );
      }

      // Step 2: Load incident (via CP-7)
      const incident = await this.incidentManager.getIncident(incidentId);
      if (!incident) {
        return this.responseBuilder.error(404, 'NOT_FOUND', 'Incident not found', requestId);
      }

      // Step 3: Validate authority
      const authValidation = this.authorityValidator.validateAuthority(
        'OPEN',
        incident,
        authority
      );

      if (!authValidation.allowed) {
        return this.responseBuilder.error(
          403,
          'UNAUTHORIZED',
          authValidation.reason!,
          requestId,
          authValidation.details
        );
      }

      // Step 4: Check rate limits (after validation passes)
      const rateLimitResult = await this.rateLimiter.checkAuthorityLimit(
        authority.authorityId,
        authority.authorityType,
        'OPEN'
      );

      if (!rateLimitResult.allowed) {
        return this.responseBuilder.rateLimitExceeded(
          rateLimitResult.retryAfter!,
          requestId
        );
      }

      // Step 5: Call CP-7 method
      const updatedIncident = await this.incidentManager.openIncident(
        incidentId,
        authority,
        currentTime
      );

      // Step 6: Record action
      await this.rateLimiter.recordAction(authority.authorityId, 'OPEN');

      // Step 7: Build response
      return this.responseBuilder.success(updatedIncident, requestId);
    } catch (error) {
      // Translate CP-7 errors to HTTP-safe responses
      return this.responseBuilder.translateCP7Error(error as Error, requestId);
    }
  }

  /**
   * Start mitigation (OPEN → MITIGATING)
   */
  async startMitigation(
    incidentId: string,
    body: unknown,
    authority: AuthorityContext
  ): Promise<ControllerResponse<Incident>> {
    const requestId = randomUUID();
    const currentTime = new Date().toISOString();

    try {
      // Step 1: Validate request schema first
      const requestValidation = this.requestValidator.validateMitigateRequest(body, authority);
      if (!requestValidation.valid) {
        return this.responseBuilder.error(
          400,
          requestValidation.error!.code,
          requestValidation.error!.message,
          requestId,
          requestValidation.error!.details
        );
      }

      const idValidation = this.requestValidator.validateIncidentId(incidentId);
      if (!idValidation.valid) {
        return this.responseBuilder.error(
          400,
          idValidation.error!.code,
          idValidation.error!.message,
          requestId,
          idValidation.error!.details
        );
      }

      // Step 2: Load incident (via CP-7)
      const incident = await this.incidentManager.getIncident(incidentId);
      if (!incident) {
        return this.responseBuilder.error(404, 'NOT_FOUND', 'Incident not found', requestId);
      }

      // Step 3: Validate authority
      const authValidation = this.authorityValidator.validateAuthority(
        'MITIGATE',
        incident,
        authority
      );

      if (!authValidation.allowed) {
        return this.responseBuilder.error(
          403,
          'UNAUTHORIZED',
          authValidation.reason!,
          requestId,
          authValidation.details
        );
      }

      // Step 4: Check rate limits
      const rateLimitResult = await this.rateLimiter.checkAuthorityLimit(
        authority.authorityId,
        authority.authorityType,
        'MITIGATE'
      );

      if (!rateLimitResult.allowed) {
        return this.responseBuilder.rateLimitExceeded(
          rateLimitResult.retryAfter!,
          requestId
        );
      }

      // Step 5: Call CP-7 method
      const updatedIncident = await this.incidentManager.startMitigation(
        incidentId,
        authority,
        currentTime
      );

      // Step 6: Record action
      await this.rateLimiter.recordAction(authority.authorityId, 'MITIGATE');

      // Step 7: Build response
      return this.responseBuilder.success(updatedIncident, requestId);
    } catch (error) {
      return this.responseBuilder.translateCP7Error(error as Error, requestId);
    }
  }

  /**
   * Resolve incident (OPEN/MITIGATING → RESOLVED)
   */
  async resolveIncident(
    incidentId: string,
    body: unknown,
    authority: AuthorityContext
  ): Promise<ControllerResponse<Incident>> {
    const requestId = randomUUID();
    const currentTime = new Date().toISOString();

    try {
      // Step 1: Validate request schema first
      const requestValidation = this.requestValidator.validateResolveRequest(body, authority);
      if (!requestValidation.valid) {
        return this.responseBuilder.error(
          400,
          requestValidation.error!.code,
          requestValidation.error!.message,
          requestId,
          requestValidation.error!.details
        );
      }

      const idValidation = this.requestValidator.validateIncidentId(incidentId);
      if (!idValidation.valid) {
        return this.responseBuilder.error(
          400,
          idValidation.error!.code,
          idValidation.error!.message,
          requestId,
          idValidation.error!.details
        );
      }

      // Extract resolution metadata
      const { resolutionSummary, resolutionType } = body as {
        resolutionSummary: string;
        resolutionType: 'FIXED' | 'FALSE_POSITIVE' | 'DUPLICATE' | 'WONT_FIX';
      };

      const resolution: ResolutionMetadata = {
        resolutionSummary,
        resolutionType,
        resolvedBy: authority.authorityId,
      };

      // Step 2: Load incident (via CP-7)
      const incident = await this.incidentManager.getIncident(incidentId);
      if (!incident) {
        return this.responseBuilder.error(404, 'NOT_FOUND', 'Incident not found', requestId);
      }

      // Step 3: Validate authority
      const authValidation = this.authorityValidator.validateAuthority(
        'RESOLVE',
        incident,
        authority
      );

      if (!authValidation.allowed) {
        return this.responseBuilder.error(
          403,
          'UNAUTHORIZED',
          authValidation.reason!,
          requestId,
          authValidation.details
        );
      }

      // Step 4: Check rate limits
      const rateLimitResult = await this.rateLimiter.checkAuthorityLimit(
        authority.authorityId,
        authority.authorityType,
        'RESOLVE'
      );

      if (!rateLimitResult.allowed) {
        return this.responseBuilder.rateLimitExceeded(
          rateLimitResult.retryAfter!,
          requestId
        );
      }

      // Step 5: Call CP-7 method
      const updatedIncident = await this.incidentManager.resolveIncident(
        incidentId,
        resolution,
        authority,
        currentTime
      );

      // Step 6: Record action
      await this.rateLimiter.recordAction(authority.authorityId, 'RESOLVE');

      // Step 7: Build response
      return this.responseBuilder.success(updatedIncident, requestId);
    } catch (error) {
      return this.responseBuilder.translateCP7Error(error as Error, requestId);
    }
  }

  /**
   * Close incident (RESOLVED → CLOSED)
   */
  async closeIncident(
    incidentId: string,
    body: unknown,
    authority: AuthorityContext
  ): Promise<ControllerResponse<Incident>> {
    const requestId = randomUUID();
    const currentTime = new Date().toISOString();

    try {
      // Step 1: Validate request schema first
      const requestValidation = this.requestValidator.validateCloseRequest(body, authority);
      if (!requestValidation.valid) {
        return this.responseBuilder.error(
          400,
          requestValidation.error!.code,
          requestValidation.error!.message,
          requestId,
          requestValidation.error!.details
        );
      }

      const idValidation = this.requestValidator.validateIncidentId(incidentId);
      if (!idValidation.valid) {
        return this.responseBuilder.error(
          400,
          idValidation.error!.code,
          idValidation.error!.message,
          requestId,
          idValidation.error!.details
        );
      }

      // Step 2: Load incident (via CP-7)
      const incident = await this.incidentManager.getIncident(incidentId);
      if (!incident) {
        return this.responseBuilder.error(404, 'NOT_FOUND', 'Incident not found', requestId);
      }

      // Step 3: Validate authority
      const authValidation = this.authorityValidator.validateAuthority(
        'CLOSE',
        incident,
        authority
      );

      if (!authValidation.allowed) {
        return this.responseBuilder.error(
          403,
          'UNAUTHORIZED',
          authValidation.reason!,
          requestId,
          authValidation.details
        );
      }

      // Step 4: Check rate limits
      const rateLimitResult = await this.rateLimiter.checkAuthorityLimit(
        authority.authorityId,
        authority.authorityType,
        'CLOSE'
      );

      if (!rateLimitResult.allowed) {
        return this.responseBuilder.rateLimitExceeded(
          rateLimitResult.retryAfter!,
          requestId
        );
      }

      // Step 5: Call CP-7 method
      const updatedIncident = await this.incidentManager.closeIncident(
        incidentId,
        authority,
        currentTime
      );

      // Step 6: Record action
      await this.rateLimiter.recordAction(authority.authorityId, 'CLOSE');

      // Step 7: Build response
      return this.responseBuilder.success(updatedIncident, requestId);
    } catch (error) {
      return this.responseBuilder.translateCP7Error(error as Error, requestId);
    }
  }

  /**
   * Get incident by ID
   */
  async getIncident(
    incidentId: string,
    authority: AuthorityContext
  ): Promise<ControllerResponse<Incident>> {
    const requestId = randomUUID();

    try {
      // Step 1: Validate request
      const idValidation = this.requestValidator.validateIncidentId(incidentId);
      if (!idValidation.valid) {
        return this.responseBuilder.error(
          400,
          idValidation.error!.code,
          idValidation.error!.message,
          requestId,
          idValidation.error!.details
        );
      }

      // Step 2: Load incident (via CP-7)
      const incident = await this.incidentManager.getIncident(incidentId);
      if (!incident) {
        return this.responseBuilder.error(404, 'NOT_FOUND', 'Incident not found', requestId);
      }

      // Step 3: Check rate limits
      const rateLimitResult = await this.rateLimiter.checkAuthorityLimit(
        authority.authorityId,
        authority.authorityType,
        'READ'
      );

      if (!rateLimitResult.allowed) {
        return this.responseBuilder.rateLimitExceeded(
          rateLimitResult.retryAfter!,
          requestId
        );
      }

      // Step 4: Record action
      await this.rateLimiter.recordAction(authority.authorityId, 'READ');

      // Step 5: Build response
      return this.responseBuilder.success(incident, requestId);
    } catch (error) {
      return this.responseBuilder.translateCP7Error(error as Error, requestId);
    }
  }

  /**
   * List incidents with filters
   */
  async listIncidents(
    filters: unknown,
    authority: AuthorityContext
  ): Promise<ControllerResponse<Incident[]>> {
    const requestId = randomUUID();

    try {
      // Step 1: Validate filters
      const filterValidation = this.requestValidator.validateListFilters(filters);
      if (!filterValidation.valid) {
        return this.responseBuilder.error(
          400,
          filterValidation.error!.code,
          filterValidation.error!.message,
          requestId,
          filterValidation.error!.details
        );
      }

      // Step 2: Check rate limits
      const rateLimitResult = await this.rateLimiter.checkAuthorityLimit(
        authority.authorityId,
        authority.authorityType,
        'READ'
      );

      if (!rateLimitResult.allowed) {
        return this.responseBuilder.rateLimitExceeded(
          rateLimitResult.retryAfter!,
          requestId
        );
      }

      // Step 3: Call CP-7 method
      const parsedFilters = filters as ListIncidentsFilters;
      let incidents: Incident[];

      if (parsedFilters.status) {
        incidents = await this.incidentManager.getIncident(parsedFilters.status) as any;
      } else {
        incidents = await this.incidentManager.listActiveIncidents(parsedFilters.limit);
      }

      // Step 4: Record action
      await this.rateLimiter.recordAction(authority.authorityId, 'READ');

      // Step 5: Build response
      return this.responseBuilder.success(incidents, requestId);
    } catch (error) {
      return this.responseBuilder.translateCP7Error(error as Error, requestId);
    }
  }
}
