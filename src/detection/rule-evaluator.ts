/**
 * CP-3: Rule Evaluator
 * 
 * Pure evaluation. Produces trace.
 * 
 * INVARIANTS:
 * - Pure function (no side effects)
 * - Deterministic (same input → same output)
 * - Full trace generation
 * - No external dependencies
 */

import { NormalizedSignal } from '../normalization/normalized-signal.schema.js';
import { DetectionRule, Condition, ConditionOperator } from './rule-schema.js';
import { EvaluationStep } from './detection-result.js';
import { getFieldValue } from './field-accessor.js';

/**
 * Maximum trace steps to prevent pathological rules from exploding storage
 */
const MAX_TRACE_STEPS = 20;

/**
 * Evaluation Result
 */
export interface EvaluationResult {
  matches: boolean;
  trace: EvaluationStep[];
}

/**
 * Operator implementations
 * All operators are pure functions.
 */
const OPERATORS: Record<ConditionOperator, (actual: unknown, expected: unknown) => boolean> = {
  equals: (a, e) => a === e,
  not_equals: (a, e) => a !== e,
  contains: (a, e) => typeof a === 'string' && typeof e === 'string' && a.includes(e),
  not_contains: (a, e) => typeof a === 'string' && typeof e === 'string' && !a.includes(e),
  starts_with: (a, e) => typeof a === 'string' && typeof e === 'string' && a.startsWith(e),
  ends_with: (a, e) => typeof a === 'string' && typeof e === 'string' && a.endsWith(e),
  greater_than: (a, e) => typeof a === 'number' && typeof e === 'number' && a > e,
  less_than: (a, e) => typeof a === 'number' && typeof e === 'number' && a < e,
  greater_than_or_equals: (a, e) => typeof a === 'number' && typeof e === 'number' && a >= e,
  less_than_or_equals: (a, e) => typeof a === 'number' && typeof e === 'number' && a <= e,
  exists: (a) => a !== undefined && a !== null,
  not_exists: (a) => a === undefined || a === null,
  in: (a, e) => Array.isArray(e) && e.includes(a),
  not_in: (a, e) => Array.isArray(e) && !e.includes(a),
  matches_regex: (a, e) => {
    if (typeof a !== 'string' || typeof e !== 'string') return false;
    try {
      return new RegExp(e).test(a);
    } catch {
      return false;
    }
  },
};

/**
 * Rule Evaluator
 * 
 * Pure evaluation of a signal against a rule.
 */
export class RuleEvaluator {
  /**
   * Evaluate a signal against a rule
   * 
   * Pure function: same input → same output
   * 
   * @param signal - Normalized signal to evaluate
   * @param rule - Detection rule to apply
   * @returns Evaluation result with trace
   */
  evaluate(signal: NormalizedSignal, rule: DetectionRule): EvaluationResult {
    const trace: EvaluationStep[] = [];
    
    // Empty conditions = unconditional match
    // This is explicit and intentional
    if (rule.conditions.length === 0) {
      return {
        matches: true,
        trace: [{
          stepIndex: 0,
          conditionId: 'UNCONDITIONAL',
          field: '',
          operator: 'unconditional',
          expected: 'match',
          actual: 'match',
          result: true,
        }],
      };
    }
    
    // Evaluate all conditions (AND logic)
    let allMatch = true;
    
    for (const condition of rule.conditions) {
      // Check trace size limit
      if (trace.length >= MAX_TRACE_STEPS) {
        trace.push({
          stepIndex: trace.length,
          conditionId: 'TRUNCATED',
          field: '',
          operator: 'truncated',
          expected: MAX_TRACE_STEPS,
          actual: rule.conditions.length,
          result: false,
        });
        break;
      }
      
      const step = this.evaluateCondition(signal, condition, trace.length);
      trace.push(step);
      
      if (!step.result) {
        allMatch = false;
        // Continue evaluating for full trace (don't short-circuit)
      }
    }
    
    return {
      matches: allMatch,
      trace,
    };
  }
  
  /**
   * Evaluate a single condition
   */
  private evaluateCondition(
    signal: NormalizedSignal,
    condition: Condition,
    stepIndex: number
  ): EvaluationStep {
    const actual = getFieldValue(signal, condition.field);
    const operator = OPERATORS[condition.operator];
    
    if (!operator) {
      // Unknown operator - should never happen with schema validation
      return {
        stepIndex,
        conditionId: condition.conditionId,
        field: condition.field,
        operator: condition.operator,
        expected: condition.value,
        actual,
        result: false,
      };
    }
    
    const result = operator(actual, condition.value);
    
    return {
      stepIndex,
      conditionId: condition.conditionId,
      field: condition.field,
      operator: condition.operator,
      expected: condition.value,
      actual,
      result,
    };
  }
}
