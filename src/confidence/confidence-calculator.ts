/**
 * Phase 3.2: Confidence Calculator
 * 
 * Computes confidence assessments from evidence bundles.
 * 
 * CRITICAL RULES:
 * - assessedAt = evidence.bundledAt (determinism)
 * - modelVersion = "v1.0.0"
 * - Reasons reference computed facts only
 * - Reasons never restate the band itself
 */

import type { EvidenceBundle } from '../evidence/evidence-bundle.schema.js';
import type {
  CandidateAssessment,
  ConfidenceBand,
  FactorBreakdown,
  FactorContribution,
} from './confidence.schema.js';
import {
  CandidateAssessmentSchema,
  CONFIDENCE_MODEL_VERSION,
  FACTOR_WEIGHTS,
  CONFIDENCE_THRESHOLDS,
} from './confidence.schema.js';
import {
  computeDetectionCountScore,
  computeSeverityScore,
  computeRuleDiversityScore,
  computeTemporalDensityScore,
  computeSignalVolumeScore,
} from './confidence-factors.js';

/**
 * Confidence Calculator
 * 
 * Assesses confidence for incident candidates based on evidence.
 */
export class ConfidenceCalculator {
  private readonly weights: typeof FACTOR_WEIGHTS;
  private readonly modelVersion: string;
  
  constructor(
    weights: typeof FACTOR_WEIGHTS = FACTOR_WEIGHTS,
    modelVersion: string = CONFIDENCE_MODEL_VERSION
  ) {
    this.weights = weights;
    this.modelVersion = modelVersion;
  }
  
  /**
   * Assess confidence for evidence bundle
   * 
   * @param evidence - Evidence bundle to assess
   * @returns Confidence assessment
   */
  assess(evidence: EvidenceBundle): CandidateAssessment {
    // Compute all factors
    const factors = this.computeFactors(evidence);
    
    // Compute overall confidence score
    const confidenceScore = this.computeScore(factors);
    
    // Determine confidence band
    const confidenceBand = this.determineBand(confidenceScore);
    
    // Generate human-readable reasons
    const reasons = this.generateReasons(evidence, factors, confidenceScore);
    
    // Build assessment object
    const assessment: CandidateAssessment = {
      confidenceScore,
      confidenceBand,
      reasons,
      factors,
      assessedAt: evidence.bundledAt, // CRITICAL: Use evidence timestamp for determinism
      modelVersion: this.modelVersion,
    };
    
    // Validate against schema (fail-closed)
    const result = CandidateAssessmentSchema.safeParse(assessment);
    if (!result.success) {
      throw new Error(`Confidence assessment validation failed: ${result.error.message}`);
    }
    
    return result.data;
  }
  
  /**
   * Compute all factor scores
   */
  private computeFactors(evidence: EvidenceBundle): FactorBreakdown {
    const { detections, signalSummary, windowStart, windowEnd } = evidence;
    
    // Calculate window duration
    const windowDurationMs = 
      new Date(windowEnd).getTime() - new Date(windowStart).getTime();
    
    // Compute each factor value
    const detectionCountValue = computeDetectionCountScore(detections.length);
    const severityScoreValue = computeSeverityScore(detections);
    const ruleDiversityValue = computeRuleDiversityScore(detections);
    const temporalDensityValue = computeTemporalDensityScore(detections, windowDurationMs);
    const signalVolumeValue = computeSignalVolumeScore(signalSummary.signalCount);
    
    // Build factor breakdown with contributions
    return {
      detectionCount: this.buildFactorContribution(
        detectionCountValue,
        this.weights.detectionCount
      ),
      severityScore: this.buildFactorContribution(
        severityScoreValue,
        this.weights.severityScore
      ),
      ruleDiversity: this.buildFactorContribution(
        ruleDiversityValue,
        this.weights.ruleDiversity
      ),
      temporalDensity: this.buildFactorContribution(
        temporalDensityValue,
        this.weights.temporalDensity
      ),
      signalVolume: this.buildFactorContribution(
        signalVolumeValue,
        this.weights.signalVolume
      ),
    };
  }
  
