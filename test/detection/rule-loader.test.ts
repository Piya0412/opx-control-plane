/**
 * CP-3: Rule Loader Tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { RuleLoader } from '../../src/detection/rule-loader.js';
import { NormalizedSignal } from '../../src/normalization/normalized-signal.schema.js';

describe('CP-3: Rule Loader', () => {
  let loader: RuleLoader;

  beforeAll(() => {
    const rulesDir = path.join(process.cwd(), 'src', 'detection', 'rules');
    loader = new RuleLoader(rulesDir);
    loader.loadAllRules();
  });

  const createSignal = (overrides: Partial<NormalizedSignal> = {}): NormalizedSignal => ({
    normalizedSignalId: 'test-signal-123',
    sourceSignalId: 'source-123',
    signalType: 'alarm-opx-lambda-error-rate',
    source: 'cloudwatch-alarm',
    severity: 'HIGH',
    confidence: 'DEFINITIVE',
    timestamp: '2026-01-16T10:00:00.000Z',
    resourceRefs: [],
    environmentRefs: [],
    evidenceRefs: [{ evidenceType: 'raw-signal', refId: 'source-123', checksum: 'abc123' }],
    normalizationVersion: 'v1',
    normalizedAt: '2026-01-16T10:00:01.000Z',
    ...overrides,
  });

  describe('loadRule', () => {
    it('should load rule by ID and version', () => {
      const rule = loader.loadRule('lambda-error-rate', '1.0.0');

      expect(rule).not.toBeNull();
      expect(rule?.ruleId).toBe('lambda-error-rate');
      expect(rule?.ruleVersion).toBe('1.0.0');
    });

    it('should return null for non-existent rule', () => {
      const rule = loader.loadRule('non-existent', '1.0.0');

      expect(rule).toBeNull();
    });

    it('should return null for non-existent version', () => {
      const rule = loader.loadRule('lambda-error-rate', '99.0.0');

      expect(rule).toBeNull();
    });
  });

  describe('listApplicableRules', () => {
    it('should find rules matching signal type', () => {
      const signal = createSignal({ signalType: 'alarm-opx-lambda-error-rate' });
      const rules = loader.listApplicableRules(signal);

      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some(r => r.ruleId === 'lambda-error-rate')).toBe(true);
    });

    it('should find rules matching severity', () => {
      const signal = createSignal({ severity: 'CRITICAL', confidence: 'DEFINITIVE' });
      const rules = loader.listApplicableRules(signal);

      // high-severity-signal rule should match
      expect(rules.some(r => r.ruleId === 'high-severity-signal')).toBe(true);
    });

    it('should not match rules with different signal type', () => {
      const signal = createSignal({ signalType: 'metric-cpu-usage' });
      const rules = loader.listApplicableRules(signal);

      // lambda-error-rate should NOT match
      expect(rules.some(r => r.ruleId === 'lambda-error-rate')).toBe(false);
    });

    it('should filter by source', () => {
      const signal = createSignal({ source: 'custom-source' });
      const rules = loader.listApplicableRules(signal);

      // Rules requiring cloudwatch-alarm should not match
      const cloudwatchRules = rules.filter(r => 
        r.signalMatcher.sources?.includes('cloudwatch-alarm')
      );
      expect(cloudwatchRules).toHaveLength(0);
    });

    it('should filter by confidence', () => {
      const signal = createSignal({ 
        severity: 'HIGH', 
        confidence: 'LOW'  // Low confidence
      });
      const rules = loader.listApplicableRules(signal);

      // high-severity-signal requires DEFINITIVE or HIGH confidence
      expect(rules.some(r => r.ruleId === 'high-severity-signal')).toBe(false);
    });
  });

  describe('listRuleVersions', () => {
    it('should list all versions of a rule', () => {
      const versions = loader.listRuleVersions('lambda-error-rate');

      expect(versions).toContain('1.0.0');
    });

    it('should return empty array for non-existent rule', () => {
      const versions = loader.listRuleVersions('non-existent');

      expect(versions).toHaveLength(0);
    });
  });

  describe('loadLatestRule (TOOLING ONLY)', () => {
    it('should load latest version', () => {
      const rule = loader.loadLatestRule('lambda-error-rate');

      expect(rule).not.toBeNull();
      expect(rule?.ruleId).toBe('lambda-error-rate');
    });

    it('should return null for non-existent rule', () => {
      const rule = loader.loadLatestRule('non-existent');

      expect(rule).toBeNull();
    });
  });

  describe('getAllRules', () => {
    it('should return all loaded rules', () => {
      const rules = loader.getAllRules();

      expect(rules.length).toBeGreaterThanOrEqual(5); // We created 5 rules
    });
  });
});
