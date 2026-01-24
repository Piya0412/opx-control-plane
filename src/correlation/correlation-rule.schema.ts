/**
 * Correlation Rule Schema
 * 
 * Phase 2.2: Signal Correlation
 * 
 * DESIGN LOCK v1.0.0 — FROZEN
 * 
 * Rules are immutable, versioned, and deterministic.
 * No heuristics, no ML, no implicit logic.
 * 
 * MANDATORY CONSTRAINTS:
 * - Rules are immutable (updates create new versions)
 * - Fixed windows aligned to epoch boundaries
 * - Sliding windows anchored on signal.observedAt
 * - Window boundaries are [start, end) (inclusive-start, exclusive-end)
 * - candidateHash includes: ruleId, ruleVersion, sorted signalIds, normalized groupKey
 */

import { z } from 'zod';
import type { SignalSource, SignalType, SignalSeverity } from '../signal/signal-event.schema.js';

/**
 * Window alignment types
 * 
 * DECISION LOCK 1: Time Window Alignment
 * - fixed: DEFAULT — Aligned to epoch boundaries (compliance, replay, audit)
 * - sliding: OPTIONAL — Anchored on signal.observedAt (near-real-time)
 */
export const WindowAlignmentSchema = z.enum(['fixed', 'sliding']);
export type WindowAlignment = z.infer<typeof WindowAlignmentSchema>;

/**
 * Time window configuration
 * 
 * MANDATORY CONSTRAINTS:
 * - Fixed windows MUST align to epoch boundaries
 * - Sliding windows MUST anchor on signal.observedAt
 * - Late signals included iff observedAt ∈ window (arrival time irrelevant)
 * - Window boundaries are [start, end) (inclusive-start, exclusive-end)
 * 
 * FORBIDDEN:
 * - Window extension
 * - Backfilling windows
 * - Arrival-time-based windows
 */
export const TimeWindowSchema = z.object({
  duration: z.string().regex(/^PT\d+[HMS]$/, 'Must be ISO 8601 duration (e.g., PT5M)'),
  alignment: WindowAlignmentSchema.default('fixed'),
});

export type TimeWindow = z.infer<typeof TimeWindowSchema>;

/**
 * Rule filters
 * 
 * All filters are optional (undefined = match all)
 * Multiple values are OR'd (e.g., ["lambda", "dynamodb"] matches either)
 */
export const RuleFiltersSchema = z.object({
  source: z.array(z.string()).optional(),
  signalType: z.array(z.string()).optional(),
  service: z.array(z.string()).optional(),
  severity: z.array(z.string()).optional(),
});

export type RuleFilters = z.infer<typeof RuleFiltersSchema>;

/**
 * Grouping criteria
 * 
 * Signals are grouped by these dimensions before threshold evaluation
 */
export const GroupBySchema = z.object({
  service: z.boolean().default(true),
  severity: z.boolean().default(true),
  identityWindow: z.boolean().default(false),
});

export type GroupBy = z.infer<typeof GroupBySchema>;

/**
 * Threshold configuration
 * 
 * Determines when to create a candidate from grouped signals
 */
export const ThresholdSchema = z.object({
  minSignals: z.number().int().min(1),
  maxSignals: z.number().int().min(1).optional(),
}).refine(
  (data) => !data.maxSignals || data.maxSignals >= data.minSignals,
  { message: 'maxSignals must be >= minSignals' }
);

export type Threshold = z.infer<typeof ThresholdSchema>;

/**
 * Candidate template
 * 
 * Template variables:
 * - {{signalCount}} — Number of correlated signals
 * - {{service}} — Service name
 * - {{severity}} — Severity level
 * - {{timeWindow}} — Time window duration
 * - {{firstObservedAt}} — Earliest signal timestamp
 * - {{lastObservedAt}} — Latest signal timestamp
 */
export const CandidateTemplateSchema = z.object({
  title: z.string().min(1).max(256),
  description: z.string().min(1).max(2048),
  tags: z.array(z.string()).optional(),
});

export type CandidateTemplate = z.infer<typeof CandidateTemplateSchema>;

/**
 * Correlation Rule
 * 
 * DESIGN LOCK v1.0.0 — FROZEN
 * 
 * MANDATORY CONSTRAINTS:
 * - Rules are immutable (updates create new versions)
 * - Rules are versioned (semantic versioning)
 * - Rules are explicit (no implicit logic)
 * - Rules are deterministic (no randomness)
 * - Rules are replayable (same inputs → same outputs)
 * 
 * FORBIDDEN:
 * - Editing rules in place
 * - Auto-migrating correlation state
 * - Reinterpreting old signals with new rules
 * - Heuristics or ML
 * - Confidence scoring
 * - Severity escalation
 */
