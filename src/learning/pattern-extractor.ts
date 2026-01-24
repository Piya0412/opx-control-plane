/**
 * Phase 4 - Step 4: Pattern Extractor
 * 
 * OFFLINE-ONLY: Extracts patterns from historical outcomes.
 * No live system impact. Read-only analysis.
 * 
 * CRITICAL RULES:
 * - summaryId is deterministic (SHA256)
 * - Percentages are NOT stored (computed at read-time)
 * - detectionWarnings are informational only (no automated action)
 */

import { createHash } from 'crypto';
import type { OutcomeStore } from './outcome-store';
import type { ResolutionSummaryStore } from './resolution-summary-store';
import type { IncidentOutcome } from './outcome.schema';
import type {
  ResolutionSummary,
  SummaryMetrics,
  SummaryPatterns,
  PatternItem,
} from './resolution-summary.schema';

/**
 * Pattern Extractor
 * 
 * OFFLINE-ONLY: Extracts patterns from historical outcomes.
 * No live system impact. Read-only analysis.
 */
export class PatternExtractor {
  constructor(
    private readonly outcomeStore: OutcomeStore,
    private readonly summaryStore: ResolutionSummaryStore
  ) {}
  
  /**
   * Extract patterns for a service
   * 
   * @param service - Service name (optional, undefined = all services)
   * @param startDate - Start date (ISO-8601)
   * @param endDate - End date (ISO-8601)
   * @returns Resolution summary
   */
  async extractPatterns(
    service: string | undefined,
    startDate: string,
    endDate: string
  ): Promise<ResolutionSummary> {
    // Step 1: Load outcomes
    const outcomes = await this.outcomeStore.listOutcomes({
      service,
      startDate,
      endDate,
    });
    
    if (outcomes.length === 0) {
      // Return empty summary
      return this.createEmptySummary(service, startDate, endDate);
    }
    
    // Step 2: Aggregate metrics
    const metrics = this.aggregateMetrics(outcomes);
    
    // Step 3: Identify patterns
    const patterns = this.identifyPatterns(outcomes);
    
    // Step 4: Generate deterministic summaryId
    const summaryId = this.computeSummaryId(service, startDate, endDate, '1.0.0');
    const generatedAt = new Date().toISOString();
    
    // Step 5: Build summary
    const summary: ResolutionSummary = {
      summaryId,
      service,
      startDate,
      endDate,
      generatedAt,
      metrics,
      patterns,
      version: '1.0.0',
    };
    
    // Step 6: Store summary (idempotent)
    await this.summaryStore.storeSummary(summary);
    
    // Step 7: Return summary
    return summary;
  }
  
  /**
   * Extract patterns for all services
   * 
   * @param startDate - Start date (ISO-8601)
   * @param endDate - End date (ISO-8601)
   * @returns Array of summaries (one per service + one aggregate)
   */
  async extractAllPatterns(
    startDate: string,
    endDate: string
  ): Promise<ResolutionSummary[]> {
    // Load all outcomes
    const allOutcomes = await this.outcomeStore.listOutcomes({
      startDate,
      endDate,
    });
    
    if (allOutcomes.length === 0) {
      return [this.createEmptySummary(undefined, startDate, endDate)];
    }
    
    // Group by service
    const serviceMap = new Map<string, IncidentOutcome[]>();
    for (const outcome of allOutcomes) {
      const service = outcome.service;
      const outcomes = serviceMap.get(service) || [];
      outcomes.push(outcome);
      serviceMap.set(service, outcomes);
    }
    
    // Extract patterns for each service
    const summaries: ResolutionSummary[] = [];
    
    for (const [service, outcomes] of serviceMap.entries()) {
      const summary = await this.extractPatterns(service, startDate, endDate);
      summaries.push(summary);
    }
    
    // Extract aggregate summary (all services)
    const aggregateSummary = await this.extractPatterns(undefined, startDate, endDate);
    summaries.push(aggregateSummary);
    
    return summaries;
  }
  
