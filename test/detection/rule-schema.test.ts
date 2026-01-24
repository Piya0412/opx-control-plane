/**
 * CP-3: Rule Schema Tests
 */

import { describe, it, expect } from 'vitest';
import {
  DetectionRuleSchema,
  parseDetectionRule,
  validateThresholdJustifications,
} from '../../src/detection/rule-schema.js';

describe('CP-3: Rule Schema', () => {
  describe('DetectionRuleSchema', () => {
    it('should validate a valid rule', () => {
      const rule = {
        ruleId: 'test-rule',
        ruleVersion: '1.0.0',
        name: 'Test Rule',
        description: 'A test rule',
        owner: 'test-team',
        signalMatcher: {
          signalTypes: ['alarm-test'],
        },
        conditions: [],
        outputSeverity: 'HIGH',
        outputConfidence: 'DEFINITIVE',
      };

      const result = DetectionRuleSchema.safeParse(rule);
      expect(result.success).toBe(true);
    });

    it('should reject invalid version format', () => {
      const rule = {
        ruleId: 'test-rule',
        ruleVersion: 'v1.0.0', // Invalid - should be "1.0.0"
        name: 'Test Rule',
        description: 'A test rule',
        owner: 'test-team',
        signalMatcher: {},
        conditions: [],
        outputSeverity: 'HIGH',
        outputConfidence: 'DEFINITIVE',
      };

      const result = DetectionRuleSchema.safeParse(rule);
      expect(result.success).toBe(false);
    });

    it('should reject unknown fields (strict mode)', () => {
      const rule = {
        ruleId: 'test-rule',
        ruleVersion: '1.0.0',
        name: 'Test Rule',
        description: 'A test rule',
        owner: 'test-team',
        signalMatcher: {},
        conditions: [],
        outputSeverity: 'HIGH',
        outputConfidence: 'DEFINITIVE',
        unknownField: 'should fail', // Unknown field
      };

      const result = DetectionRuleSchema.safeParse(rule);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const rule = {
        ruleId: 'test-rule',
        // Missing ruleVersion, name, description, owner
        signalMatcher: {},
        conditions: [],
        outputSeverity: 'HIGH',
        outputConfidence: 'DEFINITIVE',
      };

      const result = DetectionRuleSchema.safeParse(rule);
      expect(result.success).toBe(false);
    });

    it('should validate conditions', () => {
      const rule = {
        ruleId: 'test-rule',
        ruleVersion: '1.0.0',
        name: 'Test Rule',
        description: 'A test rule',
        owner: 'test-team',
        signalMatcher: {},
        conditions: [
          {
            conditionId: 'cond-1',
            field: 'severity',
            operator: 'equals',
            value: 'HIGH',
          },
        ],
        outputSeverity: 'HIGH',
        outputConfidence: 'DEFINITIVE',
      };

      const result = DetectionRuleSchema.safeParse(rule);
      expect(result.success).toBe(true);
    });

    it('should reject invalid operator', () => {
      const rule = {
        ruleId: 'test-rule',
        ruleVersion: '1.0.0',
        name: 'Test Rule',
        description: 'A test rule',
        owner: 'test-team',
        signalMatcher: {},
        conditions: [
          {
            conditionId: 'cond-1',
            field: 'severity',
            operator: 'invalid_operator', // Invalid
            value: 'HIGH',
          },
        ],
        outputSeverity: 'HIGH',
        outputConfidence: 'DEFINITIVE',
      };

      const result = DetectionRuleSchema.safeParse(rule);
      expect(result.success).toBe(false);
    });
  });

  describe('validateThresholdJustifications', () => {
    it('should pass when no numeric thresholds', () => {
      const rule = parseDetectionRule({
        ruleId: 'test-rule',
        ruleVersion: '1.0.0',
        name: 'Test Rule',
        description: 'A test rule',
        owner: 'test-team',
        signalMatcher: {},
        conditions: [
          {
            conditionId: 'cond-1',
            field: 'severity',
            operator: 'equals',
            value: 'HIGH',
          },
        ],
        outputSeverity: 'HIGH',
        outputConfidence: 'DEFINITIVE',
      });

      const errors = validateThresholdJustifications(rule);
      expect(errors).toHaveLength(0);
    });

    it('should fail when numeric threshold lacks justification', () => {
      const rule = {
        ruleId: 'test-rule',
        ruleVersion: '1.0.0',
        name: 'Test Rule',
        description: 'A test rule',
        owner: 'test-team',
        signalMatcher: {},
        conditions: [
          {
            conditionId: 'cond-1',
            field: 'errorRate',
            operator: 'greater_than',
            value: 5, // Numeric threshold without justification
          },
        ],
        outputSeverity: 'HIGH',
        outputConfidence: 'DEFINITIVE',
      };

      // parseDetectionRule should throw
      expect(() => parseDetectionRule(rule)).toThrow('Threshold justification');
    });

    it('should pass when numeric threshold has justification', () => {
      const rule = parseDetectionRule({
        ruleId: 'test-rule',
        ruleVersion: '1.0.0',
        name: 'Test Rule',
        description: 'A test rule',
        owner: 'test-team',
        signalMatcher: {},
        conditions: [
          {
            conditionId: 'cond-1',
            field: 'errorRate',
            operator: 'greater_than',
            value: 5,
          },
        ],
        outputSeverity: 'HIGH',
        outputConfidence: 'DEFINITIVE',
        thresholdJustifications: [
          {
            field: 'errorRate',
            threshold: 5,
            source: 'SRE handbook',
            rationale: '5% error rate indicates service degradation',
            owner: 'platform-team',
          },
        ],
      });

      const errors = validateThresholdJustifications(rule);
      expect(errors).toHaveLength(0);
    });
  });
});