export const CorrelationRuleSchema = z.object({
  // Identity
  ruleId: z.string().regex(/^rule-[a-z0-9-]+$/, 'Must match pattern: rule-<id>'),
  ruleName: z.string().min(1).max(256),
  ruleVersion: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be semantic version (e.g., 1.0.0)'),
  
  // Matching criteria
  filters: RuleFiltersSchema,
  
  // Correlation window
  timeWindow: TimeWindowSchema,
  
  // Grouping criteria
  groupBy: GroupBySchema,
  
  // Threshold
  threshold: ThresholdSchema,
  
  // Candidate generation
  candidateTemplate: CandidateTemplateSchema,
  
  // Metadata
  createdAt: z.string().datetime(),
  createdBy: z.string().min(1).max(256),
  enabled: z.boolean().default(true),
  
  // Optional description
  description: z.string().max(2048).optional(),
});

export type CorrelationRule = z.infer<typeof CorrelationRuleSchema>;

/**
 * Validate correlation rule
 * 
 * @param rule - Rule to validate
 * @returns Validated rule or throws ZodError
 */
export function validateCorrelationRule(rule: unknown): CorrelationRule {
  return CorrelationRuleSchema.parse(rule);
}

/**
 * Compute group key from signal and rule
 * 
 * DECISION LOCK 2: Candidate Deduplication
 * 
 * Group key is used for:
 * - Grouping signals within time window
 * - Computing candidate hash
 * - Correlation state partitioning
 * 
 * @param signal - Signal to group
 * @param rule - Correlation rule
 * @returns Normalized group key
 */
export function computeGroupKey(
  signal: { service: string; severity: string; identityWindow: string },
  rule: CorrelationRule
): Record<string, string> {
  const groupKey: Record<string, string> = {};
  
  if (rule.groupBy.service) {
    groupKey.service = signal.service;
  }
  
  if (rule.groupBy.severity) {
    groupKey.severity = signal.severity;
  }
  
  if (rule.groupBy.identityWindow) {
    groupKey.identityWindow = signal.identityWindow;
  }
  
  return groupKey;
}

/**
 * Normalize group key for deterministic hashing
 * 
 * Ensures same group key → same string representation
 * 
 * @param groupKey - Group key to normalize
 * @returns Normalized string
 */
export function normalizeGroupKey(groupKey: Record<string, string>): string {
  const sortedKeys = Object.keys(groupKey).sort();
  const pairs = sortedKeys.map(key => `${key}=${groupKey[key]}`);
  return pairs.join('&');
}

/**
 * Check if signal matches rule filters
 * 
 * MANDATORY: Explicit matching logic, no implicit behavior
 * 
 * @param signal - Signal to check
 * @param rule - Correlation rule
 * @returns True if signal matches all filters
 */
export function signalMatchesRule(
  signal: {
    source: string;
    signalType: string;
    service: string;
    severity: string;
  },
  rule: CorrelationRule
): boolean {
  // Check source filter
  if (rule.filters.source && !rule.filters.source.includes(signal.source)) {
    return false;
  }
  
  // Check signalType filter
  if (rule.filters.signalType && !rule.filters.signalType.includes(signal.signalType)) {
    return false;
  }
  
  // Check service filter
  if (rule.filters.service && !rule.filters.service.includes(signal.service)) {
    return false;
  }
  
  // Check severity filter
  if (rule.filters.severity && !rule.filters.severity.includes(signal.severity)) {
    return false;
  }
  
  return true;
}

/**
 * Parse ISO 8601 duration to milliseconds
 * 
 * Supports: PT<n>S, PT<n>M, PT<n>H
 * 
 * @param duration - ISO 8601 duration string
 * @returns Duration in milliseconds
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^PT(\d+)([HMS])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case 'S':
      return value * 1000;
    case 'M':
      return value * 60 * 1000;
    case 'H':
      return value * 60 * 60 * 1000;
    default:
      throw new Error(`Unsupported duration unit: ${unit}`);
  }
}

/**
 * Compute time window boundaries
 * 
 * DECISION LOCK 1: Time Window Alignment
 * 
 * Fixed windows:
 * - Aligned to epoch boundaries
 * - Example: PT5M → 00:00–00:05, 00:05–00:10
 * 
 * Sliding windows:
 * - Anchored on signal.observedAt
 * - Example: signal at 10:23:45 with PT5M → 10:18:45–10:23:45
 * 
 * Window boundaries are [start, end) (inclusive-start, exclusive-end)
 * 
 * @param observedAt - Signal observed timestamp
 * @param timeWindow - Time window configuration
 * @returns Window boundaries { start, end }
 */
export function computeWindowBoundaries(
  observedAt: string,
  timeWindow: TimeWindow
): { start: string; end: string } {
  const observedDate = new Date(observedAt);
  const durationMs = parseDuration(timeWindow.duration);
  
  if (timeWindow.alignment === 'fixed') {
    // Fixed window: align to epoch boundaries
    const observedMs = observedDate.getTime();
    const windowStart = Math.floor(observedMs / durationMs) * durationMs;
    const windowEnd = windowStart + durationMs;
    
    return {
      start: new Date(windowStart).toISOString(),
      end: new Date(windowEnd).toISOString(),
    };
  } else {
    // Sliding window: anchor on observedAt
    const windowEnd = observedDate.getTime();
    const windowStart = windowEnd - durationMs;
    
    return {
      start: new Date(windowStart).toISOString(),
      end: new Date(windowEnd).toISOString(),
    };
  }
}

