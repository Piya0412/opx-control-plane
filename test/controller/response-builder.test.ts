/**
 * CP-8: Response Builder Tests
 * 
 * 🔒 CORRECTION 3: Translates CP-7 errors to HTTP-safe responses
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResponseBuilder } from '../../src/controller/response-builder.js';

describe('CP-8: Response Builder', () => {
  let builder: ResponseBuilder;

  beforeEach(() => {
    builder = new ResponseBuilder();
  });

  describe('success', () => {
    it('should build success response with data', () => {
      const data = { incidentId: 'test', status: 'OPEN' };
      const response = builder.success(data, 'req-123');

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(response.body);
      expect(body.data).toEqual(data);
      expect(body.metadata.requestId).toBe('req-123');
      expect(body.metadata.version).toBe('v1');
    });
  });

  describe('error', () => {
    it('should build error response', () => {
      const response = builder.error(400, 'INVALID_REQUEST', 'Bad request', 'req-123');

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_REQUEST');
      expect(body.error.message).toBe('Bad request');
    });

    it('should include error details', () => {
      const details = { field: 'incidentId', reason: 'invalid format' };
      const response = builder.error(400, 'INVALID_REQUEST', 'Bad request', 'req-123', details);

      const body = JSON.parse(response.body);
      expect(body.error.details).toEqual(details);
    });
  });

  describe('rateLimitExceeded', () => {
    it('should build rate limit response', () => {
      const response = builder.rateLimitExceeded(30, 'req-123');

      expect(response.statusCode).toBe(429);
      expect(response.headers['Retry-After']).toBe('30');

      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(body.error.details?.retryAfter).toBe(30);
    });
  });

  describe('CORRECTION 3: translateCP7Error', () => {
    it('should translate INCIDENT_NOT_FOUND to 404', () => {
      const error = new Error('Incident not found: abc123');
      const response = builder.translateCP7Error(error, 'req-123');

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should translate ILLEGAL_TRANSITION to 409', () => {
      const error = new Error('Illegal transition: PENDING → CLOSED');
      const response = builder.translateCP7Error(error, 'req-123');

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('ILLEGAL_TRANSITION');
    });

    it('should translate terminal state error to 409', () => {
      const error = new Error('Cannot transition from terminal state CLOSED');
      const response = builder.translateCP7Error(error, 'req-123');

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('ILLEGAL_TRANSITION');
    });

    it('should translate resolution required to 400', () => {
      const error = new Error('RESOLVED requires resolution metadata');
      const response = builder.translateCP7Error(error, 'req-123');

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('MISSING_RESOLUTION');
    });

    it('should translate resolution immutable to 409', () => {
      const error = new Error('Resolution already set');
      const response = builder.translateCP7Error(error, 'req-123');

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('RESOLUTION_IMMUTABLE');
    });

    it('should default to 500 for unknown errors', () => {
      const error = new Error('Unknown error');
      const response = builder.translateCP7Error(error, 'req-123');

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });

    it('should log raw error internally', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Test error');
      
      builder.translateCP7Error(error, 'req-123');

      expect(consoleSpy).toHaveBeenCalledWith('CP-7 error:', expect.any(Object));
      consoleSpy.mockRestore();
    });

    it('should never expose raw CP-7 error messages', () => {
      const error = new Error('Internal database constraint violation on table incidents_v1');
      const response = builder.translateCP7Error(error, 'req-123');

      const body = JSON.parse(response.body);
      expect(body.error.message).not.toContain('database');
      expect(body.error.message).not.toContain('table');
      expect(body.error.message).not.toContain('incidents_v1');
    });
  });
});
