import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { extractPrincipal } from '../../src/controller/authorization.js';
import { ValidationError } from '../../src/domain/errors.js';

/**
 * IAM Authentication Tests
 * 
 * Verify that IAM principal extraction works correctly.
 * NO API KEYS. NO STATIC TOKENS. IAM ONLY.
 */
describe('IAM Authentication', () => {
  describe('extractPrincipal', () => {
    it('should extract IAM user principal', () => {
      const event = {
        requestContext: {
          identity: {
            userArn: 'arn:aws:iam::123456789012:user/alice',
            caller: null,
            sourceIp: '1.2.3.4',
          },
          requestId: 'test-request-id',
        },
      } as unknown as APIGatewayProxyEvent;

      const principal = extractPrincipal(event);

      expect(principal.principalId).toBe('alice');
      expect(principal.principalType).toBe('USER');
      expect(principal.arn).toBe('arn:aws:iam::123456789012:user/alice');
      expect(principal.accountId).toBe('123456789012');
    });

    it('should extract assumed role principal', () => {
      const event = {
        requestContext: {
          identity: {
            userArn: 'arn:aws:sts::123456789012:assumed-role/OpxIncidentOperator/session123',
            caller: null,
            sourceIp: '1.2.3.4',
          },
          requestId: 'test-request-id',
        },
      } as unknown as APIGatewayProxyEvent;

      const principal = extractPrincipal(event);

      expect(principal.principalId).toBe('OpxIncidentOperator');
      expect(principal.principalType).toBe('ASSUMED_ROLE');
      expect(principal.accountId).toBe('123456789012');
    });

    it('should extract role principal', () => {
      const event = {
        requestContext: {
          identity: {
            userArn: 'arn:aws:iam::123456789012:role/OpxIncidentCreator',
            caller: null,
            sourceIp: '1.2.3.4',
          },
          requestId: 'test-request-id',
        },
      } as unknown as APIGatewayProxyEvent;

      const principal = extractPrincipal(event);

      expect(principal.principalId).toBe('OpxIncidentCreator');
      expect(principal.principalType).toBe('ROLE');
      expect(principal.accountId).toBe('123456789012');
    });

    it('should reject request without principal', () => {
      const event = {
        requestContext: {
          identity: {
            userArn: null,
            caller: null,
            sourceIp: '1.2.3.4',
          },
          requestId: 'test-request-id',
        },
      } as unknown as APIGatewayProxyEvent;

      expect(() => extractPrincipal(event)).toThrow(ValidationError);
      expect(() => extractPrincipal(event)).toThrow('No IAM principal found');
    });

    it('should reject invalid ARN format', () => {
      const event = {
        requestContext: {
          identity: {
            userArn: 'invalid-arn',
            caller: null,
            sourceIp: '1.2.3.4',
          },
          requestId: 'test-request-id',
        },
      } as unknown as APIGatewayProxyEvent;

      expect(() => extractPrincipal(event)).toThrow(ValidationError);
      expect(() => extractPrincipal(event)).toThrow('Invalid principal ARN format');
    });

    it('should use caller if userArn is not present', () => {
      const event = {
        requestContext: {
          identity: {
            userArn: null,
            caller: 'arn:aws:iam::123456789012:user/bob',
            sourceIp: '1.2.3.4',
          },
          requestId: 'test-request-id',
        },
      } as unknown as APIGatewayProxyEvent;

      const principal = extractPrincipal(event);

      expect(principal.principalId).toBe('bob');
      expect(principal.principalType).toBe('USER');
    });
  });
});
