/**
 * Validation Utilities
 * 
 * 🔒 PHASE 1 CONSTRAINT: Validation is purely syntactic.
 * 
 * ALLOWED:
 * - UUID format validation
 * - Enum membership validation
 * - String length validation
 * - Type validation
 * 
 * FORBIDDEN:
 * - State transition validation (stays in state machine)
 * - Permission validation (stays in authorization layer)
 * - Intent correctness validation (stays in business logic)
 * - Suggestions or hints
 * 
 * RULE: Reject malformed input, not incorrect intent.
 */

import { ValidationError } from '../domain/errors.js';

/**
 * UUID regex pattern (accepts all versions)
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * SHA-256 hex pattern (64 characters)
 */
const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/i;

/**
 * Validate UUID format (syntactic only)
 * 
 * @throws ValidationError if format is invalid
 */
export function validateUUID(value: string, fieldName: string): void {
  if (!value) {
    throw new ValidationError(
      `${fieldName} is required`,
      {
        field: fieldName,
        expected: 'UUID format',
        actual: value || 'empty',
      }
    );
  }

  if (!UUID_REGEX.test(value)) {
    throw new ValidationError(
      `${fieldName} must be a valid UUID`,
      {
        field: fieldName,
        expected: 'UUID format (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)',
        actual: value,
      }
    );
  }
}

/**
 * Validate enum membership (syntactic only)
 * 
 * @throws ValidationError if value is not in enum
 */
export function validateEnum<T extends string>(
  value: string,
  enumValues: readonly T[],
  fieldName: string
): void {
  if (!value) {
    throw new ValidationError(
      `${fieldName} is required`,
      {
        field: fieldName,
        expected: `One of: ${enumValues.join(', ')}`,
        actual: 'empty',
      }
    );
  }

  if (!enumValues.includes(value as T)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${enumValues.join(', ')}`,
      {
        field: fieldName,
        expected: `One of: ${enumValues.join(', ')}`,
        actual: value,
      }
    );
  }
}

/**
 * Validate and parse positive integer (syntactic only)
 * 
 * @returns Parsed integer
 * @throws ValidationError if not a positive integer
 */
export function validatePositiveInt(value: string, fieldName: string): number {
  if (!value) {
    throw new ValidationError(
      `${fieldName} is required`,
      {
        field: fieldName,
        expected: 'Positive integer',
        actual: 'empty',
      }
    );
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) {
    throw new ValidationError(
      `${fieldName} must be a number`,
      {
        field: fieldName,
        expected: 'Positive integer',
        actual: value,
      }
    );
  }

  // Check if the parsed value equals the original string
  // This rejects decimals like "12.34" which parseInt would accept
  if (parsed.toString() !== value) {
    throw new ValidationError(
      `${fieldName} must be an integer`,
      {
        field: fieldName,
        expected: 'Positive integer',
        actual: value,
      }
    );
  }

  if (parsed <= 0) {
    throw new ValidationError(
      `${fieldName} must be positive`,
      {
        field: fieldName,
        expected: 'Positive integer (> 0)',
        actual: parsed,
      }
    );
  }

  return parsed;
}

/**
 * Validate string length (syntactic only)
 * 
 * @throws ValidationError if length is out of bounds
 */
export function validateStringLength(
  value: string,
  min: number,
  max: number,
  fieldName: string
): void {
  if (value === null || value === undefined) {
    throw new ValidationError(
      `${fieldName} is required`,
      {
        field: fieldName,
        expected: `String with length between ${min} and ${max}`,
        actual: 'null or undefined',
      }
    );
  }

  const length = value.length;

  if (length < min) {
    throw new ValidationError(
      `${fieldName} must be at least ${min} characters`,
      {
        field: fieldName,
        expected: `Length >= ${min}`,
        actual: `Length = ${length}`,
      }
    );
  }

  if (length > max) {
    throw new ValidationError(
      `${fieldName} must be at most ${max} characters`,
      {
        field: fieldName,
        expected: `Length <= ${max}`,
        actual: `Length = ${length}`,
      }
    );
  }
}

/**
 * Validate idempotency key format (syntactic only)
 * 
 * Accepts:
 * - UUID v4 format
 * - SHA-256 hex (64 characters)
 * 
 * @throws ValidationError if format is invalid
 */
export function validateIdempotencyKey(key: string): void {
  if (!key) {
    throw new ValidationError(
      'Idempotency-Key is required',
      {
        field: 'Idempotency-Key',
        expected: 'UUID or SHA-256 hex (64 characters)',
        actual: 'empty',
      }
    );
  }

  const isUUID = UUID_REGEX.test(key);
  const isSHA256 = SHA256_HEX_REGEX.test(key);

  if (!isUUID && !isSHA256) {
    throw new ValidationError(
      'Idempotency-Key must be a valid UUID or SHA-256 hex',
      {
        field: 'Idempotency-Key',
        expected: 'UUID format or SHA-256 hex (64 characters)',
        actual: key.length > 50 ? `${key.substring(0, 50)}...` : key,
      }
    );
  }
}

/**
 * Validate required fields (syntactic only)
 * 
 * @throws ValidationError if any required field is missing
 */
export function validateRequiredFields(
  obj: Record<string, any>,
  fields: string[]
): void {
  const missing: string[] = [];

  for (const field of fields) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    throw new ValidationError(
      `Missing required fields: ${missing.join(', ')}`,
      {
        field: 'body',
        expected: `All required fields: ${fields.join(', ')}`,
        actual: `Missing: ${missing.join(', ')}`,
      }
    );
  }
}

/**
 * Validate integer range (syntactic only)
 * 
 * @throws ValidationError if value is out of range
 */
export function validateRange(
  value: number,
  min: number,
  max: number,
  fieldName: string
): void {
  if (value < min || value > max) {
    throw new ValidationError(
      `${fieldName} must be between ${min} and ${max}`,
      {
        field: fieldName,
        expected: `Value between ${min} and ${max}`,
        actual: value,
      }
    );
  }
}
