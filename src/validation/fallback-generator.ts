import { Logger } from './logger';

/**
 * Fallback response generator
 * Creates safe, honest fallback responses when validation fails
 */
export class FallbackGenerator {
  private logger = new Logger('FallbackGenerator');

  /**
   * Generate fallback response with confidence: 0.0
   * ✅ Honest, non-misleading, safe for downstream
   */
  generateFallback<T extends Record<string, unknown>>(params: {
    agentId: string;
    sessionId: string;
    attempts: number;
    template: T;
  }): T {
    this.logger.warn('Generating fallback response', {
      agentId: params.agentId,
      sessionId: params.sessionId,
      attempts: params.attempts,
    });

    // Create fallback with safe defaults
    const fallback: Record<string, unknown> = {
      ...params.template,
      confidence: 0.0,
      reasoning: `Unable to generate valid response after ${params.attempts} attempts. Please review the input and try again with more specific information.`,
    };

    // Clear any arrays to empty (safe default)
    for (const [key, value] of Object.entries(fallback)) {
      if (Array.isArray(value)) {
        fallback[key] = [];
      }
    }

    return fallback as T;
  }

  /**
   * Generate fallback for signal analysis
   */
  generateSignalAnalysisFallback(params: {
    sessionId: string;
    attempts: number;
  }): {
    confidence: number;
    reasoning: string;
    severity: string;
    recommendations: string[];
    citations: Array<{ source: string; content: string }>;
  } {
    return {
      confidence: 0.0,
      reasoning: `Unable to analyze signal after ${params.attempts} attempts. Insufficient information or validation failures prevented analysis.`,
      severity: 'unknown',
      recommendations: [],
      citations: [],
    };
  }

  /**
   * Generate fallback for historical pattern analysis
   */
  generateHistoricalPatternFallback(params: {
    sessionId: string;
    attempts: number;
  }): {
    confidence: number;
    reasoning: string;
    patterns: string[];
    citations: Array<{ source: string; content: string }>;
  } {
    return {
      confidence: 0.0,
      reasoning: `Unable to identify patterns after ${params.attempts} attempts. Historical data may be insufficient or validation failures occurred.`,
      patterns: [],
      citations: [],
    };
  }

  /**
   * Generate fallback for risk assessment
   */
  generateRiskAssessmentFallback(params: {
    sessionId: string;
    attempts: number;
  }): {
    confidence: number;
    reasoning: string;
    riskLevel: string;
    mitigations: string[];
    citations: Array<{ source: string; content: string }>;
  } {
    return {
      confidence: 0.0,
      reasoning: `Unable to assess risk after ${params.attempts} attempts. Risk analysis could not be completed due to validation failures.`,
      riskLevel: 'unknown',
      mitigations: [],
      citations: [],
    };
  }
}
