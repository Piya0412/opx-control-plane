# Phase 8.1: LLM Tracing

**Status:** ✅ COMPLETE  
**Completed:** January 28, 2026  
**Type:** Observability Layer

---

## Objective

Capture comprehensive traces of all LLM interactions with PII redaction for debugging, auditing, and cost tracking.

---

## Core Principle

**Trace Everything, Redact PII:**
```
All LLM calls → Trace
All traces → PII redaction
All traces → DynamoDB (90-day TTL)
```

---

## Architecture

### Data Flow

```
LangGraph Agent Invocation
    ↓
Bedrock Agent Call
    ↓
Extract Trace Data
    ├─→ Prompt
    ├─→ Response
    ├─→ Token counts
    ├─→ Cost
    └─→ Metadata
    ↓
PII Redaction
    ↓
DynamoDB: opx-llm-traces
```

---

## Trace Schema

```typescript
{
  traceId: string;           // UUID
  timestamp: string;         // ISO 8601
  incidentId: string;        // Incident context
  agentId: string;          // Which agent
  sessionId: string;        // LangGraph session
  prompt: {
    text: string;           // Redacted
    tokens: number;
  };
  response: {
    text: string;           // Redacted
    tokens: number;
  };
  cost: {
    inputTokens: number;
    outputTokens: number;
    total: number;          // USD
  };
  modelId: string;
  duration: number;         // milliseconds
}
```

---

## PII Redaction

**Redacted Types:**
- Email addresses → `[EMAIL_REDACTED]`
- Phone numbers → `[PHONE_REDACTED]`
- SSN → `[SSN_REDACTED]`
- Credit cards → `[CC_REDACTED]`
- AWS credentials → `[AWS_KEY_REDACTED]`

**Implementation:** Regex-based redaction before storage

---

## Storage

**Table:** `opx-llm-traces`

**Indexes:**
- Primary: `traceId`
- GSI1: `incidentId` + `timestamp` (query by incident)
- GSI2: `agentId` + `timestamp` (query by agent)

**TTL:** 90 days (automatic cleanup)

---

## Implementation

### Files Created

**Infrastructure (2 files):**
- `infra/constructs/llm-traces-table.ts` - DynamoDB table
- `infra/constructs/trace-processor-lambda.ts` - Optional processor

**Application Code (4 files):**
- `src/tracing/trace-emitter.ts` - TypeScript emitter
- `src/tracing/trace_emitter.py` - Python emitter
- `src/tracing/redaction.py` - PII redaction
- `src/tracing/trace.schema.ts` - Schema definitions

**Tests (3 files):**
- `test/tracing/trace-processor.test.py`
- `src/tracing/test_redaction.py`
- `src/tracing/test_integration.py`

---

## Cost Impact

**Monthly:** ~$3-5
- DynamoDB: ~$2-3 (with TTL)
- Lambda (optional): ~$1-2

---

**Next Phase:** Phase 8.2 (Guardrails)
