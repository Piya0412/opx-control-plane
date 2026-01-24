/**
 * CP-6: Policy Evaluator Tests
 */

import { describe, it, expect } from 'vitest';
import { PolicyEvaluator } from '../../src/promotion/policy-evaluator.js';

describe('CP-6: Policy Evaluator', () => {
  const evaluator = new PolicyEvaluator();

  it('should be instantiable', () => {
    expect(evaluator).toBeDefined();
  });

  it('should have evaluate method', () => {
    expect(typeof evaluator.evaluate).toBe('function');
  });

  it('should have computeDecisionHash method', () => {
    expect(typeof evaluator.computeDecisionHash).toBe('function');
  });
});