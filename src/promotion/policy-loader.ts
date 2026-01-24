/**
 * CP-6: Policy Loader
 * 
 * Loads and validates promotion policies from filesystem.
 * 
 * INVARIANTS:
 * - Policies are immutable once loaded
 * - Version is required (no "latest" at runtime)
 * - Invalid policies throw (fail-closed)
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { PromotionPolicy, validatePromotionPolicy, getPolicyKey } from './policy.schema.js';

export interface PolicyLoaderConfig {
  policiesDir: string;
}

/**
 * Policy Loader
 * 
 * Loads versioned promotion policies from YAML files.
 */
export class PolicyLoader {
  private readonly policiesDir: string;
  private readonly policyCache = new Map<string, PromotionPolicy>();

  constructor(config: PolicyLoaderConfig) {
    this.policiesDir = config.policiesDir;
  }

  /**
   * Load specific policy by ID and version
   * 
   * @param policyId - Policy ID
   * @param version - Policy version (required, no implicit "latest")
   * @returns Promotion policy
   * @throws Error if policy not found or invalid
   */
  loadPolicy(policyId: string, version: string): PromotionPolicy {
    const policyKey = getPolicyKey(policyId, version);
    
    // Check cache first
    if (this.policyCache.has(policyKey)) {
      return this.policyCache.get(policyKey)!;
    }

    // Load from filesystem
    const filename = `${policyId}.v${version}.yaml`;
    const filepath = join(this.policiesDir, filename);

    let rawContent: string;
    try {
      rawContent = readFileSync(filepath, 'utf-8');
    } catch (error) {
      throw new Error(`Policy not found: ${policyKey} (${filepath})`);
    }

    // Parse YAML
    let rawPolicy: unknown;
    try {
      rawPolicy = parseYaml(rawContent);
    } catch (error) {
      throw new Error(`Invalid YAML in policy ${policyKey}: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Validate policy
    const validation = validatePromotionPolicy(rawPolicy);
    if (!validation.valid) {
      throw new Error(`Invalid policy ${policyKey}: ${validation.errors?.join(', ')}`);
    }

    const policy = validation.policy!;

    // Verify policy ID and version match filename
    if (policy.id !== policyId) {
      throw new Error(`Policy ID mismatch: expected '${policyId}', got '${policy.id}' in ${filename}`);
    }
    if (policy.version !== version) {
      throw new Error(`Policy version mismatch: expected '${version}', got '${policy.version}' in ${filename}`);
    }

    // Cache and return
    this.policyCache.set(policyKey, policy);
    return policy;
  }

  /**
   * Load all policies from directory
   * 
   * @returns Array of all policies
   * @throws Error if any policy is invalid
   */
  loadAllPolicies(): PromotionPolicy[] {
    const policies: PromotionPolicy[] = [];
    
    try {
      const files = readdirSync(this.policiesDir);
      
      for (const file of files) {
        if (!file.endsWith('.yaml') && !file.endsWith('.yml')) {
          continue;
        }

        // Parse filename: policyId.vVersion.yaml
        const match = file.match(/^(.+)\.v(\d+\.\d+\.\d+)\.(yaml|yml)$/);
        if (!match) {
          console.warn(`Skipping policy file with invalid name format: ${file}`);
          continue;
        }

        const [, policyId, version] = match;
        
        try {
          const policy = this.loadPolicy(policyId, version);
          policies.push(policy);
        } catch (error) {
          throw new Error(`Failed to load policy ${file}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Failed to load policy')) {
        throw error; // Re-throw policy loading errors
      }
      throw new Error(`Failed to read policies directory ${this.policiesDir}: ${error instanceof Error ? error.message : String(error)}`);
    }

    return policies;
  }

  /**
   * Get latest version of a policy
   * 
   * @param policyId - Policy ID
   * @returns Latest policy version
   * @throws Error if no versions found
   */
  getLatestPolicy(policyId: string): PromotionPolicy {
    const allPolicies = this.loadAllPolicies();
    const policyVersions = allPolicies
      .filter(p => p.id === policyId)
      .sort((a, b) => this.compareVersions(b.version, a.version)); // Descending order

    if (policyVersions.length === 0) {
      throw new Error(`No versions found for policy: ${policyId}`);
    }

    return policyVersions[0];
  }

  /**
   * Check if policy exists
   * 
   * @param policyId - Policy ID
   * @param version - Policy version
   * @returns True if policy exists
   */
  policyExists(policyId: string, version: string): boolean {
    try {
      this.loadPolicy(policyId, version);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear policy cache
   * 
   * Useful for testing or hot-reloading policies.
   */
  clearCache(): void {
    this.policyCache.clear();
  }

  /**
   * Compare semantic versions
   * 
   * @param a - Version A
   * @param b - Version B
   * @returns -1 if a < b, 0 if a === b, 1 if a > b
   */
  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if (aParts[i] > bParts[i]) return 1;
      if (aParts[i] < bParts[i]) return -1;
    }

    return 0;
  }
}