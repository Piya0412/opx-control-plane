import { describe, it, expect } from 'vitest';
import {
  OpxError,
  InvalidTransitionError,
  IncidentNotFoundError,
  ValidationError,
  ConflictError,
  ApprovalRequiredError,
} from '../../src/domain/errors.js';

describe('Error Classes', () => {
  describe('OpxError', () => {
    it('should create error with all properties', () => {
      const error = new OpxError('Test error', 'TEST_CODE', 400, { key: 'value' });
      
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ key: 'value' });
    });

    it('should serialize to JSON correctly', () => {
      const error = new OpxError('Test error', 'TEST_CODE', 400, { key: 'value' });
      const json = error.toJSON();
      
      expect(json).toEqual({
        error: {
          code: 'TEST_CODE',
          message: 'Test error',
          details: { key: 'value' },
        },
      });
    });
  });

  describe('InvalidTransitionError', () => {
    it('should include transition details', () => {
      const error = new InvalidTransitionError('CREATED', 'CLOSED', ['ANALYZING']);
      
      expect(error.code).toBe('INVALID_TRANSITION');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({
        currentState: 'CREATED',
        targetState: 'CLOSED',
        allowedTransitions: ['ANALYZING'],
      });
    });
  });

  describe('IncidentNotFoundError', () => {
    it('should include incident ID', () => {
      const error = new IncidentNotFoundError('test-id-123');
      
      expect(error.code).toBe('INCIDENT_NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.details).toEqual({ incidentId: 'test-id-123' });
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input', { field: 'name' });
      
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('ConflictError', () => {
    it('should include version information', () => {
      const error = new ConflictError('incident-123', 1, 2);
      
      expect(error.code).toBe('CONFLICT');
      expect(error.statusCode).toBe(409);
      expect(error.details).toEqual({
        incidentId: 'incident-123',
        expectedVersion: 1,
        actualVersion: 2,
      });
    });
  });

  describe('ApprovalRequiredError', () => {
    it('should include action information', () => {
      const error = new ApprovalRequiredError('incident-123', 'CLOSE');
      
      expect(error.code).toBe('APPROVAL_REQUIRED');
      expect(error.statusCode).toBe(403);
      expect(error.details).toEqual({
        incidentId: 'incident-123',
        action: 'CLOSE',
      });
    });
  });
});
