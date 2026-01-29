# Phase 8.3: Structured Output Validation

**Status:** 📋 AWAITING APPROVAL  
**Created:** January 29, 2026  
**Estimated Duration:** 1 day

## Objective

Ensure all agent outputs conform to expected schemas through enhanced validation and automatic retry logic.

## Core Principle

**Validation failures should not break agents.**

- Retry with clarified prompt (3 attempts)
- Graceful degradation on persistent failures
- Log all validation errors
- Never throw exceptions to caller

## Architecture

### Validation Flow

```
Agent Response
    ↓
Schema Validation (Zod)
    ├─→ PASS → Return response
    └─→ FAIL → Retry Logic
        ├─→ Attempt 1: Clarify prompt
        ├─→ Attempt 2: Simplify prompt
        └─→ Attempt 3: Fallback response
            ↓ (all failed)
        Log Error → Return Degraded Response
```

## Validation Layers

### Layer 1: Schema Validation (Zod)

**Purpose:** Ensure response matches TypeScript types

**Example Schema:**
```typescript
import { z } from 'zod';

const AgentOutputSchema = z.object({
  agentId: z.string(),
  agentVersion: z.string(),
  executionId: z.string().uuid(),
  timestamp: z.string().datetime(),
  
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(10),
  
  findings: z.object({
    // Agent-specific findings
  }),
  
  citations: z.array(z.object({
    source: z.string(),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
    text: z.string()
  })).optional(),
  
  cost: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    estimatedCost: z.number().nonnegative()
  }),
  
  metadata: z.object({
    duration: z.number().nonnegative(),
    retries: z.number().int().nonnegative(),
    model: z.string()
  })
});

type AgentOutput = z.infer<typeof AgentOutputSchema>;
```

### Layer 2: Business Logic Validation

**Purpose:** Enforce domain-specific rules

**Rules:**
1. **Confidence Score:** Must be 0.0 - 1.0
2. **Timestamps:** Must be ISO 8601 format
3. **Citations:** Must reference actual documents
4. **Cost:** Must be non-negative
5. **Reasoning:** Must be non-empty (min 10 characters)
6. **Line Numbers:** lineEnd >= lineStart

