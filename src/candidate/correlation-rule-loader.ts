/**
 * CP-5: Correlation Rule Loader
 * 
 * Loads correlation rules from YAML files.
 * Rules are DATA, not code.
 * 
 * INVARIANTS:
 * - Rules are loaded by ID + version
 * - Rules are immutable at runtime
 * - Invalid rules fail fast
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { CorrelationRule, CorrelationRuleSchema } from './correlation-rule.schema.js';

export interface CorrelationRuleLoader {
  /**
   * Load rule by ID and version
   * 
   * @throws if rule not found or invalid
   */
  loadRule(ruleId: string, version: string): CorrelationRule;

  /**
   * List all available rules
   */
  listRules(): Array<{ id: string; version: string }>;

  /**
   * Load all rules (for batch processing)
   */
  loadAllRules(): CorrelationRule[];
}

/**
 * File-based correlation rule loader
 * 
 * Loads rules from YAML files in a directory.
 * Filename format: {ruleId}.v{version}.yaml
 */
export class FileCorrelationRuleLoader implements CorrelationRuleLoader {
  private readonly rulesDir: string;

  constructor(rulesDir: string = 'correlation-rules') {
    this.rulesDir = rulesDir;
  }

  loadRule(ruleId: string, version: string): CorrelationRule {
    const filename = `${ruleId}.v${version}.yaml`;
    const filepath = path.join(this.rulesDir, filename);

    if (!fs.existsSync(filepath)) {
      throw new Error(`Correlation rule not found: ${ruleId}@${version}`);
    }

    const content = fs.readFileSync(filepath, 'utf-8');
    const parsed = yaml.parse(content);

    // Support both wrapped and unwrapped formats
    const ruleData = parsed.correlationRule || parsed;

    // Validate with Zod (strict mode)
    const result = CorrelationRuleSchema.safeParse(ruleData);
    if (!result.success) {
      throw new Error(
        `Invalid correlation rule ${ruleId}@${version}: ${result.error.message}`
      );
    }

    // Verify ID and version match filename
    if (result.data.id !== ruleId || result.data.version !== version) {
      throw new Error(
        `Rule ID/version mismatch in ${filename}: ` +
        `expected ${ruleId}@${version}, got ${result.data.id}@${result.data.version}`
      );
    }

    return result.data;
  }

  listRules(): Array<{ id: string; version: string }> {
    if (!fs.existsSync(this.rulesDir)) {
      return [];
    }

    const files = fs.readdirSync(this.rulesDir).filter(f => f.endsWith('.yaml'));

    return files
      .map(f => {
        const match = f.match(/^([a-z][a-z0-9-]*)\.v(\d+\.\d+\.\d+)\.yaml$/);
        if (!match) return null;
        return { id: match[1], version: match[2] };
      })
      .filter((r): r is { id: string; version: string } => r !== null);
  }

  loadAllRules(): CorrelationRule[] {
    return this.listRules().map(r => this.loadRule(r.id, r.version));
  }
}

/**
 * In-memory correlation rule loader
 * 
 * For testing purposes.
 */
export class InMemoryCorrelationRuleLoader implements CorrelationRuleLoader {
  private readonly rules: Map<string, CorrelationRule> = new Map();

  addRule(rule: CorrelationRule): void {
    const key = `${rule.id}@${rule.version}`;
    this.rules.set(key, rule);
  }

  loadRule(ruleId: string, version: string): CorrelationRule {
    const key = `${ruleId}@${version}`;
    const rule = this.rules.get(key);
    if (!rule) {
      throw new Error(`Correlation rule not found: ${ruleId}@${version}`);
    }
    return rule;
  }

  listRules(): Array<{ id: string; version: string }> {
    return Array.from(this.rules.values()).map(r => ({
      id: r.id,
      version: r.version,
    }));
  }

  loadAllRules(): CorrelationRule[] {
    return Array.from(this.rules.values());
  }

  clear(): void {
    this.rules.clear();
  }
}
