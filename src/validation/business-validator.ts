import { ValidationResult, ValidationError } from './validation.schema';
import { Logger } from './logger';

/**
 * Business logic validator
 * Validates domain-specific invariants
 */
export class BusinessValidator {
  private logger = new Logger('BusinessValidator');

  /**
   * Validate confidence score is in valid range
   */
  validateConfidence(confidence: number): ValidationResult<number> {
    if (confidence < 0 || confidence > 1) {
      return {
        ok: false,
        error: {
          layer: 'business',
          message: 'Confidence must be between 0 and 1',
          details: { confidence },
        },
      };
    }

    return {
      ok: true,
      data: confidence,
    };
  }

  /**
   * Validate reasoning is not empty
   */
  validateReasoning(reasoning: string): ValidationResult<string> {
    if (!reasoning || reasoning.trim().length === 0) {
      return {
        ok: false,
        error: {
          layer: 'business',
          message: 'Reasoning cannot be empty',
        },
      };
    }

    if (reasoning.length < 10) {
      return {
        ok: false,
        error: {
          layer: 'business',
          message: 'Reasoning must be at least 10 characters',
          details: { length: reasoning.length },
        },
      };
    }

    return {
      ok: true,
      data: reasoning,
    };
  }

  /**
   * Validate citations have required fields
   */
  validateCitations(citations: Array<{ source: string; content: string }>): ValidationResult {
    for (const citation of citations) {
      if (!citation.source || citation.source.trim().length === 0) {
        return {
          ok: false,
          error: {
            layer: 'business',
            message: 'Citation source cannot be empty',
          },
        };
      }

      if (!citation.content || citation.content.trim().length === 0) {
        return {
          ok: false,
          error: {
            layer: 'business',
            message: 'Citation content cannot be empty',
          },
        };
      }
    }

    return {
      ok: true,
    };
  }

  /**
   * Validate agent output has minimum required fields
   */
  validateAgentOutput(output: {
    confidence?: number;
    reasoning?: string;
    citations?: Array<{ source: string; content: string }>;
  }): ValidationResult {
    // Check confidence
    if (output.confidence !== undefined) {
      const confidenceResult = this.validateConfidence(output.confidence);
      if (!confidenceResult.ok) {
        return confidenceResult;
      }
    }

    // Check reasoning
    if (output.reasoning !== undefined) {
      const reasoningResult = this.validateReasoning(output.reasoning);
      if (!reasoningResult.ok) {
        return reasoningResult;
      }
    }

    // Check citations
    if (output.citations !== undefined && output.citations.length > 0) {
      const citationsResult = this.validateCitations(output.citations);
      if (!citationsResult.ok) {
        return citationsResult;
      }
    }

    return {
      ok: true,
    };
  }
}
