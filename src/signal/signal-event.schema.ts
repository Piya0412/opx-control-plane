/**
 * Signal Event Schema
 * 
 * Phase 2.1: Signal Ingestion
 * 
 * Pure observation records - no correlation logic, no decision-making.
 * 
 * CORRECTIONS APPLIED:
 * - CORRECTION 2: Uses identityWindow (rounded time bucket) for stable signalIds
 * - CORRECTION 3: No correlationWindow field (belongs to Phase 2.2)
 */

import { z } from 'zod';

/**
 * Signal sources
 */
export const SignalSourceSchema = z.enum([
  'CLOUDWATCH_ALARM',
  'CLOUDWATCH_METRIC',
  'CLOUDWATCH_LOGS',
  'CUSTOM_API',
  'EVENTBRIDGE',
]);

export type SignalSource = z.infer<typeof SignalSourceSchema>;

/**
 * Signal types
 */
export const SignalTypeSchema = z.enum([
  'ALARM_STATE_CHANGE',
  'METRIC_BREACH',
  'LOG_PATTERN_MATCH',
  'CUSTOM_EVENT',
]);

export type SignalType = z.infer<typeof SignalTypeSchema>;

/**
 * Severity levels (aligned with Incident severity)
 * Raw vendor-specific values
 */
export const SignalSeveritySchema = z.enum(['SEV1', 'SEV2', 'SEV3', 'SEV4']);

export type SignalSeverity = z.infer<typeof SignalSeveritySchema>;

/**
 * Normalized severity levels (for detection rules and downstream processing)
 */
export const NormalizedSeveritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);

export type NormalizedSeverity = z.infer<typeof NormalizedSeveritySchema>;

/**
 * Map raw severity to normalized severity
 */
export function normalizeSignalSeverity(rawSeverity: SignalSeverity): NormalizedSeverity {
  const mapping: Record<SignalSeverity, NormalizedSeverity> = {
    'SEV1': 'CRITICAL',
    'SEV2': 'HIGH',
    'SEV3': 'MEDIUM',
    'SEV4': 'LOW',
  };
  return mapping[rawSeverity];
}

/**
 * Signal metadata (flexible, source-specific)
 */
export const SignalMetadataSchema = z.record(z.unknown()).optional();

/**
 * SignalEvent - Normalized observation record
 * 
 * CORRECTION 2: Split time into observedAt (actual) and identityWindow (rounded)
 * CORRECTION 3: No correlationWindow field
 */
export const SignalEventSchema = z.object({
  // Identity
  signalId: z.string().length(64), // SHA-256 hash (deterministic)
  
  // Source information
  source: SignalSourceSchema,
  signalType: SignalTypeSchema,
  
  // Service context
  service: z.string().min(1).max(256),
  severity: SignalSeveritySchema, // Raw severity (SEV1/SEV2/SEV3/SEV4)
  
  // Temporal (CORRECTION 2: Split into observedAt + identityWindow)
  observedAt: z.string().datetime(), // ISO 8601 - When signal actually happened
  identityWindow: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/), // Rounded time bucket
  
  // Source-specific metadata
  metadata: SignalMetadataSchema,
  
  // Audit
  ingestedAt: z.string().datetime(), // When system saw it
});

export type SignalEvent = z.infer<typeof SignalEventSchema>;
