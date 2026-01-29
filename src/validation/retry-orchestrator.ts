import { Logger } from './logger';
import { ValidationError } from './validation.schema';

export interface RetryConfig {
  maxAttempts: number; // Default: 3
}

/**
 * Retry orchestrator with bounded retries and prompt simplification
 * ✅ Correction 3: No raw validation errors in prompts
 */
export class RetryOrchestrator {
  private logger = new Logger('RetryOrchestrator');
  private config: RetryConfig;

  constructor(config?: Partial<RetryConfig>) {
    this.config = {
      maxAttempts: config?.maxAttempts || 3,
    };
  }

  /**
   * Generate retry prompt (summarized, not echoing raw errors)
   * ✅ Correction 3: Summarize, don't echo
   */
  generateRetryPrompt(
    attempt: number,
    originalPrompt: string,
    _errors: ValidationError[] // Intentionally unused - not in prompt
  ): string {
    if (attempt === 1) {
      // First retry: Clarify requirements
      return `${originalPrompt}\n\nIMPORTANT: Previous response did not meet required format. Please strictly follow the schema and ensure all required fields are present.`;
    }
    
    if (attempt === 2) {
      // Second retry: Simplify
      return `${originalPrompt}\n\nPlease provide a simplified response that strictly adheres to the required output format. Focus on accuracy and completeness.`;
    }
    
    // Should not reach here (fallback instead)
    this.logger.warn('Unexpected retry attempt', { attempt });
    return originalPrompt;
  }

  /**
   * Check if should retry
   */
  shouldRetry(attempt: number): boolean {
    return attempt < this.config.maxAttempts;
  }

  /**
   * Get attempt bucket for metrics
   * ✅ Correction 4: Bucketed dimensions
   */
  getAttemptBucket(attempt: number): 'first' | 'second' | 'fallback' {
    if (attempt === 0) return 'first';
    if (attempt === 1) return 'second';
    return 'fallback';
  }

  /**
   * Get retry strategy for current attempt
   */
  getRetryStrategy(attempt: number): 'clarify' | 'simplify' | 'fallback' {
    if (attempt === 0) return 'clarify';
    if (attempt === 1) return 'simplify';
    return 'fallback';
  }

  /**
   * Log retry attempt (errors go to logs, not prompts)
   */
  logRetryAttempt(params: {
    attempt: number;
    errors: ValidationError[];
    sessionId: string;
  }): void {
    this.logger.info('Retry attempt', {
      attempt: params.attempt,
      attemptBucket: this.getAttemptBucket(params.attempt),
      strategy: this.getRetryStrategy(params.attempt),
      errorCount: params.errors.length,
      errors: params.errors, // Full errors in logs only
      sessionId: params.sessionId,
    });
  }
}
