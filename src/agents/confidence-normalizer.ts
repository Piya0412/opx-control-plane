/**
 * Phase 6 Step 2: Confidence Normalizer
 * 
 * Standardized confidence scoring across all agents.
 * 
 * CORRECTION 7: Normalized 0.0-1.0 scale with basis tracking
 */

import { NormalizedConfidence } from './schemas.js';

export class ConfidenceNormalizer {
  /**
   * Normalize confidence to 0.0-1.0 scale with basis tracking
   * 
   * @param rawConfidence - Raw confidence from LLM (0.0-1.0)
   * @param basis - Confidence basis: 'data', 'pattern', or 'assumption'
   * @returns Normalized confidence with breakdown
   */
  normalize(rawConfidence: number, basis: string[]): NormalizedConfidence {
    // Ensure 0.0-1.0 range
    const normalized = Math.max(0, Math.min(1, rawConfidence));
    
    // Penalize assumptions (each assumption reduces confidence by 10%)
    const assumptionPenalty = basis.filter(b => b === 'assumption').length * 0.1;
    const adjusted = Math.max(0, normalized - assumptionPenalty);
    
    return {
      confidence_estimate: adjusted,
      confidence_basis: basis as ('data' | 'pattern' | 'assumption')[],
      confidence_breakdown: {
        data_quality: this.assessDataQuality(basis),
        pattern_strength: this.assessPatternStrength(basis),
        assumption_count: basis.filter(b => b === 'assumption').length,
      },
    };
  }
  
  /**
   * Assess data quality based on basis
   * More 'data' basis = higher quality
   */
  private assessDataQuality(basis: string[]): number {
    const dataCount = basis.filter(b => b === 'data').length;
    return Math.min(1.0, dataCount * 0.3);
  }
  
  /**
   * Assess pattern strength based on basis
   * More 'pattern' basis = stronger patterns
   */
  private assessPatternStrength(basis: string[]): number {
    const patternCount = basis.filter(b => b === 'pattern').length;
    return Math.min(1.0, patternCount * 0.4);
  }
}
