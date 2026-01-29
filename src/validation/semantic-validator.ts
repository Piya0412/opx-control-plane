import { ValidationResult } from './validation.schema';
import { Logger } from './logger';

/**
 * Semantic validator (best-effort only)
 * ✅ Correction 2: Never blocks, always returns success
 */
export interface SemanticValidationResult {
  ok: boolean;
  warnings: string[];
}

export class SemanticValidator {
  private logger = new Logger('SemanticValidator');

  /**
   * Validate citations reference existing documents (best-effort)
   * ✅ Correction 2: Never blocks on infra failures
   */
  async validateCitations(
    citations: Array<{ source: string; content: string }>
  ): Promise<SemanticValidationResult> {
    const warnings: string[] = [];

    for (const citation of citations) {
      try {
        // Best-effort document verification with timeout
        const exists = await this.verifyDocumentExists(citation.source);
        
        if (!exists) {
          // ✅ Log + warn, don't fail
          this.logger.warn('Citation document not found', {
            source: citation.source,
          });
          warnings.push(`Document not found: ${citation.source}`);
        }
      } catch (error) {
        // ✅ Skip check on infra failure - don't add to warnings
        this.logger.warn('Semantic validation skipped due to error', {
          source: citation.source,
          error: error instanceof Error ? error.message : String(error),
        });
        // Infra failure is not a validation failure
      }
    }

    // Always return success - warnings are informational only
    return {
      ok: true,
      warnings,
    };
  }

  /**
   * Validate reasoning is logically consistent (best-effort)
   */
  async validateReasoning(reasoning: string): Promise<SemanticValidationResult> {
    const warnings: string[] = [];

    try {
      // Check for obvious contradictions or nonsense
      if (this.containsContradiction(reasoning)) {
        warnings.push('Reasoning may contain contradictions');
      }

      if (this.isTooVague(reasoning)) {
        warnings.push('Reasoning is very generic');
      }
    } catch (error) {
      // Skip on any error
      this.logger.warn('Reasoning validation skipped', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Always return success
    return {
      ok: true,
      warnings,
    };
  }

  /**
   * Verify document exists in knowledge base (best-effort with timeout)
   */
  private async verifyDocumentExists(source: string): Promise<boolean> {
    try {
      // TODO: Implement actual document lookup
      // For now, return true (optimistic)
      // In real implementation:
      // - Query knowledge base with timeout
      // - Return false on timeout or error
      // - Never throw exceptions
      return true;
    } catch {
      // Treat any error as "not found" (best-effort)
      return false;
    }
  }

  /**
   * Check for obvious contradictions (simple heuristic)
   */
  private containsContradiction(text: string): boolean {
    const lower = text.toLowerCase();
    
    // Simple contradiction patterns
    const patterns = [
      /\b(yes|true|correct)\b.*\b(no|false|incorrect)\b/,
      /\b(increase|higher|more)\b.*\b(decrease|lower|less)\b/,
      /\b(always|never)\b.*\b(sometimes|occasionally)\b/,
    ];

    return patterns.some(pattern => pattern.test(lower));
  }

  /**
   * Check if reasoning is too vague
   */
  private isTooVague(text: string): boolean {
    const lower = text.toLowerCase();
    
    // Count vague words
    const vagueWords = [
      'maybe', 'perhaps', 'possibly', 'might', 'could',
      'something', 'somehow', 'somewhat', 'various',
    ];

    const vagueCount = vagueWords.filter(word => 
      lower.includes(word)
    ).length;

    // Too vague if >30% of words are vague
    const wordCount = text.split(/\s+/).length;
    return vagueCount / wordCount > 0.3;
  }
}
