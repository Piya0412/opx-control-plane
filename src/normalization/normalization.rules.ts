/**
 * CP-2: Normalization Rules
 * 
 * Pure, deterministic transformation functions.
 * No state. No side effects. No inference.
 * 
 * RULES:
 * - All functions are pure (same input → same output)
 * - No external dependencies
 * - No inference or heuristics
 * - Explicit field extraction only
 */

import { createHash } from 'crypto';
import { Signal } from '../signals/signal-types.js';
import { ResourceRef, EnvironmentRef, EvidenceRef } from './normalized-signal.schema.js';
import { NORMALIZATION_VERSION } from './normalization.version.js';

/**
 * Compute deterministic normalized signal ID
 * 
 * Formula: SHA256(normalizationVersion + sourceSignalId + signalType + timestamp)
 * 
 * INVARIANT: Same inputs → same ID
 */
export function computeNormalizedSignalId(
  sourceSignalId: string,
  signalType: string,
  timestamp: string
): string {
  const input = `${NORMALIZATION_VERSION}|${sourceSignalId}|${signalType}|${timestamp}`;
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Canonicalize timestamp to ISO-8601 UTC
 * 
 * Rule: Ensure consistent format
 */
export function canonicalizeTimestamp(timestamp: string): string {
  // Already ISO-8601 from CP-1, pass through
  return timestamp;
}

/**
 * Canonicalize signal type to lowercase kebab-case
 * 
 * Rule: Consistent casing for downstream processing
 */
export function canonicalizeSignalType(signalType: string): string {
  return signalType.toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
}

/**
 * Extract resource references from CP-1 signal
 * 
 * RULES:
 * - Only extract from explicit fields
 * - No inference from names
 * - No parsing
 * - Absence is acceptable
 */
export function extractResourceRefs(signal: Signal): ResourceRef[] {
  const refs: ResourceRef[] = [];
  
  // Extract AWS ARNs from tags
  if (signal.tags?.alarmArn) {
    refs.push({
      refType: 'aws-arn',
      refValue: signal.tags.alarmArn,
      sourceField: 'tags.alarmArn',
    });
  }
  
  // Extract resource names from tags
  if (signal.tags?.metricName) {
    refs.push({
      refType: 'name',
      refValue: signal.tags.metricName,
      sourceField: 'tags.metricName',
    });
  }
  
  // Extract resource IDs from dimensions
  if (signal.dimensions?.resourceId) {
    refs.push({
      refType: 'id',
      refValue: signal.dimensions.resourceId,
      sourceField: 'dimensions.resourceId',
    });
  }
  
  return refs;
}

/**
 * Extract environment references from CP-1 signal
 * 
 * RULES:
 * - Only extract from explicit fields
 * - No inference from service names
 * - Absence is acceptable
 */
export function extractEnvironmentRefs(signal: Signal): EnvironmentRef[] {
  const refs: EnvironmentRef[] = [];
  
  // Extract account from tags
  if (signal.tags?.account) {
    refs.push({
      envType: 'account',
      value: signal.tags.account,
      sourceField: 'tags.account',
    });
  }
  
  // Extract region from tags
  if (signal.tags?.region) {
    refs.push({
      envType: 'region',
      value: signal.tags.region,
      sourceField: 'tags.region',
    });
  }
  
  // Extract stage from dimensions (if explicitly present)
  if (signal.dimensions?.stage) {
    refs.push({
      envType: 'stage',
      value: signal.dimensions.stage,
      sourceField: 'dimensions.stage',
    });
  }
  
  return refs;
}

/**
 * Extract evidence references from CP-1 signal
 * 
 * RULES:
 * - Pointer only (no duplication)
 * - No summaries
 * - No aggregation
 */
export function extractEvidenceRefs(signal: Signal): EvidenceRef[] {
  return [{
    evidenceType: 'raw-signal',
    refId: signal.signalId,
    checksum: signal.rawChecksum,
  }];
}
