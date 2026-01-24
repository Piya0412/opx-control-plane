/**
 * Phase 5 - Step 1: Automation Audit Schema Tests
 */

import { describe, it, expect } from 'vitest';
import {
  AutomationAuditSchema,
  OperationTypeSchema,
  TriggerTypeSchema,
  OperationStatusSchema,
  OperationParametersSchema,
  OperationResultsSchema,
  type AutomationAudit,
} from '../../src/automation/automation-audit.schema';

describe('OperationTypeSchema', () => {
  it('should accept valid operation types', () => {
    expect(() => OperationTypeSchema.parse('PATTERN_EXTRACTION')).not.toThrow();
    expect(() => OperationTypeSchema.parse('CALIBRATION')).not.toThrow();
    expect(() => OperationTypeSchema.parse('SNAPSHOT')).not.toThrow();
  });

  it('should reject invalid operation types', () => {
    expect(() => OperationTypeSchema.parse('INVALID')).toThrow();
    expect(() => OperationTypeSchema.parse('pattern_extraction')).toThrow();
  });
});

describe('TriggerTypeSchema', () => {
  it('should accept valid trigger types', () => {
    expect(() => TriggerTypeSchema.parse('SCHEDULED')).not.toThrow();
    expect(() => TriggerTypeSchema.parse('MANUAL')).not.toThrow();
  });

  it('should reject invalid trigger types', () => {
    expect(() => TriggerTypeSchema.parse('AUTOMATIC')).toThrow();
  });
});

describe('OperationStatusSchema', () => {
  it('should accept valid statuses', () => {
    expect(() => OperationStatusSchema.parse('RUNNING')).not.toThrow();
    expect(() => OperationStatusSchema.parse('SUCCESS')).not.toThrow();
    expect(() => OperationStatusSchema.parse('FAILED')).not.toThrow();
  });

  it('should reject invalid statuses', () => {
    expect(() => OperationStatusSchema.parse('PENDING')).toThrow();
  });
});

describe('OperationParametersSchema', () => {
  it('should accept valid parameters', () => {
    const params = {
      service: 'order-service',
      startDate: '2026-01-20T00:00:00.000Z',
      endDate: '2026-01-21T00:00:00.000Z',
      timeWindow: '24h',
      snapshotType: 'DAILY' as const,
    };
    
    expect(() => OperationParametersSchema.parse(params)).not.toThrow();
  });

  it('should accept empty parameters', () => {
    expect(() => OperationParametersSchema.parse({})).not.toThrow();
  });

  it('should accept partial parameters', () => {
    const params = {
      service: 'order-service',
      timeWindow: '7d',
    };
    
    expect(() => OperationParametersSchema.parse(params)).not.toThrow();
  });
});

describe('OperationResultsSchema', () => {
  it('should accept pattern extraction results', () => {
    const results = {
      summaryId: 'a'.repeat(64),
      totalIncidents: 42,
      patternsFound: 5,
      recordsProcessed: 100,
      durationMs: 1500,
    };
    
    expect(() => OperationResultsSchema.parse(results)).not.toThrow();
  });

  it('should accept calibration results', () => {
    const results = {
      calibrationId: 'b'.repeat(64),
      averageDrift: 0.05,
      bandsCalibrated: 3,
      recordsProcessed: 200,
      durationMs: 2000,
    };
    
    expect(() => OperationResultsSchema.parse(results)).not.toThrow();
  });

  it('should accept snapshot results', () => {
    const results = {
      snapshotId: 'c'.repeat(64),
      totalOutcomes: 150,
      totalSummaries: 30,
      totalCalibrations: 10,
      recordsProcessed: 190,
      durationMs: 3000,
    };
    
    expect(() => OperationResultsSchema.parse(results)).not.toThrow();
  });

  it('should accept empty results', () => {
    expect(() => OperationResultsSchema.parse({})).not.toThrow();
  });
});

describe('AutomationAuditSchema', () => {
  const createValidAudit = (overrides: Partial<AutomationAudit> = {}): AutomationAudit => ({
    auditId: 'a'.repeat(64),
    operationType: 'PATTERN_EXTRACTION',
    triggerType: 'SCHEDULED',
    startTime: '2026-01-22T02:00:00.000Z',
    status: 'RUNNING',
    parameters: {
      service: 'order-service',
      timeWindow: '24h',
    },
    triggeredBy: {
      type: 'SYSTEM',
      principal: 'arn:aws:iam::123456789012:role/opx-automation',
    },
    version: '1.0.0',
    ...overrides,
  });

  it('should validate complete audit', () => {
    const audit = createValidAudit();
    expect(() => AutomationAuditSchema.parse(audit)).not.toThrow();
  });

  it('should validate audit with results', () => {
    const audit = createValidAudit({
      status: 'SUCCESS',
      endTime: '2026-01-22T02:01:30.000Z',
      results: {
        summaryId: 'b'.repeat(64),
        totalIncidents: 42,
        patternsFound: 5,
        recordsProcessed: 100,
        durationMs: 90000,
      },
    });
    
    expect(() => AutomationAuditSchema.parse(audit)).not.toThrow();
  });

  it('should validate audit with error', () => {
    const audit = createValidAudit({
      status: 'FAILED',
      endTime: '2026-01-22T02:00:15.000Z',
      errorMessage: 'Database connection timeout',
      errorStack: 'Error: Database connection timeout\n  at ...',
    });
    
    expect(() => AutomationAuditSchema.parse(audit)).not.toThrow();
  });

  it('should require auditId to be 64 characters', () => {
    const audit = createValidAudit({ auditId: 'short' });
    expect(() => AutomationAuditSchema.parse(audit)).toThrow();
  });

  it('should require valid ISO-8601 datetime for startTime', () => {
    const audit = createValidAudit({ startTime: '2026-01-22' });
    expect(() => AutomationAuditSchema.parse(audit)).toThrow();
  });

  it('should require valid ISO-8601 datetime for endTime', () => {
    const audit = createValidAudit({
      endTime: 'invalid-date',
    });
    expect(() => AutomationAuditSchema.parse(audit)).toThrow();
  });

  it('should enforce errorMessage max length', () => {
    const audit = createValidAudit({
      errorMessage: 'x'.repeat(2001),
    });
    expect(() => AutomationAuditSchema.parse(audit)).toThrow();
  });

  it('should enforce errorStack max length', () => {
    const audit = createValidAudit({
      errorStack: 'x'.repeat(10001),
    });
    expect(() => AutomationAuditSchema.parse(audit)).toThrow();
  });

  it('should validate all triggeredBy types', () => {
    const types = ['SYSTEM', 'HUMAN_OPERATOR', 'ON_CALL_SRE', 'EMERGENCY_OVERRIDE'] as const;
    
    types.forEach(type => {
      const audit = createValidAudit({
        triggeredBy: {
          type,
          principal: 'arn:aws:iam::123456789012:role/test',
        },
      });
      expect(() => AutomationAuditSchema.parse(audit)).not.toThrow();
    });
  });

  it('should reject invalid triggeredBy type', () => {
    const audit = createValidAudit({
      triggeredBy: {
        type: 'INVALID' as any,
        principal: 'arn:aws:iam::123456789012:role/test',
      },
    });
    expect(() => AutomationAuditSchema.parse(audit)).toThrow();
  });

  it('should require all mandatory fields', () => {
    const audit = {
      auditId: 'a'.repeat(64),
      operationType: 'PATTERN_EXTRACTION',
      // Missing required fields
    };
    
    expect(() => AutomationAuditSchema.parse(audit)).toThrow();
  });
});
