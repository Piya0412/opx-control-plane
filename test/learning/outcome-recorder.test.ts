/**
 * Phase 4 - Step 3: Outcome Recorder Tests
 * 
 * Tests for outcome recorder orchestration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutcomeRecorder, IncidentNotFoundError } from '../../src/learning/outcome-recorder';
import { ValidationGate, ValidationError } from '../../src/learning/validation-gate';
import { OutcomeStore } from '../../src/learning/outcome-store';
import type { IncidentStore } from '../../src/incident/incident-store';
import type { Incident, Authority } from '../../src/incident/incident.schema';
import type { OutcomeRequest, IncidentOutcome } from '../../src/learning/outcome.schema';

describe('Phase 4 - Step 3: Outcome Recorder', () => {
  let recorder: OutcomeRecorder;
  let validationGate: ValidationGate;
  let outcomeStore: OutcomeStore;
  let incidentStore: IncidentStore;
  
  const validIncident: Incident = {
    incidentId: 'a'.repeat(64),
    service: 'order-service',
    severity: 'HIGH',
    state: 'CLOSED',
    evidenceId: 'b'.repeat(64),
    candidateId: 'c'.repeat(64),
    confidenceScore: 0.85,
    openedAt: '2026-01-22T09:00:00.000Z',
    acknowledgedAt: '2026-01-22T09:05:00.000Z',
    mitigatedAt: '2026-01-22T09:30:00.000Z',
    resolvedAt: '2026-01-22T09:45:00.000Z',
    closedAt: '2026-01-22T10:00:00.000Z',
    title: 'Test Incident',
    description: 'Test incident for recorder',
    tags: [],
    createdBy: { type: 'AUTO_ENGINE', principal: 'system' },
    lastModifiedAt: '2026-01-22T10:00:00.000Z',
    lastModifiedBy: { type: 'HUMAN_OPERATOR', principal: 'arn:aws:iam::123456789012:user/operator' },
  };
  
  const validOutcomeRequest: OutcomeRequest = {
    classification: {
      truePositive: true,
      falsePositive: false,
      rootCause: 'Database connection pool exhausted',
      resolutionType: 'FIXED',
    },
    humanAssessment: {
      confidenceRating: 0.85,
      severityAccuracy: 'ACCURATE',
      detectionQuality: 'GOOD',
    },
  };
  
  const humanAuthority: Authority = {
    type: 'HUMAN_OPERATOR',
    principal: 'arn:aws:iam::123456789012:user/operator',
  };
  
  beforeEach(() => {
    validationGate = new ValidationGate();
    outcomeStore = {} as OutcomeStore;
    incidentStore = {} as IncidentStore;
    
    recorder = new OutcomeRecorder(
      validationGate,
      outcomeStore,
      incidentStore
    );
  });
  
  describe('recordOutcome', () => {
    it('should successfully record outcome', async () => {
      // Mock incident store
      incidentStore.getIncident = vi.fn().mockResolvedValue(validIncident);
      
      // Mock outcome store
      outcomeStore.recordOutcome = vi.fn().mockResolvedValue(true);
      
      const result = await recorder.recordOutcome(
        validIncident.incidentId,
        validOutcomeRequest,
        humanAuthority
      );
      
      expect(result.success).toBe(true);
      expect(result.created).toBe(true);
      expect(result.outcomeId).toHaveLength(64);
      expect(result.outcome.incidentId).toBe(validIncident.incidentId);
      expect(result.outcome.service).toBe('order-service');
    });
    
    it('should return created: false for duplicate', async () => {
      // Mock incident store
      incidentStore.getIncident = vi.fn().mockResolvedValue(validIncident);
      
      // Mock outcome store (duplicate)
      outcomeStore.recordOutcome = vi.fn().mockResolvedValue(false);
      
      const result = await recorder.recordOutcome(
        validIncident.incidentId,
        validOutcomeRequest,
        humanAuthority
      );
      
      expect(result.success).toBe(true);
      expect(result.created).toBe(false);
    });
    
    it('should throw IncidentNotFoundError for invalid incidentId', async () => {
      // Mock incident store (not found)
      incidentStore.getIncident = vi.fn().mockResolvedValue(null);
      
      await expect(
        recorder.recordOutcome(
          'invalid-id',
          validOutcomeRequest,
          humanAuthority
        )
      ).rejects.toThrow(IncidentNotFoundError);
      
      await expect(
        recorder.recordOutcome(
          'invalid-id',
          validOutcomeRequest,
          humanAuthority
        )
      ).rejects.toThrow('Incident not found: invalid-id');
    });
    
    it('should throw ValidationError for non-CLOSED incident', async () => {
      const openIncident = { ...validIncident, state: 'OPEN' as const };
      
      // Mock incident store
      incidentStore.getIncident = vi.fn().mockResolvedValue(openIncident);
      
      await expect(
        recorder.recordOutcome(
          openIncident.incidentId,
          validOutcomeRequest,
          humanAuthority
        )
      ).rejects.toThrow(ValidationError);
    });
    
    it('should throw ValidationError for AUTO_ENGINE authority', async () => {
      // Mock incident store
      incidentStore.getIncident = vi.fn().mockResolvedValue(validIncident);
      
      const autoAuthority: Authority = {
        type: 'AUTO_ENGINE',
        principal: 'system',
      };
      
      await expect(
        recorder.recordOutcome(
          validIncident.incidentId,
          validOutcomeRequest,
          autoAuthority
        )
      ).rejects.toThrow(ValidationError);
    });
    
    it('should throw ValidationError for missing required fields', async () => {
      // Mock incident store
      incidentStore.getIncident = vi.fn().mockResolvedValue(validIncident);
      
      const invalidRequest = {
        ...validOutcomeRequest,
        classification: null as any,
      };
      
      await expect(
        recorder.recordOutcome(
          validIncident.incidentId,
          invalidRequest,
          humanAuthority
        )
      ).rejects.toThrow();
    });
    
    it('should propagate store errors', async () => {
      // Mock incident store
      incidentStore.getIncident = vi.fn().mockResolvedValue(validIncident);
      
      // Mock outcome store (error)
      outcomeStore.recordOutcome = vi.fn().mockRejectedValue(
        new Error('DynamoDB error')
      );
      
      await expect(
        recorder.recordOutcome(
          validIncident.incidentId,
          validOutcomeRequest,
          humanAuthority
        )
      ).rejects.toThrow('DynamoDB error');
    });
  });
  
  describe('getOutcomeByIncident', () => {
    it('should return outcome for valid incident', async () => {
      const mockOutcome: IncidentOutcome = {
        outcomeId: 'd'.repeat(64),
        incidentId: validIncident.incidentId,
        service: 'order-service',
        recordedAt: '2026-01-22T10:01:00.000Z',
        validatedAt: '2026-01-22T10:01:00.000Z',
        recordedBy: humanAuthority,
        classification: validOutcomeRequest.classification,
        timing: {
          detectedAt: validIncident.openedAt,
          acknowledgedAt: validIncident.acknowledgedAt,
          mitigatedAt: validIncident.mitigatedAt,
          resolvedAt: validIncident.resolvedAt!,
          closedAt: validIncident.closedAt!,
          ttd: 0,
          ttr: 2700000,
        },
        humanAssessment: validOutcomeRequest.humanAssessment,
        version: '1.0.0',
      };
      
      outcomeStore.getOutcomeByIncident = vi.fn().mockResolvedValue(mockOutcome);
      
      const outcome = await recorder.getOutcomeByIncident(validIncident.incidentId);
      
      expect(outcome).toEqual(mockOutcome);
    });
    
    it('should return null for non-existent incident', async () => {
      outcomeStore.getOutcomeByIncident = vi.fn().mockResolvedValue(null);
      
      const outcome = await recorder.getOutcomeByIncident('invalid-id');
      
      expect(outcome).toBeNull();
    });
  });
  
  describe('listOutcomes', () => {
    it('should list outcomes with filters', async () => {
      const mockOutcomes: IncidentOutcome[] = [
        {
          outcomeId: 'd'.repeat(64),
          incidentId: validIncident.incidentId,
          service: 'order-service',
          recordedAt: '2026-01-22T10:01:00.000Z',
          validatedAt: '2026-01-22T10:01:00.000Z',
          recordedBy: humanAuthority,
          classification: validOutcomeRequest.classification,
          timing: {
            detectedAt: validIncident.openedAt,
            acknowledgedAt: validIncident.acknowledgedAt,
            mitigatedAt: validIncident.mitigatedAt,
            resolvedAt: validIncident.resolvedAt!,
            closedAt: validIncident.closedAt!,
            ttd: 0,
            ttr: 2700000,
          },
          humanAssessment: validOutcomeRequest.humanAssessment,
          version: '1.0.0',
        },
      ];
      
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue(mockOutcomes);
      
      const outcomes = await recorder.listOutcomes({
        service: 'order-service',
        truePositive: true,
      });
      
      expect(outcomes).toEqual(mockOutcomes);
      expect(outcomeStore.listOutcomes).toHaveBeenCalledWith({
        service: 'order-service',
        truePositive: true,
      });
    });
    
    it('should list all outcomes without filters', async () => {
      outcomeStore.listOutcomes = vi.fn().mockResolvedValue([]);
      
      const outcomes = await recorder.listOutcomes();
      
      expect(outcomes).toEqual([]);
      expect(outcomeStore.listOutcomes).toHaveBeenCalledWith(undefined);
    });
  });
});
