import { z } from 'zod';

/**
 * Validation result (non-throwing)
 * ✅ Correction 1: Returns data, not exceptions
 */
export interface ValidationResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: ValidationError;
}

/**
 * Validation error details
 */
export interface ValidationError {
  layer: 'schema' | 'business' | 'semantic';
  message: string;
  details?: unknown;
}

/**
 * Validation attempt record (for DynamoDB)
 */
export const ValidationAttemptSchema = z.object({
  errorId: z.string(),
  timestamp: z.string(),
  ttl: z.number(),
  agentId: z.string(),
  sessionId: z.string(),
  attempt: z.number(),
  validationLayer: z.enum(['schema', 'business', 'semantic']),
  errorMessage: z.string(),
  errorDetails: z.unknown().optional(),
  rawOutput: z.string().optional(),
});

export type ValidationAttempt = z.infer<typeof ValidationAttemptSchema>;

/**
 * Retry result
 */
export interface RetryResult<T> {
  success: boolean;
  data?: T;
  attempts: number;
  fallbackUsed: boolean;
  errors: ValidationError[];
}
