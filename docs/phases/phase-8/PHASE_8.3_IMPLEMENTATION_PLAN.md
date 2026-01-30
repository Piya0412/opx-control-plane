# Phase 8.3: Implementation Plan

**Date:** January 29, 2026  
**Status:** Ready to Implement  
**Corrections:** All acknowledged

---

## Implementation Order

### Step 1: Infrastructure (30 minutes)

Create DynamoDB table and CloudWatch alarms.

**Files to Create:**
1. `infra/constructs/validation-errors-table.ts`
2. `infra/constructs/validation-alarms.ts`

**Tasks:**
- [ ] Create validation errors table with TTL
- [ ] Add GSI for querying by agent/timestamp
- [ ] Create CloudWatch alarms for validation rates
- [ ] Update stack to include new constructs

---

### Step 2: Core Validation Logic (2 hours)

Implement three-layer validation with corrections applied.

**Files to Create:**
1. `src/validation/output-validator.ts` - Main orchestrator
2. `src/validation/schema-validator.ts` - Zod validation (non-throwing)
3. `src/validation/business-validator.ts` - Domain rules
4. `src/validation/semantic-validator.ts` - Best-effort checks
5. `src/validation/validation.schema.ts` - Type definitions
6. `src/validation/validation-store.ts` - DynamoDB operations
7. `src/validation/index.ts` - Exports

**Key Requirements:**
- ✅ Correction 1: Non-throwing Zod validation
- ✅ Correction 2: Best-effort semantic validation
- ✅ All validation returns data, not exceptions

---

### Step 3: Retry Orchestrator (1 hour)

Implement bounded retry logic with prompt simplification.

**Files to Create:**
1. `src/validation/retry-orchestrator.ts`
2. `src/validation/prompt-simplifier.ts`
3. `src/validation/fallback-generator.ts`

**Key Requirements:**
- ✅ Correction 3: Summarized retry prompts (no raw errors)
- ✅ Max 3 retries
- ✅ Clear fallback semantics

---

### Step 4: Observability (30 minutes)

Add metrics and logging with corrected dimensions.

**Files to Create:**
1. `src/validation/validation-metrics.ts`

**Key Requirements:**
- ✅ Correction 4: Bucketed attempt dimensions (first/second/fallback)
- ✅ Low-cardinality metrics
- ✅ Rate-based alarms

---

### Step 5: Integration (1 hour)

Wire validation into agent orchestrator.

**Files to Modify:**
1. `src/agents/orchestrator.ts` - Add validation wrapper
2. `src/langgraph/agent_node.py` - Add validation (if needed)
3. `infra/phase6/stacks/phase6-bedrock-stack.ts` - Add resources

---

### Step 6: Tests (1-2 hours)

Comprehensive test coverage.

**Files to Create:**
1. `test/validation/output-validator.test.ts`
2. `test/validation/schema-validator.test.ts`
3. `test/validation/business-validator.test.ts`
4. `test/validation/semantic-validator.test.ts`
5. `test/validation/retry-orchestrator.test.ts`

---

### Step 7: Validation Gates (2 hours)

Execute validation gates to verify implementation.

**Gates:**
1. Schema validation correctness
2. Retry logic behavior
3. Fallback generation
4. Observability verification

---

## Detailed Implementation

### Infrastructure: Validation Errors Table

```typescript
// infra/constructs/validation-errors-table.ts
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class ValidationErrorsTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'Table', {
      tableName: 'opx-validation-errors',
      partitionKey: {
        name: 'errorId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI for querying by agent
    this.table.addGlobalSecondaryIndex({
      indexName: 'agent-timestamp-index',
      partitionKey: {
        name: 'agentId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI for querying by validation layer
    this.table.addGlobalSecondaryIndex({
      indexName: 'layer-timestamp-index',
      partitionKey: {
        name: 'validationLayer',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });
  }
}
```

### Core: Schema Validator (Non-Throwing)

```typescript
// src/validation/schema-validator.ts
import { z } from 'zod';

export interface ValidationResult<T> {
  ok: boolean;
  data?: T;
  error?: z.ZodError;
}

export class SchemaValidator {
  /**
   * Validate data against schema (non-throwing)
   * ✅ Correction 1: Returns data, not exceptions
   */
  static validate<T>(
    schema: z.ZodSchema<T>,
    data: unknown
  ): ValidationResult<T> {
    const result = schema.safeParse(data);
    
    if (result.success) {
      return {
        ok: true,
        data: result.data,
      };
    }
    
    return {
      ok: false,
      error: result.error,
    };
  }

  /**
   * Get human-readable error summary (for logging only)
   */
  static getErrorSummary(error: z.ZodError): string {
    const issues = error.issues.map(issue => 
      `${issue.path.join('.')}: ${issue.message}`
    );
    return issues.join('; ');
  }
}
```

### Core: Semantic Validator (Best-Effort)

