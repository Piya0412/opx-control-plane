/**
 * CP-7: Incident Schema Tests
 * 
 * Tests for incident entity schema validation.
 */

import { describe, it, expect } from 'vitest';
import {
  IncidentSchema,
  ResolutionMetadataSchema,
  type Incident,
  type ResolutionMetadata,
} from '../../src/incident/incident.schema.js';

describe('CP-7: Incident Schema Validation', () => {
  const createValidIncident = (overrides: Partial<Incident> = {}): Incident => ({
    incidentId: 'i'.repeat(64),
    decisionId: 'd'.repeat(64),
    candidateId: 'c'.repeat(64),
    severity: 'SEV2',
    service: 'lambda',
    title: 'Test Incident',
    status: 'PENDING',
    createdAt: '2026-01-17T10:00:00.000Z',
    detectionCount: 3,
    evidenceGraphCount: 2,
    blastRadiusScope: 'SINGLE_SERVICE',
    incidentVersion: 1,
    ...overrides,
  });

  describe('schema validation', () => {
    it('should accept valid incident', () => {
      const incident = createValidIncident();
      const result = IncidentSchema.safeParse(incident);
      expect(result.success).toBe(true);
    });

    it('should reject incident with invalid incidentId length', () => {
      const incident = createValidIncident({ incidentId: 'too-short' });
      const result = IncidentSchema.safeParse(incident);
      expect(result.success).toBe(false);
    });

    it('should reject incident with invalid decisionId length', () => {
      const incident = createValidIncident({ decisionId: 'too-short' });
      const result = IncidentSchema.safeParse(incident);
      expect(result.success).toBe(false);
    });

    it('should reject incident with invalid candidateId length', () => {
      const incident = createValidIncident({ candidateId: 'too-short' });
      const result = IncidentSchema.safeParse(incident);
      expect(result.success).toBe(false);
    });

    it('should reject incident with invalid severity', () => {
      const incident = { ...createValidIncident(), severity: 'SEV5' };
      const result = IncidentSchema.safeParse(incident);
      expect(result.success).toBe(false);
    });

    it('should reject incident with invalid status', () => {
      const incident = { ...createValidIncident(), status: 'INVALID' };
      const result = IncidentSchema.safeParse(incident);
      expect(result.success).toBe(false);
    });

    it('should reject incident with empty service', () => {
      const incident = createValidIncident({ service: '' });
      const result = IncidentSchema.safeParse(incident);
      expect(result.success).toBe(false);
    });

    it('should reject incident with empty title', () => {
      const incident = createValidIncident({ title: '' });
      const result = IncidentSchema.safeParse(incident);
      expect(result.success).toBe(false);
    });

    it('should reject incident with negative detectionCount', () => {
      const incident = createValidIncident({ detectionCount: -1 });
      const result = IncidentSchema.safeParse(incident);
      expect(result.success).toBe(false);
    });

    it('should reject incident with negative evidenceGraphCount', () => {
      const incident = createValidIncident({ evidenceGraphCount: -1 });
      const result = IncidentSchema.safeParse(incident);
      expect(result.success).toBe(false);
    });

    it('should reject incident with zero incidentVersion', () => {
      const incident = createValidIncident({ incidentVersion: 0 });
      const result = IncidentSchema.safeParse(incident);
      expect(result.success).toBe(false);
    });
  });

  describe('timeline fields', () => {
    it('should accept incident with all timeline fields', () => {
      const incident = createValidIncident({
        createdAt: '2026-01-17T10:00:00.000Z',
        openedAt: '2026-01-17T10:05:00.000Z',
        mitigatingAt: '2026-01-17T10:10:00.000Z',
        resolvedAt: '2026-01-17T10:30:00.000Z',
        closedAt: '2026-01-17T11:00:00.000Z',
      });
      const result = IncidentSchema.safeParse(incident);
      expect(result.success).toBe(true);
    });

    it('should accept incident with only createdAt', () => {
      const incident = createValidIncident({
        createdAt: '2026-01-17T10:00:00.000Z',
      });
      const result = IncidentSchema.safeParse(incident);
      expect(result.success).toBe(true);
    });

    it('should reject incident with invalid datetime format', () => {
      const incident = createValidIncident({ createdAt: 'not-a-datetime' });
      const result = IncidentSchema.safeParse(incident);
      expect(result.success).toBe(false);
    });
  });

  describe('resolution fields', () => {
    it('should accept incident with resolution fields', () => {
      const incident = createValidIncident({
        resolutionSummary: 'Fixed by deploying patch',
        resolutionType: 'FIXED',
        resolvedBy: 'user-123',
      });
      const result = IncidentSchema.safeParse(incident);
      expect(result.success).toBe(true);
    });

    it('should accept incident without resolution fields', () => {
      const incident = createValidIncident();
      const result = IncidentSchema.safeParse(incident);
      expect(result.success).toBe(true);
    });

    it('should reject incident with invalid resolutionType', () => {
      const incident = {
        ...createValidIncident(),
        resolutionType: 'INVALID',
      };
      const result = IncidentSchema.safeParse(incident);
      expect(result.success).toBe(false);
    });
  });

  describe('resolution metadata schema', () => {
    it('should accept valid resolution metadata', () => {
      const resolution: ResolutionMetadata = {
        resolutionSummary: 'Fixed by deploying patch',
        resolutionType: 'FIXED',
        resolvedBy: 'user-123',
      };
      const result = ResolutionMetadataSchema.safeParse(resolution);
      expect(result.success).toBe(true);
    });

    it('should reject resolution with empty summary', () => {
      const resolution = {
        resolutionSummary: '',
        resolutionType: 'FIXED',
        resolvedBy: 'user-123',
      };
      const result = ResolutionMetadataSchema.safeParse(resolution);
      expect(result.success).toBe(false);
    });

    it('should reject resolution with empty resolvedBy', () => {
      const resolution = {
        resolutionSummary: 'Fixed',
        resolutionType: 'FIXED',
        resolvedBy: '',
      };
      const result = ResolutionMetadataSchema.safeParse(resolution);
      expect(result.success).toBe(false);
    });

    it('should accept all resolution types', () => {
      const types = ['FIXED', 'FALSE_POSITIVE', 'DUPLICATE', 'WONT_FIX'];
      
      for (const type of types) {
        const resolution = {
          resolutionSummary: 'Test',
          resolutionType: type,
          resolvedBy: 'user-123',
        };
        const result = ResolutionMetadataSchema.safeParse(resolution);
        expect(result.success).toBe(true);
      }
    });
  });
});
