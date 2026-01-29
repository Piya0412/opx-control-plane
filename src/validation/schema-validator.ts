import { z } from 'zod';
import { ValidationResult, ValidationError } from './validation.schema';

/**
 * Schema validator using Zod (non-throwing)
 * ✅ Correction 1: All validation returns data, not exceptions
 */
export class SchemaValidator {
  /**
   * Validate data against schema (non-throwing)
   * Returns ValidationResult with ok/data/error
   */
  static validate<T>(
    schema: z.ZodSchema<T>,
    data: unknown
  ): ValidationResult<T> {
    const result = schema.safeParse(data);
    
    if (result.success) {
      return {
        ok: true,
        data: result.data,
      };
    }
    
    return {
      ok: false,
      error: {
        layer: 'schema',
        message: 'Schema validation failed',
        details: result.error.issues,
      },
    };
  }

  /**
   * Get human-readable error summary (for logging only, never in prompts)
   */
  static getErrorSummary(error: z.ZodError): string {
    const issues = error.issues.map(issue => 
      `${issue.path.join('.')}: ${issue.message}`
    );
    return issues.join('; ');
  }

  /**
   * Get simplified error message (for internal use only)
   */
  static getSimplifiedMessage(error: z.ZodError): string {
    const issueCount = error.issues.length;
    const firstIssue = error.issues[0];
    
    if (issueCount === 1) {
      return `Field '${firstIssue.path.join('.')}' ${firstIssue.message}`;
    }
    
    return `${issueCount} validation errors found`;
  }
}