```typescript
// src/validation/semantic-validator.ts
import { Logger } from '../utils/logger';

export interface SemanticValidationResult {
  ok: boolean;
  warnings: string[];
}

export class SemanticValidator {
  private logger = new Logger('SemanticValidator');

  /**
   * Validate semantic correctness (best-effort only)
   * ✅ Correction 2: Never blocks, always returns
   */
  async validateCitations(
    citations: Array<{ source: string; content: string }>
  ): Promise<SemanticValidationResult> {
    const warnings: string[] = [];

    for (const citation of citations) {
      try {
        // Best-effort document verification
        const exists = await this.verifyDocumentExists(citation.source);
        
        if (!exists) {
          // ✅ Log + warn, don't fail
          this.logger.warn('Citation document not found', {
            source: citation.source,
          });
          warnings.push(`Document not found: ${citation.source}`);
        }
      } catch (error) {
        // ✅ Skip check on infra failure
        this.logger.warn('Semantic validation skipped due to error', {
          source: citation.source,
          error: error instanceof Error ? error.message : String(error),
        });
        // Don't add to warnings - infra failure is not validation failure
      }
    }

    // Always return success - warnings are informational only
    return {
      ok: true,
      warnings,
    };
  }

  private async verifyDocumentExists(source: string): Promise<boolean> {
    // Implementation with timeout and error handling
    // Returns false on any error (best-effort)
    try {
      // Check knowledge base or document store
      // ... implementation ...
      return true;
    } catch {
      return false; // Treat errors as "not found"
    }
  }
}
```

### Retry: Orchestrator (Summarized Prompts)

```typescript
// src/validation/retry-orchestrator.ts
import { Logger } from '../utils/logger';

export interface RetryConfig {
  maxAttempts: number; // 3
  promptStrategy: 'clarify' | 'simplify' | 'fallback';
}

export class RetryOrchestrator {
  private logger = new Logger('RetryOrchestrator');

  /**
   * Generate retry prompt (summarized, not echoing raw errors)
   * ✅ Correction 3: No raw validation details in prompt
   */
  generateRetryPrompt(attempt: number, originalPrompt: string): string {
    if (attempt === 1) {
      // First retry: Clarify requirements
      return `${originalPrompt}\n\nIMPORTANT: Previous response did not meet required format. Please strictly follow the schema and ensure all required fields are present.`;
    }
    
    if (attempt === 2) {
      // Second retry: Simplify
      return `${originalPrompt}\n\nPlease provide a simplified response that strictly adheres to the required output format.`;
    }
    
    // Should not reach here (fallback instead)
    return originalPrompt;
  }

  /**
   * Get attempt bucket for metrics
   * ✅ Correction 4: Bucketed dimensions
   */
  getAttemptBucket(attempt: number): 'first' | 'second' | 'fallback' {
    if (attempt === 0) return 'first';
    if (attempt === 1) return 'second';
    return 'fallback';
  }
}
```

### Observability: Metrics (Bucketed Dimensions)

```typescript
// src/validation/validation-metrics.ts
import { CloudWatch } from 'aws-sdk';

export class ValidationMetrics {
  private cloudwatch = new CloudWatch();

  /**
   * Emit validation metrics with bucketed dimensions
   * ✅ Correction 4: Attempt bucketed as first/second/fallback
   */
  async emitValidationResult(params: {
    agentId: string;
    attempt: number;
    success: boolean;
    validationLayer: 'schema' | 'business' | 'semantic';
  }): Promise<void> {
    const attemptBucket = this.getAttemptBucket(params.attempt);

    await this.cloudwatch.putMetricData({
      Namespace: 'OPX/Validation',
      MetricData: [
        {
          MetricName: 'ValidationAttempt',
          Value: 1,
          Unit: 'Count',
          Dimensions: [
            { Name: 'AgentId', Value: params.agentId },
            { Name: 'Attempt', Value: attemptBucket },
            { Name: 'Layer', Value: params.validationLayer },
            { Name: 'Success', Value: params.success ? 'true' : 'false' },
          ],
        },
      ],
    }).promise();
  }

  private getAttemptBucket(attempt: number): 'first' | 'second' | 'fallback' {
    if (attempt === 0) return 'first';
    if (attempt === 1) return 'second';
    return 'fallback';
  }
}
```

---

## Validation Gates

### Gate 1: Schema Validation Correctness
- Test non-throwing behavior
- Verify error data structure
- Confirm no exceptions leak

### Gate 2: Retry Logic Behavior
- Test max 3 retries
- Verify prompt simplification
- Confirm no raw errors in prompts

### Gate 3: Fallback Generation
- Test confidence: 0.0
- Verify honest reasoning
- Confirm safe defaults

### Gate 4: Observability Verification
- Check DynamoDB logging
- Verify bucketed metrics
- Confirm alarm configuration

---

## Success Criteria

- [ ] All 4 corrections applied
- [ ] Infrastructure deployed
- [ ] Validation logic implemented
- [ ] Retry orchestrator working
- [ ] Metrics emitting correctly
- [ ] All tests passing
- [ ] All gates passed
- [ ] Documentation complete

---

**Ready to Start:** ✅ YES  
**Estimated Time:** 6-8 hours  
**Next Action:** Create infrastructure constructs
