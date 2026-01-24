/**
 * CP-3: Detection Rule Schema
 * 
 * Rules are DATA, not code.
 * Changing a rule = new version.
 * 
 * INVARIANTS:
 * - Rules are declarative (YAML/JSON)
 * - Rules are versioned (semantic versioning)
 * - Rules are immutable at runtime
 * - Numeric thresholds require justification
 */

import { z } from 'zod';

/**
 * Condition Operators
 * Fixed set for determinism - no custom operators allowed
 */
export const ConditionOperatorSchema = z.enum([
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'greater_than',
  'less_than',
  'greater_than_or_equals',
  'less_than_or_equals',
  'exists',
  'not_exists',
  'in',
  'not_in',
  'matches_regex',
]);

export type ConditionOperator = z.infer<typeof ConditionOperatorSchema>;

/**
 * Severity levels
 */
export const SeveritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);
export type Severity = z.infer<typeof SeveritySchema>;

/**
 * Confidence levels
 */
export const ConfidenceSchema = z.enum(['DEFINITIVE', 'HIGH', 'MEDIUM', 'LOW']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/**
 * Signal Matcher
 * Determines which signals a rule applies to.
 * All specified arrays use OR logic within, AND logic between.
 */
export const SignalMatcherSchema = z.object({
  signalTypes: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  severities: z.array(SeveritySchema).optional(),
  confidences: z.array(ConfidenceSchema).optional(),
}).strict();

export type SignalMatcher = z.infer<typeof SignalMatcherSchema>;

/**
 * Condition
 * Single evaluation condition.
 */
export const ConditionSchema = z.object({
  conditionId: z.string().min(1),
  field: z.string().min(1),
  operator: ConditionOperatorSchema,
  value: z.any(),
}).strict();

export type Condition = z.infer<typeof ConditionSchema>;

/**
 * Threshold Justification
 * REQUIRED for any numeric threshold.
 */
export const ThresholdJustificationSchema = z.object({
  field: z.string().min(1),
  threshold: z.number(),
  source: z.string().min(1),
  rationale: z.string().min(1),
  owner: z.string().min(1),
}).strict();

export type ThresholdJustification = z.infer<typeof ThresholdJustificationSchema>;

/**
 * Detection Rule
 * 
 * Rules are data, not code.
 * Empty conditions array = unconditional match for signals that pass matcher.
 */
export const DetectionRuleSchema = z.object({
  // Identity
  ruleId: z.string().min(1),
  ruleVersion: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semantic (e.g., 1.0.0)'),
  
  // Metadata
  name: z.string().min(1),
  description: z.string().min(1),
  owner: z.string().min(1),
  createdAt: z.string().datetime().optional(),
  
  // Matching criteria
  signalMatcher: SignalMatcherSchema,
  conditions: z.array(ConditionSchema),  // Empty = unconditional match
  
  // Output
  outputSeverity: SeveritySchema,
  outputConfidence: ConfidenceSchema,
  
  // Threshold justification (MANDATORY for numeric thresholds)
  thresholdJustifications: z.array(ThresholdJustificationSchema).optional(),
}).strict();

export type DetectionRule = z.infer<typeof DetectionRuleSchema>;

/**
 * Validate that numeric thresholds have justifications
 */
export function validateThresholdJustifications(rule: DetectionRule): string[] {
  const errors: string[] = [];
  
  const numericOperators = [
    'greater_than',
    'less_than',
    'greater_than_or_equals',
    'less_than_or_equals',
  ];
  
  for (const condition of rule.conditions) {
    if (numericOperators.includes(condition.operator) && typeof condition.value === 'number') {
      const hasJustification = rule.thresholdJustifications?.some(
        j => j.field === condition.field && j.threshold === condition.value
      );
      
      if (!hasJustification) {
        errors.push(
          `Numeric threshold for field '${condition.field}' (${condition.value}) requires justification`
        );
      }
    }
  }
  
  return errors;
}

/**
 * Parse and validate a detection rule
 * Fails fast on unknown fields (strict mode)
 */
export function parseDetectionRule(data: unknown): DetectionRule {
  const rule = DetectionRuleSchema.parse(data);
  
  // Validate threshold justifications
  const errors = validateThresholdJustifications(rule);
  if (errors.length > 0) {
    throw new Error(`Threshold justification errors: ${errors.join('; ')}`);
  }
  
  return rule;
}
