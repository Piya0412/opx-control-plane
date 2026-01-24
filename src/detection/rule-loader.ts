/**
 * CP-3: Rule Loader
 * 
 * Loads rules by version. Immutable at runtime.
 * 
 * INVARIANTS:
 * - Rules loaded once at startup
 * - Immutable at runtime (no modifications)
 * - Explicit version required for detection
 * - loadLatestRule() is for TOOLING ONLY
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { DetectionRule, parseDetectionRule, SignalMatcher } from './rule-schema.js';
import { NormalizedSignal } from '../normalization/normalized-signal.schema.js';

/**
 * Rule Loader
 * 
 * Loads and caches detection rules from YAML files.
 */
export class RuleLoader {
  private rules: Map<string, DetectionRule> = new Map();
  private rulesBySignalType: Map<string, DetectionRule[]> = new Map();
  private allRules: DetectionRule[] = [];
  
  /**
   * Create a rule loader
   * 
   * @param rulesDir - Directory containing rule YAML files
   */
  constructor(private rulesDir: string) {}
  
  /**
   * Load all rules from the rules directory
   * 
   * Call once at startup. Rules are immutable after loading.
   */
  loadAllRules(): void {
    this.rules.clear();
    this.rulesBySignalType.clear();
    this.allRules = [];
    
    if (!fs.existsSync(this.rulesDir)) {
      console.warn(`Rules directory not found: ${this.rulesDir}`);
      return;
    }
    
    const files = fs.readdirSync(this.rulesDir);
    
    for (const file of files) {
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) {
        continue;
      }
      
      const filePath = path.join(this.rulesDir, file);
      
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = yaml.parse(content);
        
        // Strict parsing - fails fast on unknown fields
        const rule = parseDetectionRule(data);
        
        // Store by composite key: ruleId@version
        const key = `${rule.ruleId}@${rule.ruleVersion}`;
        this.rules.set(key, rule);
        this.allRules.push(rule);
        
        // Index by signal types for faster lookup
        if (rule.signalMatcher.signalTypes) {
          for (const signalType of rule.signalMatcher.signalTypes) {
            const existing = this.rulesBySignalType.get(signalType) || [];
            existing.push(rule);
            this.rulesBySignalType.set(signalType, existing);
          }
        }
        
        console.log(`Loaded rule: ${key}`);
        
      } catch (error) {
        console.error(`Failed to load rule from ${file}:`, error);
        throw error; // Fail fast on invalid rules
      }
    }
    
    console.log(`Loaded ${this.allRules.length} rules from ${this.rulesDir}`);
  }
  
  /**
   * Load a specific rule version
   * 
   * REQUIRED for detection - always use explicit version.
   * 
   * @param ruleId - Rule identifier
   * @param ruleVersion - Semantic version (e.g., "1.0.0")
   * @returns Rule or null if not found
   */
  loadRule(ruleId: string, ruleVersion: string): DetectionRule | null {
    const key = `${ruleId}@${ruleVersion}`;
    return this.rules.get(key) || null;
  }
  
  /**
   * List all applicable rules for a signal
   * 
   * FULL MATCHER EVALUATION - not just signalType.
   * RuleEvaluator must NEVER see a rule that shouldn't apply.
   * 
   * @param signal - Normalized signal to match
   * @returns Array of applicable rules
   */
  listApplicableRules(signal: NormalizedSignal): DetectionRule[] {
    return this.allRules.filter(rule => this.matchesSignal(rule.signalMatcher, signal));
  }
  
  /**
   * Check if a signal matches a rule's signal matcher
   * 
   * All specified arrays use OR logic within, AND logic between.
   */
  private matchesSignal(matcher: SignalMatcher, signal: NormalizedSignal): boolean {
    // Match signalType (if specified)
    if (matcher.signalTypes && matcher.signalTypes.length > 0) {
      if (!matcher.signalTypes.includes(signal.signalType)) {
        return false;
      }
    }
    
    // Match source (if specified)
    if (matcher.sources && matcher.sources.length > 0) {
      if (!matcher.sources.includes(signal.source)) {
        return false;
      }
    }
    
    // Match normalizedSeverity (if specified)
    if (matcher.severities && matcher.severities.length > 0) {
      // Use normalizedSeverity field for matching
      const normalizedSeverity = (signal as any).normalizedSeverity || signal.severity;
      if (!matcher.severities.includes(normalizedSeverity as any)) {
        return false;
      }
    }
    
    // Match confidence (if specified)
    if (matcher.confidences && matcher.confidences.length > 0) {
      if (!matcher.confidences.includes(signal.confidence as any)) {
        return false;
      }
    }
    
    return true; // All matchers passed
  }
  
  /**
   * List all versions of a rule
   * 
   * @param ruleId - Rule identifier
   * @returns Array of version strings, sorted descending
   */
  listRuleVersions(ruleId: string): string[] {
    const versions: string[] = [];
    
    for (const rule of Array.from(this.rules.values())) {
      if (rule.ruleId === ruleId) {
        versions.push(rule.ruleVersion);
      }
    }
    
    // Sort by semantic version (descending)
    return versions.sort((a, b) => {
      const [aMajor, aMinor, aPatch] = a.split('.').map(Number);
      const [bMajor, bMinor, bPatch] = b.split('.').map(Number);
      
      if (bMajor !== aMajor) return bMajor - aMajor;
      if (bMinor !== aMinor) return bMinor - aMinor;
      return bPatch - aPatch;
    });
  }
  
  /**
   * Load latest version of a rule
   * 
   * ⚠️ TOOLING ONLY - NEVER USE IN DETECTION ENGINE
   * 
   * This violates replay determinism if used in detection.
   * 
   * @param ruleId - Rule identifier
   * @returns Latest rule version or null
   */
  loadLatestRule(ruleId: string): DetectionRule | null {
    const versions = this.listRuleVersions(ruleId);
    
    if (versions.length === 0) {
      return null;
    }
    
    return this.loadRule(ruleId, versions[0]);
  }
  
  /**
   * Get all loaded rules
   * 
   * For tooling and debugging only.
   */
  getAllRules(): DetectionRule[] {
    return [...this.allRules];
  }
}
