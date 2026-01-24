/**
 * Phase 4 - Step 2: Validation Schemas
 * 
 * Schemas for validation results and errors.
 */

import { z } from 'zod';

/**
 * Validation Error
 * 
 * Describes a specific validation failure.
 */
export const ValidationErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
  code: z.string(),
});

/**
 * Validation Result
 * 
 * Result of validation gate check.
 */
export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(ValidationErrorSchema),
});

// Export TypeScript types
export type ValidationError = z.infer<typeof ValidationErrorSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
