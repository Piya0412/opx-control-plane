/**
 * CP-5: Correlation Rule Schema
 * 
 * Rules are DATA, not code.
 * Changing a rule = new version.
 * 
 * INVARIANTS:
 * - Rules are versioned
 * - Rules are declarative (YAML)
 * - Rules are immutable at runtime
 * 
 * 🔒 HARDENING #3: Every rule MUST declare windowMinutes + windowTruncation
 */

import { z } from 'zod';

// === WINDOW TRUNCATION ===

export const WindowTruncationSchema = z.enum(['minute', 'hour', 'day']);
export type WindowTruncation = z.infer<typeof WindowTruncationSchema>;

// === PRIMARY SELECTION ===

/**
 * 🔒 HARDENING #2: Fixed selection strategy
 * Total-order deterministic:
 * 1. Highest severity (SEV1 > SEV2 > SEV3 > SEV4)
 * 2. If tie → earliest timestamp
 * 3. If tie → lexicographically smallest detectionId
 */
export const PrimarySelectionSchema = z.enum([
  'HIGHEST_SEVERITY_THEN_EARLIEST_THEN_LEXICAL',
]);
export type PrimarySelection = z.infer<typeof PrimarySelectionSchema>;

// === MATCHER ===

export const CorrelationMatcherSchema = z.object({
  // What to match on
  sameService: z.boolean().optional(),
  sameSource: z.boolean().optional(),
  sameRuleId: z.boolean().optional(),
  signalTypes: z.array(z.string()).optional(),
  severities: z.array(z.enum(['SEV1', 'SEV2', 'SEV3', 'SEV4'])).optional(),

  // 🔒 HARDENING #3: Rule-local window (REQUIRED)
  windowMinutes: z.number().int().positive().max(1440), // Max 24 hours
  windowTruncation: WindowTruncationSchema,

  // Bounds
  minDetections: z.number().int().positive().default(1),
  maxDetections: z.number().int().positive().max(100).default(100),
}).strict();

export type CorrelationMatcher = z.infer<typeof CorrelationMatcherSchema>;

// === KEY FIELDS ===

export const KeyFieldSchema = z.enum([
  'service',
  'source',
  'ruleId',
  'signalType',
  'windowTruncated',
]);
export type KeyField = z.infer<typeof KeyFieldSchema>;

// === CONFIDENCE BOOST ===

export const ConfidenceBoostSchema = z.object({
  multipleDetections: z.number().min(0).max(0.5).optional(),
  highSeverityRule: z.number().min(0).max(0.5).optional(),
  highConfidenceDetections: z.number().min(0).max(0.5).optional(),
}).strict();

export type ConfidenceBoost = z.infer<typeof ConfidenceBoostSchema>;

// === CORRELATION RULE ===

export const CorrelationRuleSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().min(1),

  matcher: CorrelationMatcherSchema,
  keyFields: z.array(KeyFieldSchema).min(1),

  // 🔒 HARDENING #2: Fixed selection strategy
  primarySelection: PrimarySelectionSchema,

  confidenceBoost: ConfidenceBoostSchema.optional(),

  // Metadata
  owner: z.string().optional(),
  createdAt: z.string().datetime().optional(),
}).strict();

export type CorrelationRule = z.infer<typeof CorrelationRuleSchema>;

/**
 * Validate correlation rule
 * 
 * Strict parsing - fails fast on unknown fields.
 */
export function parseCorrelationRule(data: unknown): CorrelationRule {
  return CorrelationRuleSchema.parse(data);
}