  /**
   * Build factor contribution object
   */
  private buildFactorContribution(
    value: number,
    weight: number
  ): FactorContribution {
    return {
      value,
      contribution: value * weight,
      weight,
    };
  }
  
  /**
   * Compute overall confidence score
   * 
   * Weighted sum of all factors.
   */
  private computeScore(factors: FactorBreakdown): number {
    const score = 
      factors.detectionCount.contribution +
      factors.severityScore.contribution +
      factors.ruleDiversity.contribution +
      factors.temporalDensity.contribution +
      factors.signalVolume.contribution;
    
    // Clamp to [0, 1] (should already be in range, but safety)
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * Determine confidence band from score
   */
  private determineBand(score: number): ConfidenceBand {
    if (score < CONFIDENCE_THRESHOLDS.MEDIUM.min) return 'LOW';
    if (score < CONFIDENCE_THRESHOLDS.HIGH.min) return 'MEDIUM';
    if (score < CONFIDENCE_THRESHOLDS.CRITICAL.min) return 'HIGH';
    return 'CRITICAL';
  }
  
  /**
   * Generate human-readable reasons
   * 
   * RULES:
   * - Reference computed facts only
   * - Never restate the band itself
   * - Use NormalizedSeverity (CRITICAL/HIGH/MEDIUM/LOW/INFO)
   * - Be specific and actionable
   */
  private generateReasons(
    evidence: EvidenceBundle,
    factors: FactorBreakdown,
    score: number
  ): string[] {
    const reasons: string[] = [];
    const { detections, signalSummary } = evidence;
    
    // Detection count reason
    const detectionCount = detections.length;
    if (detectionCount === 1) {
      reasons.push(`Single detection observed (low confidence)`);
    } else if (detectionCount === 2) {
      reasons.push(`${detectionCount} detections observed`);
    } else if (detectionCount >= 4) {
      reasons.push(`${detectionCount} detections observed (strong evidence)`);
    } else {
      reasons.push(`${detectionCount} detections observed`);
    }
    
    // Severity reason (use NormalizedSeverity)
    const severityDist = signalSummary.severityDistribution;
    const criticalCount = severityDist['CRITICAL'] || 0;
    const highCount = severityDist['HIGH'] || 0;
    const mediumCount = severityDist['MEDIUM'] || 0;
    const lowCount = severityDist['LOW'] || 0;
    
    if (criticalCount > 0) {
      if (criticalCount === detectionCount) {
        reasons.push(`All detections are CRITICAL severity`);
      } else {
        reasons.push(`${criticalCount} CRITICAL severity detection${criticalCount > 1 ? 's' : ''}`);
      }
    } else if (highCount > 0) {
      reasons.push(`${highCount} HIGH severity detection${highCount > 1 ? 's' : ''}`);
    } else if (mediumCount > 0) {
      reasons.push(`${mediumCount} MEDIUM severity detection${mediumCount > 1 ? 's' : ''}`);
    } else if (lowCount > 0) {
      reasons.push(`${lowCount} LOW severity detection${lowCount > 1 ? 's' : ''}`);
    }
    
    // Rule diversity reason
    const uniqueRules = signalSummary.uniqueRules;
    if (uniqueRules === 1) {
      reasons.push(`Single detection rule (limited independence)`);
    } else if (uniqueRules === 2) {
      reasons.push(`${uniqueRules} distinct detection rules`);
    } else {
      reasons.push(`${uniqueRules} distinct detection rules (independent confirmation)`);
    }
    
    // Temporal density reason (if significant)
    if (factors.temporalDensity.value >= 0.7) {
      reasons.push(`Detections clustered in time (sustained issue)`);
    } else if (factors.temporalDensity.value <= 0.3) {
      reasons.push(`Detections spread across window`);
    }
    
    // Signal volume reason
    const signalCount = signalSummary.signalCount;
    if (signalCount >= 10) {
      reasons.push(`${signalCount} signals observed (strong volume)`);
    } else if (signalCount >= 5) {
      reasons.push(`${signalCount} signals observed`);
    } else if (signalCount <= 2) {
      reasons.push(`${signalCount} signal${signalCount > 1 ? 's' : ''} observed (limited volume)`);
    }
    
    return reasons;
  }
}
