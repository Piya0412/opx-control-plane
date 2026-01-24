/**
 * Phase 5 - Step 1: Automation Audit Schema
 * 
 * Audit records for automated learning operations.
 * 
 * RULES:
 * - Append-only (no updates to core data)
 * - Deterministic audit IDs (SHA256)
 * - Full auditability (who, when, what, why)
 */

import { z } from 'zod';

/**
 * Operation Type
 * 
 * Types of automated learning operations.
 */
export const OperationTypeSchema = z.enum([
  'PATTERN_EXTRACTION',
  'CALIBRATION',
  'SNAPSHOT',
]);

export type OperationType = z.infer<typeof OperationTypeSchema>;

/**
 * Trigger Type
 * 
 * How the operation was triggered.
 */
export const TriggerTypeSchema = z.enum([
  'SCHEDULED',  // EventBridge cron
  'MANUAL',     // API Gateway request
]);

export type TriggerType = z.infer<typeof TriggerTypeSchema>;

/**
 * Operation Status
 * 
 * Current status of the operation.
 */
export const OperationStatusSchema = z.enum([
  'RUNNING',
  'SUCCESS',
  'FAILED',
]);

export type OperationStatus = z.infer<typeof OperationStatusSchema>;

/**
 * Operation Parameters
 * 
 * Parameters specific to each operation type.
 */
export const OperationParametersSchema = z.object({
  // Pattern Extraction
  service: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  
  // Snapshot
  snapshotType: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM']).optional(),
  
  // Common
  timeWindow: z.string().optional(), // e.g., "24h", "7d", "30d"
});

export type OperationParameters = z.infer<typeof OperationParametersSchema>;

/**
 * Operation Results
 * 
 * Results specific to each operation type.
 */
export const OperationResultsSchema = z.object({
  // Pattern Extraction
  summaryId: z.string().optional(),
  totalIncidents: z.number().optional(),
  patternsFound: z.number().optional(),
  
  // Calibration
  calibrationId: z.string().optional(),
  averageDrift: z.number().optional(),
  bandsCalibrated: z.number().optional(),
  
  // Snapshot
  snapshotId: z.string().optional(),
  totalOutcomes: z.number().optional(),
  totalSummaries: z.number().optional(),
  totalCalibrations: z.number().optional(),
  
  // Common
  recordsProcessed: z.number().optional(),
  durationMs: z.number().optional(),
  retryCount: z.number().optional(),
});

export type OperationResults = z.infer<typeof OperationResultsSchema>;

/**
 * Authority Schema
 * 
 * Who triggered the operation.
 */
export const AuthoritySchema = z.object({
  type: z.enum(['SYSTEM', 'HUMAN_OPERATOR', 'ON_CALL_SRE', 'EMERGENCY_OVERRIDE']),
  principal: z.string(),
});

export type Authority = z.infer<typeof AuthoritySchema>;

/**
 * Automation Audit
 * 
 * Complete audit record for an automated operation.
 */
export const AutomationAuditSchema = z.object({
  auditId: z.string().length(64), // SHA256 hex
  operationType: OperationTypeSchema,
  triggerType: TriggerTypeSchema,
  startTime: z.string().datetime(), // ISO-8601
  endTime: z.string().datetime().optional(), // ISO-8601
  status: OperationStatusSchema,
  parameters: OperationParametersSchema,
  results: OperationResultsSchema.optional(),
  errorMessage: z.string().max(2000).optional(),
  errorStack: z.string().max(10000).optional(),
  triggeredBy: AuthoritySchema,
  version: z.string(), // e.g., "1.0.0"
});

export type AutomationAudit = z.infer<typeof AutomationAuditSchema>;