  /**
   * Aggregate metrics from outcomes
   */
  private aggregateMetrics(outcomes: IncidentOutcome[]): SummaryMetrics {
    const totalIncidents = outcomes.length;
    
    const truePositives = outcomes.filter(
      o => o.classification.truePositive
    ).length;
    
    const falsePositives = outcomes.filter(
      o => o.classification.falsePositive
    ).length;
    
    const totalTTD = outcomes.reduce((sum, o) => sum + o.timing.ttd, 0);
    const averageTTD = totalIncidents > 0 ? totalTTD / totalIncidents : 0;
    
    const totalTTR = outcomes.reduce((sum, o) => sum + o.timing.ttr, 0);
    const averageTTR = totalIncidents > 0 ? totalTTR / totalIncidents : 0;
    
    const totalConfidence = outcomes.reduce(
      (sum, o) => sum + o.humanAssessment.confidenceRating,
      0
    );
    const averageConfidence = totalIncidents > 0 
      ? totalConfidence / totalIncidents 
      : 0;
    
    return {
      totalIncidents,
      truePositives,
      falsePositives,
      averageTTD,
      averageTTR,
      averageConfidence,
    };
  }
  
  /**
   * Identify patterns from outcomes
   */
  private identifyPatterns(outcomes: IncidentOutcome[]): SummaryPatterns {
    // Extract root causes
    const rootCauses = outcomes.map(o => o.classification.rootCause);
    const rootCauseMap = this.groupAndCount(rootCauses);
    
    // Sort by count, take top 10
    const commonRootCauses = Array.from(rootCauseMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([value, count]) => ({
        value,
        count,
        // percentage computed at read-time
      }));
    
    // Extract resolutions
    const resolutions = outcomes.map(o => o.classification.resolutionType);
    const resolutionMap = this.groupAndCount(resolutions);
    
    // Sort by count, take top 10
    const commonResolutions = Array.from(resolutionMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([value, count]) => ({
        value,
        count,
        // percentage computed at read-time
      }));
    
    // Identify detection warnings (services with high FP rate)
    const detectionWarnings = this.extractDetectionWarnings(outcomes);
    
    return {
      commonRootCauses,
      commonResolutions,
      detectionWarnings,
    };
  }
  
  /**
   * Extract detection warnings
   * 
   * CRITICAL: This is informational only. No automated action.
   */
  private extractDetectionWarnings(outcomes: IncidentOutcome[]): string[] {
    // Group by service
    const serviceMap = new Map<string, { total: number; fp: number }>();
    
    for (const outcome of outcomes) {
      const service = outcome.service;
      const stats = serviceMap.get(service) || { total: 0, fp: 0 };
      
      stats.total++;
      if (outcome.classification.falsePositive) {
        stats.fp++;
      }
      
      serviceMap.set(service, stats);
    }
    
    // Find services with FP rate > 30%
    // CRITICAL: This is informational only. No automated action.
    const warnings: string[] = [];
    
    for (const [service, stats] of serviceMap.entries()) {
      const fpRate = stats.fp / stats.total;
      if (fpRate > 0.3) {
        warnings.push(service);
      }
    }
    
    return warnings;
  }
  
  /**
   * Group and count items
   */
  private groupAndCount<T>(items: T[]): Map<T, number> {
    const map = new Map<T, number>();
    
    for (const item of items) {
      const count = map.get(item) || 0;
      map.set(item, count + 1);
    }
    
    return map;
  }
  
  /**
   * Compute deterministic summary ID
   * 
   * LOCKED RULE: summaryId = SHA256(service + ":" + startDate + ":" + endDate + ":" + version)
   */
  private computeSummaryId(
    service: string | undefined,
    startDate: string,
    endDate: string,
    version: string
  ): string {
    const serviceKey = service || 'ALL';
    const input = `${serviceKey}:${startDate}:${endDate}:${version}`;
    const hash = createHash('sha256');
    hash.update(input);
    return hash.digest('hex');
  }
  
  /**
   * Create empty summary
   */
  private createEmptySummary(
    service: string | undefined,
    startDate: string,
    endDate: string
  ): ResolutionSummary {
    const summaryId = this.computeSummaryId(service, startDate, endDate, '1.0.0');
    const generatedAt = new Date().toISOString();
    
    return {
      summaryId,
      service,
      startDate,
      endDate,
      generatedAt,
      metrics: {
        totalIncidents: 0,
        truePositives: 0,
        falsePositives: 0,
        averageTTD: 0,
        averageTTR: 0,
        averageConfidence: 0,
      },
      patterns: {
        commonRootCauses: [],
        commonResolutions: [],
        detectionWarnings: [],
      },
      version: '1.0.0',
    };
  }
}
