import * as crypto from 'crypto';
import type { Incident } from '../domain/incident.js';

/**
 * State Hash Utilities
 * 
 * CRITICAL: Hash must be deterministic at ALL depths.
 * Same incident state MUST produce same hash.
 * 
 * Canonicalization must be recursive and deterministic at all depths.
 */

/**
 * Canonical incident state for hashing
 * 
 * Excludes derived/metadata fields:
 * - updatedAt (changes on every update)
 * - version (optimistic locking counter)
 * - eventSeq (event store counter)
 * - timeline (derived from events)
 */
interface CanonicalIncidentState {
  incidentId: string;
  service: string;
  severity: string;
  state: string;
  title: string;
  description?: string;
  signals: Array<{
    signalId: string;
    type: string;
    source: string;
    timestamp: string;
    data: Record<string, unknown>;
  }>;
  createdAt: string;
  createdBy: string;
}

/**
 * Deep canonicalization with recursive key sorting
 * 
 * Ensures deterministic serialization at ALL depths.
 * Handles nested objects and arrays recursively.
 */
export function canonicalizeDeep(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(canonicalizeDeep);
  }
  
  if (typeof obj === 'object') {
    const sorted: Record<string, any> = {};
    const keys = Object.keys(obj).sort();
    
    for (const key of keys) {
      sorted[key] = canonicalizeDeep(obj[key]);
    }
    
    return sorted;
  }
  
  return obj;
}

/**
 * Extract canonical state from incident
 * 
 * Only includes authoritative state fields.
 * Excludes metadata and derived fields.
 */
export function extractCanonicalState(incident: Incident): CanonicalIncidentState {
  return {
    incidentId: incident.incidentId,
    service: incident.service,
    severity: incident.severity,
    state: incident.state,
    title: incident.title,
    description: incident.description,
    signals: incident.signals,
    createdAt: incident.createdAt,
    createdBy: incident.createdBy,
  };
}

/**
 * Compute deterministic state hash
 * 
 * CRITICAL PROPERTIES:
 * - Same incident state → same hash (deterministic)
 * - Deep canonicalization ensures nested objects are sorted
 * - SHA-256 for cryptographic strength
 * 
 * Used for:
 * - Storing stateHashAfter in events
 * - Verifying replay integrity
 * - Detecting state corruption
 */
export function computeStateHash(incident: Incident): string {
  const canonical = extractCanonicalState(incident);
  const deepCanonical = canonicalizeDeep(canonical);
  const json = JSON.stringify(deepCanonical);
  return crypto.createHash('sha256').update(json, 'utf8').digest('hex');
}

/**
 * Verify hash matches expected value
 * 
 * Used during replay to detect integrity violations.
 */
export function verifyStateHash(
  incident: Incident,
  expectedHash: string
): { valid: boolean; actualHash: string } {
  const actualHash = computeStateHash(incident);
  return {
    valid: actualHash === expectedHash,
    actualHash,
  };
}
