import { z } from 'zod';
import { Logger } from './logger';
import { SchemaValidator } from './schema-validator';
import { BusinessValidator } from './business-validator';
import { SemanticValidator } from './semantic-validator';
import { RetryOrchestrator } from './retry-orchestrator';
import { FallbackGenerator } from './fallback-generator';
import { ValidationMetrics } from './validation-metrics';
import { ValidationStore } from './validation-store';
import { ValidationResult, ValidationError, RetryResult } from './validation.schema';

/**
 * Main output validator
 * Orchestrates three-layer validation with bounded retries
 * ✅ All corrections applied
 */
export class OutputValidator {
  private logger = new Logger('OutputValidator');
  private businessValidator = new BusinessValidator();
  private semanticValidator = new SemanticValidator();
  private retryOrchestrator = new RetryOrchestrator();
  private fallbackGenerator = new FallbackGenerator();
  private metrics = new ValidationMetrics();
  private store = new ValidationStore();

  /**
   * Validate agent output with retries
   * Returns validated data or fallback (never throws)
   */
  async validateWithRetry<T>(params: {
    schema: z.ZodSchema<T>;
    rawOutput: string;
    agentId: string;
    sessionId: string;
    fallbackTemplate: T;
    invokeAgent: (prompt: string) => Promise<string>;
    originalPrompt: string;
  }): Promise<RetryResult<T>> {
    const errors: ValidationError[] = [];
    let attempt = 0;

    while (attempt < 3) {
      const attemptBucket = this.retryOrchestrator.getAttemptBucket(attempt);
      
      this.logger.info('Validation attempt', {
        attempt,
        attemptBucket,
        agentId: params.agentId,
        sessionId: params.sessionId,
      });

      // Parse and validate
      const result = await this.validateOutput({
        schema: params.schema,
        rawOutput: params.rawOutput,
        agentId: params.agentId,
        sessionId: params.sessionId,
        attempt,
      });

      if (result.ok && result.data) {
        // Success!
        await this.metrics.emitValidationAttempt({
          agentId: params.agentId,
          attempt,
          success: true,
          validationLayer: 'schema',
        });

        return {
          success: true,
          data: result.data,
          attempts: attempt + 1,
          fallbackUsed: false,
          errors,
        };
      }

      // Validation failed
      if (result.error) {
        errors.push(result.error);
        
        await this.metrics.emitValidationAttempt({
          agentId: params.agentId,
          attempt,
          success: false,
          validationLayer: result.error.layer,
        });

        await this.store.storeValidationError({
          agentId: params.agentId,
          sessionId: params.sessionId,
          attempt,
          validationLayer: result.error.layer,
          error: result.error,
          rawOutput: params.rawOutput,
        });
      }

      // Check if should retry
      attempt++;
      if (!this.retryOrchestrator.shouldRetry(attempt)) {
        break;
      }

      // Generate retry prompt (summarized, no raw errors)
      // ✅ Correction 3: No raw validation details in prompt
      const retryPrompt = this.retryOrchestrator.generateRetryPrompt(
        attempt,
        params.originalPrompt,
        errors
      );

      this.retryOrchestrator.logRetryAttempt({
        attempt,
        errors,
        sessionId: params.sessionId,
      });

      await this.metrics.emitRetry({
        agentId: params.agentId,
        attempt,
        strategy: this.retryOrchestrator.getRetryStrategy(attempt),
      });

      // Invoke agent again with retry prompt
      try {
        params.rawOutput = await params.invokeAgent(retryPrompt);
      } catch (error) {
        this.logger.error('Agent invocation failed during retry', {
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }

    // All retries exhausted - use fallback
    this.logger.warn('All validation attempts failed, using fallback', {
      agentId: params.agentId,
      sessionId: params.sessionId,
      attempts: attempt,
      errorCount: errors.length,
    });

    await this.metrics.emitFallback({
      agentId: params.agentId,
      attempts: attempt,
    });

    const fallback = this.fallbackGenerator.generateFallback({
      agentId: params.agentId,
      sessionId: params.sessionId,
      attempts: attempt,
      template: params.fallbackTemplate,
    });

    return {
      success: false,
      data: fallback,
      attempts: attempt,
      fallbackUsed: true,
      errors,
    };
  }

  /**
   * Validate output through three layers
   * ✅ Correction 1: Non-throwing validation
   * ✅ Correction 2: Best-effort semantic validation
   */
  private async validateOutput<T>(params: {
    schema: z.ZodSchema<T>;
    rawOutput: string;
    agentId: string;
    sessionId: string;
    attempt: number;
  }): Promise<ValidationResult<T>> {
    // Layer 1: Schema validation (non-throwing)
    let parsed: unknown;
    try {
      parsed = JSON.parse(params.rawOutput);
    } catch (error) {
      return {
        ok: false,
        error: {
          layer: 'schema',
          message: 'Invalid JSON',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }

    const schemaResult = SchemaValidator.validate(params.schema, parsed);
    if (!schemaResult.ok) {
      return schemaResult;
    }

    const data = schemaResult.data!;

    // Layer 2: Business logic validation
    const businessResult = this.businessValidator.validateAgentOutput(data as any);
    if (!businessResult.ok) {
      return businessResult as ValidationResult<T>;
    }

    // Layer 3: Semantic validation (best-effort, never blocks)
    // ✅ Correction 2: Best-effort only, warnings logged
    if ((data as any).citations && Array.isArray((data as any).citations)) {
      const semanticResult = await this.semanticValidator.validateCitations(
        (data as any).citations
      );
      
      if (semanticResult.warnings.length > 0) {
        this.logger.warn('Semantic validation warnings', {
          warnings: semanticResult.warnings,
          agentId: params.agentId,
          sessionId: params.sessionId,
        });
        // Continue anyway - warnings don't fail validation
      }
    }

    // All layers passed
    return {
      ok: true,
      data,
    };
  }
}
