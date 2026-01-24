/**
 * CP-8: Incident Controller Tests
 * 
 * Tests controller orchestration with mocked CP-7.
 * 
 * 🔒 INV-8.1: Never mutates state directly
 * 🔒 INV-8.2: All mutations go through CP-7
 * 🔒 INV-8.7: Controller is stateless
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IncidentController } from '../../src/controller/incident-controller.js';
import type { IncidentManager } from '../../src/incident/incident-manager.js';
import type { Incident } from '../../src/incident/incident.schema.js';
import type { AuthorityContext } from '../../src/controller/request-validator.js';
import { RateLimiter } from '../../src/controller/rate-limiter.js';

// Mock the RateLimiter class
vi.mock('../../src/controller/rate-limiter.js', () => {
  return {
    RateLimiter: vi.fn().mockImplementation(() => ({
      checkAuthorityLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 100 }),
      recordAction: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

describe('CP-8: Incident Controller', () => {
  let controller: IncidentController;
  let mockIncidentManager: IncidentManager;

  const mockIncident: Incident = {
    incidentId: '0'.repeat(64), // Valid hex string
    decisionId: '1'.repeat(64), // Valid hex string
    candidateId: '2'.repeat(64), // Valid hex string
    severity: 'SEV2',
    service: 'lambda',
    title: 'Test Incident',
    status: 'PENDING',
    createdAt: '2026-01-17T10:00:00.000Z',
    detectionCount: 2,
    evidenceGraphCount: 1,
    blastRadiusScope: 'SINGLE_SERVICE',
    incidentVersion: 1,
  };

  const authority: AuthorityContext = {
    authorityType: 'HUMAN_OPERATOR',
    authorityId: 'user-123',
  };

  beforeEach(() => {
    mockIncidentManager = {
      getIncident: vi.fn(),
      openIncident: vi.fn(),
      startMitigation: vi.fn(),
      resolveIncident: vi.fn(),
      closeIncident: vi.fn(),
      listActiveIncidents: vi.fn(),
    } as any;

    controller = new IncidentController({
      incidentManager: mockIncidentManager,
      rateLimiterTableName: 'test-rate-limits',
    });
  });

  describe('INV-8.1 & INV-8.2: Only calls CP-7 methods', () => {
    it('should call incidentManager.openIncident for open action', async () => {
      vi.mocked(mockIncidentManager.getIncident).mockResolvedValue(mockIncident);
      vi.mocked(mockIncidentManager.openIncident).mockResolvedValue({
        ...mockIncident,
        status: 'OPEN',
      });

      await controller.openIncident(mockIncident.incidentId, {}, authority);

      expect(mockIncidentManager.openIncident).toHaveBeenCalledWith(
        mockIncident.incidentId,
        authority,
        expect.any(String)
      );
    });

    it('should call incidentManager.startMitigation for mitigate action', async () => {
      const openIncident = { ...mockIncident, status: 'OPEN' as const };
      vi.mocked(mockIncidentManager.getIncident).mockResolvedValue(openIncident);
      vi.mocked(mockIncidentManager.startMitigation).mockResolvedValue({
        ...openIncident,
        status: 'MITIGATING',
      });

      await controller.startMitigation(mockIncident.incidentId, {}, authority);

      expect(mockIncidentManager.startMitigation).toHaveBeenCalled();
    });

    it('should call incidentManager.resolveIncident for resolve action', async () => {
      const openIncident = { ...mockIncident, status: 'OPEN' as const };
      vi.mocked(mockIncidentManager.getIncident).mockResolvedValue(openIncident);
      vi.mocked(mockIncidentManager.resolveIncident).mockResolvedValue({
        ...openIncident,
        status: 'RESOLVED',
      });

      const body = {
        resolutionSummary: 'Fixed by deploying patch version 1.2.3',
        resolutionType: 'FIXED',
      };

      await controller.resolveIncident(mockIncident.incidentId, body, authority);

      expect(mockIncidentManager.resolveIncident).toHaveBeenCalled();
    });
  });

  describe('validation flow', () => {
    it('should reject invalid incident ID', async () => {
      const response = await controller.openIncident('invalid', {}, authority);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_INCIDENT_ID');
    });

    it('should reject missing incident', async () => {
      vi.mocked(mockIncidentManager.getIncident).mockResolvedValue(null);

      const response = await controller.openIncident(mockIncident.incidentId, {}, authority);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should reject unauthorized authority', async () => {
      const autoAuthority: AuthorityContext = {
        authorityType: 'AUTO_ENGINE',
        authorityId: 'engine-001',
      };

      vi.mocked(mockIncidentManager.getIncident).mockResolvedValue(mockIncident);

      const body = {
        resolutionSummary: 'Fixed by deploying patch version 1.2.3',
        resolutionType: 'FIXED',
      };

      const response = await controller.resolveIncident(
        mockIncident.incidentId,
        body,
        autoAuthority
      );

      expect(response.statusCode).toBe(403);
      const body2 = JSON.parse(response.body);
      expect(body2.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('CORRECTION 2: EMERGENCY_OVERRIDE justification', () => {
    const emergencyAuthority: AuthorityContext = {
      authorityType: 'EMERGENCY_OVERRIDE',
      authorityId: 'admin-001',
    };

    it('should reject EMERGENCY_OVERRIDE without justification', async () => {
      const response = await controller.openIncident(
        mockIncident.incidentId,
        {},
        emergencyAuthority
      );

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('MISSING_JUSTIFICATION');
    });

    it('should accept EMERGENCY_OVERRIDE with justification', async () => {
      vi.mocked(mockIncidentManager.getIncident).mockResolvedValue(mockIncident);
      vi.mocked(mockIncidentManager.openIncident).mockResolvedValue({
        ...mockIncident,
        status: 'OPEN',
      });

      const body = {
        justification: 'Critical production issue requiring immediate action',
      };

      const response = await controller.openIncident(
        mockIncident.incidentId,
        body,
        emergencyAuthority
      );

      expect(response.statusCode).toBe(200);
    });
  });

  describe('CORRECTION 3: Error translation', () => {
    it('should translate CP-7 errors to HTTP-safe responses', async () => {
      vi.mocked(mockIncidentManager.getIncident).mockResolvedValue(mockIncident);
      vi.mocked(mockIncidentManager.openIncident).mockRejectedValue(
        new Error('Illegal transition: PENDING → OPEN')
      );

      const response = await controller.openIncident(mockIncident.incidentId, {}, authority);

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('ILLEGAL_TRANSITION');
    });

    it('should not expose raw CP-7 error messages', async () => {
      vi.mocked(mockIncidentManager.getIncident).mockResolvedValue(mockIncident);
      vi.mocked(mockIncidentManager.openIncident).mockRejectedValue(
        new Error('DynamoDB ConditionalCheckFailedException on table incidents_prod')
      );

      const response = await controller.openIncident(mockIncident.incidentId, {}, authority);

      const body = JSON.parse(response.body);
      expect(body.error.message).not.toContain('DynamoDB');
      expect(body.error.message).not.toContain('incidents_prod');
    });
  });

  describe('INV-8.7: Controller is stateless', () => {
    it('should load incident from CP-7 every time', async () => {
      vi.mocked(mockIncidentManager.getIncident).mockResolvedValue(mockIncident);
      vi.mocked(mockIncidentManager.openIncident).mockResolvedValue({
        ...mockIncident,
        status: 'OPEN',
      });

      await controller.openIncident(mockIncident.incidentId, {}, authority);
      await controller.openIncident(mockIncident.incidentId, {}, authority);

      expect(mockIncidentManager.getIncident).toHaveBeenCalledTimes(2);
    });

    it('should not cache incident state', async () => {
      const incident1 = { ...mockIncident, incidentVersion: 1 };
      const incident2 = { ...mockIncident, incidentVersion: 2 };

      vi.mocked(mockIncidentManager.getIncident)
        .mockResolvedValueOnce(incident1)
        .mockResolvedValueOnce(incident2);

      await controller.getIncident(mockIncident.incidentId, authority);
      await controller.getIncident(mockIncident.incidentId, authority);

      expect(mockIncidentManager.getIncident).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolve incident', () => {
    it('should validate resolution metadata', async () => {
      const body = { resolutionType: 'FIXED' }; // Missing resolutionSummary

      const response = await controller.resolveIncident(
        mockIncident.incidentId,
        body,
        authority
      );

      expect(response.statusCode).toBe(400);
    });

    it('should pass resolution to CP-7', async () => {
      const openIncident = { ...mockIncident, status: 'OPEN' as const };
      vi.mocked(mockIncidentManager.getIncident).mockResolvedValue(openIncident);
      vi.mocked(mockIncidentManager.resolveIncident).mockResolvedValue({
        ...openIncident,
        status: 'RESOLVED',
      });

      const body = {
        resolutionSummary: 'Fixed by deploying patch version 1.2.3',
        resolutionType: 'FIXED',
      };

      await controller.resolveIncident(mockIncident.incidentId, body, authority);

      expect(mockIncidentManager.resolveIncident).toHaveBeenCalledWith(
        mockIncident.incidentId,
        expect.objectContaining({
          resolutionSummary: body.resolutionSummary,
          resolutionType: body.resolutionType,
          resolvedBy: authority.authorityId,
        }),
        authority,
        expect.any(String)
      );
    });
  });

  describe('getIncident', () => {
    it('should return incident from CP-7', async () => {
      vi.mocked(mockIncidentManager.getIncident).mockResolvedValue(mockIncident);

      const response = await controller.getIncident(mockIncident.incidentId, authority);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual(mockIncident);
    });

    it('should return 404 for missing incident', async () => {
      vi.mocked(mockIncidentManager.getIncident).mockResolvedValue(null);

      const response = await controller.getIncident(mockIncident.incidentId, authority);

      expect(response.statusCode).toBe(404);
    });
  });
});