**Implementation:**
```typescript
function validateBusinessLogic(output: AgentOutput): ValidationResult {
  const errors: string[] = [];
  
  // Confidence
  if (output.confidence < 0 || output.confidence > 1) {
    errors.push('Confidence must be between 0.0 and 1.0');
  }
  
  // Timestamps
  if (!isValidISO8601(output.timestamp)) {
    errors.push('Timestamp must be ISO 8601 format');
  }
  
  // Citations
  if (output.citations) {
    for (const citation of output.citations) {
      if (citation.lineEnd < citation.lineStart) {
        errors.push(`Invalid citation: lineEnd (${citation.lineEnd}) < lineStart (${citation.lineStart})`);
      }
    }
  }
  
  // Cost
  if (output.cost.estimatedCost < 0) {
    errors.push('Cost cannot be negative');
  }
  
  // Reasoning
  if (output.reasoning.length < 10) {
    errors.push('Reasoning must be at least 10 characters');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

### Layer 3: Semantic Validation

**Purpose:** Verify logical consistency

**Checks:**
1. **Findings Match Agent Type**
   - Signal Intelligence → Must have metrics/logs/traces
   - Historical Pattern → Must have incident references
   - Change Intelligence → Must have deployment/config data

2. **Citations Reference Real Documents**
   - Verify document exists in Knowledge Base
   - Verify line numbers are valid

3. **Consistency Across Fields**
   - If confidence is low (<0.3), reasoning should explain why
   - If no findings, confidence should be low

**Implementation:**
```typescript
async function validateSemantics(
  output: AgentOutput,
  agentId: string
): Promise<ValidationResult> {
  const errors: string[] = [];
  
  // Agent-specific findings
  if (agentId === 'signal-intelligence') {
    if (!output.findings.metrics && !output.findings.logs && !output.findings.traces) {
      errors.push('Signal Intelligence must provide metrics, logs, or traces');
    }
  }
  
  // Citation verification
  if (output.citations) {
    for (const citation of output.citations) {
      const exists = await verifyDocumentExists(citation.source);
      if (!exists) {
        errors.push(`Citation references non-existent document: ${citation.source}`);
      }
    }
  }
  
  // Confidence-reasoning consistency
  if (output.confidence < 0.3 && !output.reasoning.includes('uncertain')) {
    errors.push('Low confidence should be explained in reasoning');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

## Retry Logic

### Retry Strategy

**Attempt 1:** Clarify prompt with validation errors
```
Original prompt: "Analyze metrics for incident INC-001"

Retry prompt: "Analyze metrics for incident INC-001. 
IMPORTANT: Your response must include:
- confidence (number between 0.0 and 1.0)
- reasoning (at least 10 characters)
- findings with metrics data
- cost breakdown
Previous attempt failed validation: [specific errors]"
```

**Attempt 2:** Simplify prompt
```
"Provide a simple analysis of metrics for incident INC-001.
Focus on:
1. What metrics are abnormal?
2. What is your confidence level (0.0 to 1.0)?
3. Brief reasoning (1-2 sentences)
Return only essential information."
```

**Attempt 3:** Fallback response
```typescript
{
  agentId: agentId,
  agentVersion: "1.0.0",
  executionId: executionId,
  timestamp: new Date().toISOString(),
  confidence: 0.0,
  reasoning: "Unable to generate valid response after 3 attempts",
  findings: {},
  cost: { inputTokens: 0, outputTokens: 0, estimatedCost: 0 },
  metadata: { duration: 0, retries: 3, model: "fallback" }
}
```

### Implementation

```typescript
async function invokeAgentWithValidation(
  agentId: string,
  input: any,
  state: any,
  maxRetries: number = 3
): Promise<AgentOutput> {
  
  let lastError: ValidationError | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Invoke agent
      const response = await invokeAgent(agentId, input, state);
      
      // Parse response
      const parsed = parseAgentResponse(response);
      
      // Validate schema
      const schemaResult = AgentOutputSchema.safeParse(parsed);
      if (!schemaResult.success) {
        throw new ValidationError('Schema validation failed', schemaResult.error);
      }
      
      // Validate business logic
      const businessResult = validateBusinessLogic(schemaResult.data);
      if (!businessResult.valid) {
        throw new ValidationError('Business logic validation failed', businessResult.errors);
      }
      
      // Validate semantics
      const semanticResult = await validateSemantics(schemaResult.data, agentId);
      if (!semanticResult.valid) {
        throw new ValidationError('Semantic validation failed', semanticResult.errors);
      }
      
      // Success!
      return schemaResult.data;
      
    } catch (error) {
      lastError = error;
      
      // Log validation error
      await logValidationError(agentId, attempt, error);
      
      // Modify prompt for retry
      if (attempt < maxRetries - 1) {
        input = modifyPromptForRetry(input, error, attempt);
      }
    }
  }
  
  // All retries failed - return fallback
  await logValidationFailure(agentId, lastError);
  return createFallbackResponse(agentId, state);
}
```

## Validation Error Schema

```typescript
interface ValidationError {
  // Identity
  errorId: string;              // UUID v4
  timestamp: string;            // ISO 8601
  
  // Context
  traceId: string;              // Link to LLM trace
  agentId: string;              // Which agent
  incidentId: string;           // Context
  executionId: string;          // LangGraph execution
  
  // Error Details
  error: {
    type: "SCHEMA" | "BUSINESS_LOGIC" | "SEMANTIC";
    layer: 1 | 2 | 3;
    message: string;
    details: string[];          // Specific validation errors
  };
  
  // Retry Info
  retry: {
    attempt: number;            // 0, 1, 2
    maxAttempts: number;        // 3
    succeeded: boolean;         // Did retry succeed?
  };
  
  // Response
  response: {
    raw: string;                // Raw agent response
    parsed?: any;               // Parsed response (if parseable)
  };
  
  // Metadata
  metadata: {
    model: string;
    duration: number;           // ms
  };
  
  // TTL
  ttl: number;                  // Unix timestamp (90 days)
}
```

## DynamoDB Table Design

**Table:** `opx-validation-errors`

**Keys:**
- `errorId` (PK, String) - UUID
- `timestamp` (SK, String) - ISO 8601

**GSI:** `agentId-timestamp-index`
- `agentId` (PK, String)
- `timestamp` (SK, String)
- Projection: ALL

**GSI:** `type-timestamp-index`
- `error.type` (PK, String)
- `timestamp` (SK, String)
- Projection: ALL

**TTL:** `ttl` attribute (90 days)

**Capacity:** On-demand billing

## CloudWatch Metrics

**Namespace:** `OPX/Validation`

**Metrics:**

1. **ValidationErrorCount**
   - Unit: Count
   - Dimensions: `AgentId`, `ErrorType`, `Layer`
   - Description: Number of validation errors

2. **RetrySuccessRate**
   - Unit: Percent
   - Dimensions: `AgentId`, `Attempt`
   - Description: Percentage of retries that succeeded

3. **FallbackRate**
   - Unit: Percent
   - Dimensions: `AgentId`
   - Description: Percentage of requests that fell back

## CloudWatch Alarms

### Alarm 1: High Validation Error Rate

```typescript
new cloudwatch.Alarm(this, 'HighValidationErrorRate', {
  alarmName: 'OPX-Validation-HighErrorRate',
  alarmDescription: 'Validation error rate exceeds 10%',
  metric: new cloudwatch.Metric({
    namespace: 'OPX/Validation',
    metricName: 'ValidationErrorCount',
    dimensionsMap: {
      AgentId: agentId
    },
    statistic: 'Sum',
    period: cdk.Duration.minutes(5)
  }),
  threshold: 10,
  evaluationPeriods: 2,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
});
```

### Alarm 2: High Fallback Rate

```typescript
new cloudwatch.Alarm(this, 'HighFallbackRate', {
  alarmName: 'OPX-Validation-HighFallbackRate',
  alarmDescription: 'Fallback rate exceeds 5%',
  metric: new cloudwatch.Metric({
    namespace: 'OPX/Validation',
    metricName: 'FallbackRate',
    dimensionsMap: {
      AgentId: agentId
    },
    statistic: 'Average',
    period: cdk.Duration.minutes(5)
  }),
  threshold: 5,
  evaluationPeriods: 3,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
});
```

## Testing

### Unit Tests

```typescript
describe('Schema Validation', () => {
  it('should pass valid output', () => {
    const output = {
      agentId: 'signal-intelligence',
      agentVersion: '1.0.0',
      executionId: '123e4567-e89b-12d3-a456-426614174000',
      timestamp: '2026-01-29T12:00:00Z',
      confidence: 0.85,
      reasoning: 'Metrics show clear anomaly pattern',
      findings: { metrics: [] },
      cost: { inputTokens: 100, outputTokens: 50, estimatedCost: 0.01 },
      metadata: { duration: 1000, retries: 0, model: 'claude-3' }
    };
    
    const result = AgentOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });
  
  it('should fail invalid confidence', () => {
    const output = { ...validOutput, confidence: 1.5 };
    const result = AgentOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });
});

describe('Business Logic Validation', () => {
  it('should detect invalid line numbers', () => {
    const output = {
      ...validOutput,
      citations: [{
        source: 'runbook.md',
        lineStart: 100,
        lineEnd: 50,  // Invalid: end < start
        text: 'Sample'
      }]
    };
    
    const result = validateBusinessLogic(output);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid citation');
  });
});
```

### Integration Tests

```typescript
describe('Retry Logic', () => {
  it('should retry on validation failure', async () => {
    // Mock agent to fail first attempt, succeed second
    let callCount = 0;
    mockInvokeAgent.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { confidence: 'high' };  // Invalid (string not number)
      }
      return { confidence: 0.85 };  // Valid
    });
    
    const result = await invokeAgentWithValidation(
      'signal-intelligence',
      { query: 'test' },
      { incidentId: 'INC-001' }
    );
    
    expect(callCount).toBe(2);
    expect(result.confidence).toBe(0.85);
  });
  
  it('should fallback after max retries', async () => {
    // Mock agent to always fail
    mockInvokeAgent.mockReturnValue({ confidence: 'invalid' });
    
    const result = await invokeAgentWithValidation(
      'signal-intelligence',
      { query: 'test' },
      { incidentId: 'INC-001' }
    );
    
    expect(result.confidence).toBe(0.0);
    expect(result.reasoning).toContain('Unable to generate valid response');
  });
});
```

## Cost Analysis

**DynamoDB Costs:**
- Validation errors are rare (<5% of requests)
- ~5 errors per day × 30 days = 150 errors/month
- Storage: ~10 KB per error × 150 × 90 days = ~135 MB
- Cost: Negligible (<$0.10/month)

**Lambda Costs:**
- Retry overhead: ~3 retries × 5% error rate = 15% additional invocations
- Cost: ~$0.30/month additional

**Total:** ~$0.40/month

## Success Criteria

- ✅ All agent outputs validated (3 layers)
- ✅ Retry logic working (3 attempts)
- ✅ Fallback responses generated
- ✅ Validation errors logged to DynamoDB
- ✅ CloudWatch metrics populated
- ✅ CloudWatch alarms configured
- ✅ Unit tests passing (schema, business logic, semantic)
- ✅ Integration tests passing (retry, fallback)
- ✅ No exceptions propagated to caller

## Risks & Mitigations

**Risk 1: Retry overhead**
- Mitigation: Only retry on validation failures (rare)
- Mitigation: Max 3 attempts (bounded)
- Mitigation: Exponential backoff

**Risk 2: False positives (valid responses rejected)**
- Mitigation: Comprehensive schema testing
- Mitigation: Monitor false positive rate
- Mitigation: Tune validation rules

**Risk 3: Fallback responses misleading**
- Mitigation: Clear confidence = 0.0
- Mitigation: Explicit reasoning about failure
- Mitigation: Log all fallbacks for review

## Next Steps

1. **Review and approve this design**
2. **Enhance Zod schemas**
3. **Implement validation layers**
4. **Implement retry logic**
5. **Create validation errors table**
6. **Test end-to-end**

---

**Status:** AWAITING APPROVAL  
**Dependencies:** 8.1 (Tracing) for error logging  
**Blocks:** None (can run in parallel with 8.2, 8.4)
