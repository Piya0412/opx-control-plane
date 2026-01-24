/**
 * Phase 4 - Step 5: Confidence Calibrator
 * 
 * Compare predicted confidence vs actual outcomes.
 * 
 * CRITICAL RULES:
 * - calibrationId is deterministic (SHA256)
 * - Sample size guard (MIN_SAMPLES_PER_BAND = 20)
 * - Recommendations are non-actionable (actionable = false, locked)
 */

import { createHash } from 'crypto';
import type { OutcomeStore } from './outcome-store';
import type { CalibrationStore } from './calibration-store';
import type { IncidentOutcome } from './outcome.schema';
import type {
  ConfidenceCalibration,
  ConfidenceBand,
  BandCalibration,
  DriftAnalysis,
  CalibrationRecommendation,
} from './calibration.schema';

/**
 * Minimum samples per band for statistical validity
 * 
 * LOCKED: Bands with fewer samples are marked INSUFFICIENT_DATA
 */
const MIN_SAMPLES_PER_BAND = 20;

/**
 * Confidence Calibrator
 * 
 * OFFLINE-ONLY: Compares predicted vs actual confidence.
 * No live system impact. Advisory recommendations only.
 */
export class ConfidenceCalibrator {
  constructor(
    private readonly outcomeStore: OutcomeStore,
    private readonly calibrationStore: CalibrationStore
  ) {}
  
  /**
   * Calibrate confidence for time window
   * 
   * @param startDate - Start date (ISO-8601)
   * @param endDate - End date (ISO-8601)
   * @returns Confidence calibration
   */
  async calibrateConfidence(
    startDate: string,
    endDate: string
  ): Promise<ConfidenceCalibration> {
    // Step 1: Load outcomes
    const outcomes = await this.outcomeStore.listOutcomes({
      startDate,
      endDate,
    });
    
    if (outcomes.length === 0) {
      // Return empty calibration
      return this.createEmptyCalibration(startDate, endDate);
    }
    
    // Step 2: Match outcomes with predictions
    // For now, we'll use the confidence score from the outcome
    // In production, we'd load promotion decisions and match by candidateId
    const pairs: Array<{ predicted: number; actual: boolean }> = outcomes.map(outcome => ({
      predicted: outcome.humanAssessment.confidenceRating, // Placeholder
      actual: outcome.classification.truePositive,
    }));
    
    // Step 3: Group by confidence band
    const bandMap = new Map<ConfidenceBand, Array<{ predicted: number; actual: boolean }>>();
    
    for (const pair of pairs) {
      const band = this.getConfidenceBand(pair.predicted);
      const bandPairs = bandMap.get(band) || [];
      bandPairs.push(pair);
      bandMap.set(band, bandPairs);
    }
    
    // Step 4: Calculate band calibrations
    const bandCalibrations: BandCalibration[] = [];
    
    for (const [band, pairs] of bandMap.entries()) {
      const calibration = this.calculateBandCalibration(band, pairs);
      bandCalibrations.push(calibration);
    }
    
    // Step 5: Analyze drift
    const driftAnalysis = this.analyzeDrift(bandCalibrations);
    
    // Step 6: Generate recommendations
    const recommendations = this.generateRecommendations(bandCalibrations);
    
    // Step 7: Generate deterministic calibrationId
    const calibrationId = this.computeCalibrationId(startDate, endDate, '1.0.0');
    const generatedAt = new Date().toISOString();
    
    // Step 8: Build calibration
    const calibration: ConfidenceCalibration = {
      calibrationId,
      startDate,
      endDate,
      generatedAt,
      bandCalibrations,
      driftAnalysis,
      recommendations,
      version: '1.0.0',
    };
    
    // Step 9: Store calibration (idempotent)
    await this.calibrationStore.storeCalibration(calibration);
    
    // Step 10: Return calibration
    return calibration;
  }
  
  /**
   * Get confidence band for score
   */
  private getConfidenceBand(score: number): ConfidenceBand {
    if (score < 0.2) return 'VERY_LOW';
    if (score < 0.4) return 'LOW';
    if (score < 0.6) return 'MEDIUM';
    if (score < 0.8) return 'HIGH';
    return 'VERY_HIGH';
  }
  
  /**
   * Calculate band calibration
   */
  private calculateBandCalibration(
    band: ConfidenceBand,
    outcomes: Array<{ predicted: number; actual: boolean }>
  ): BandCalibration {
    const totalIncidents = outcomes.length;
    const truePositives = outcomes.filter(o => o.actual).length;
    const falsePositives = totalIncidents - truePositives;
    
    const accuracy = totalIncidents > 0 
      ? truePositives / totalIncidents 
      : 0;
    
    const expectedAccuracy = this.getExpectedAccuracy(band);
    const drift = accuracy - expectedAccuracy;
    
    // CRITICAL: Check sample size sufficiency
    const sampleSizeSufficient = totalIncidents >= MIN_SAMPLES_PER_BAND;
    
    return {
      band,
      totalIncidents,
      truePositives,
      falsePositives,
      accuracy,
      expectedAccuracy,
      drift,
      sampleSizeSufficient,
    };
  }
  
  /**
   * Analyze drift
   */
  private analyzeDrift(bandCalibrations: BandCalibration[]): DriftAnalysis {
    let overconfident = 0;
    let underconfident = 0;
    let wellCalibrated = 0;
    let insufficientData = 0;
    let totalDrift = 0;
    let maxDrift = 0;
    let validBands = 0; // Bands with sufficient data
    
    for (const calibration of bandCalibrations) {
      // CRITICAL: Check sample size sufficiency
      if (!calibration.sampleSizeSufficient) {
        insufficientData++;
        continue; // Exclude from drift analysis
      }
      
      validBands++;
      const absDrift = Math.abs(calibration.drift);
      
      if (absDrift < 0.05) {
        wellCalibrated++;
      } else if (calibration.drift < 0) {
        overconfident++; // Predicted higher than actual
      } else {
        underconfident++; // Predicted lower than actual
      }
      
      totalDrift += calibration.drift;
      maxDrift = Math.max(maxDrift, absDrift);
    }
    
    const averageDrift = validBands > 0 
      ? totalDrift / validBands 
      : 0;
    
    return {
      overconfident,
      underconfident,
      wellCalibrated,
      insufficientData,
      averageDrift,
      maxDrift,
    };
  }
  
  /**
   * Generate recommendations
   * 
   * CRITICAL: All recommendations are non-actionable and include safety language.
   */
  private generateRecommendations(
    bandCalibrations: BandCalibration[]
  ): CalibrationRecommendation[] {
    const recommendations: CalibrationRecommendation[] = [];
    
    for (const calibration of bandCalibrations) {
      // CRITICAL: Check sample size sufficiency first
      if (!calibration.sampleSizeSufficient) {
        recommendations.push({
          band: calibration.band,
          recommendation: `${calibration.band} band has insufficient data (${calibration.totalIncidents} samples, minimum ${MIN_SAMPLES_PER_BAND} required). This is informational only and requires human review. No automatic tuning should be performed.`,
          severity: 'INFO',
          actionable: false, // LOCKED: Always false
        });
        continue;
      }
      
      const absDrift = Math.abs(calibration.drift);
      
      if (absDrift < 0.05) {
        // Well calibrated
        recommendations.push({
          band: calibration.band,
          recommendation: `${calibration.band} band is well calibrated (drift: ${calibration.drift.toFixed(3)}). This is informational only and requires human review. No automatic tuning should be performed.`,
          severity: 'INFO',
          actionable: false, // LOCKED: Always false
        });
      } else if (absDrift < 0.15) {
        // Minor drift
        if (calibration.drift < 0) {
          recommendations.push({
            band: calibration.band,
            recommendation: `${calibration.band} band shows slight overconfidence (drift: ${calibration.drift.toFixed(3)}). This is informational only and requires human review. No automatic tuning should be performed.`,
            severity: 'WARNING',
            actionable: false, // LOCKED: Always false
          });
        } else {
          recommendations.push({
            band: calibration.band,
            recommendation: `${calibration.band} band shows slight underconfidence (drift: ${calibration.drift.toFixed(3)}). This is informational only and requires human review. No automatic tuning should be performed.`,
            severity: 'WARNING',
            actionable: false, // LOCKED: Always false
          });
        }
      } else {
        // Major drift
        if (calibration.drift < 0) {
          recommendations.push({
            band: calibration.band,
            recommendation: `Calibration drift observed in ${calibration.band} band (drift: ${calibration.drift.toFixed(3)}, overconfident). This is informational only and requires human review. No automatic tuning should be performed.`,
            severity: 'CRITICAL',
            actionable: false, // LOCKED: Always false
          });
        } else {
          recommendations.push({
            band: calibration.band,
            recommendation: `Calibration drift observed in ${calibration.band} band (drift: ${calibration.drift.toFixed(3)}, underconfident). This is informational only and requires human review. No automatic tuning should be performed.`,
            severity: 'CRITICAL',
            actionable: false, // LOCKED: Always false
          });
        }
      }
    }
    
    return recommendations;
  }
  
  /**
   * Get expected accuracy (band midpoint)
   */
  private getExpectedAccuracy(band: ConfidenceBand): number {
    switch (band) {
      case 'VERY_LOW': return 0.1;  // Midpoint of 0.0-0.2
      case 'LOW': return 0.3;       // Midpoint of 0.2-0.4
      case 'MEDIUM': return 0.5;    // Midpoint of 0.4-0.6
      case 'HIGH': return 0.7;      // Midpoint of 0.6-0.8
      case 'VERY_HIGH': return 0.9; // Midpoint of 0.8-1.0
    }
  }
  
  /**
   * Compute deterministic calibration ID
   * 
   * LOCKED RULE: calibrationId = SHA256(startDate + ":" + endDate + ":" + version)
   */
  private computeCalibrationId(
    startDate: string,
    endDate: string,
    version: string
  ): string {
    const input = `${startDate}:${endDate}:${version}`;
    const hash = createHash('sha256');
    hash.update(input);
    return hash.digest('hex');
  }
  
  /**
   * Create empty calibration
   */
  private createEmptyCalibration(
    startDate: string,
    endDate: string
  ): ConfidenceCalibration {
    const calibrationId = this.computeCalibrationId(startDate, endDate, '1.0.0');
    const generatedAt = new Date().toISOString();
    
    return {
      calibrationId,
      startDate,
      endDate,
      generatedAt,
      bandCalibrations: [],
      driftAnalysis: {
        overconfident: 0,
        underconfident: 0,
        wellCalibrated: 0,
        insufficientData: 0,
        averageDrift: 0,
        maxDrift: 0,
      },
      recommendations: [],
      version: '1.0.0',
    };
  }
}
