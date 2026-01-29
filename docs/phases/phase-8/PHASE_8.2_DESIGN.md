# Phase 8.2: Guardrails Enforcement

**Status:** ✅ COMPLETE  
**Completed:** January 29, 2026  
**Type:** Safety Layer

---

## Objective

Enforce safety guardrails on all LLM interactions to prevent PII leaks and inappropriate content.

---

## Core Principle

**Enforcement Mode:**
```
PII / Credentials → BLOCK (hard stop)
Content categories → ALLOW + LOG (application-level decision)
```

**Rationale:**
- Over-blocking destroys trust early
- Need data before strict enforcement
- PII leaks are unacceptable
- Content issues can be tuned

---

## Architecture

### Guardrail Attachment

```
LangGraph Agent Node
    ↓
Bedrock Agent Invocation
    ↓ (guardrailId attached)
Bedrock Guardrails
    ├─→ PII Detection → BLOCK
    └─→ Content Filters → WARN
    ↓
Agent Response (or blocked)
    ↓ (if violation)
Guardrail Violation Event
    ↓
DynamoDB: opx-guardrail-violations
```

### Guardrail Configuration

**Guardrail ID:** `opx-agent-guardrail`  
**Version:** 1 (DRAFT for testing, promote to LIVE after validation)

---

## Guardrail Policies

### 1. PII Detection (BLOCK Mode)

**Action:** BLOCK (prevent response)

**Detected Types:**
- Email addresses
- Phone numbers (US format)
- Social Security Numbers (SSN)
- Credit card numbers
- AWS credentials (access keys, secret keys)
- Driver's license numbers
- Passport numbers

### 2. Content Filters (WARN Mode)

**Action:** ALLOW + LOG

**Categories:**
- Hate speech
- Insults
- Sexual content
- Violence
- Misconduct

**Thresholds:** MEDIUM (configurable)

---

## Implementation

### Files Created

**Infrastructure (3 files):**
- `infra/constructs/bedrock-guardrails.ts` - Guardrail configuration
- `infra/constructs/guardrail-violations-table.ts` - DynamoDB table
- `infra/constructs/guardrail-alarms.ts` - CloudWatch alarms

**Application Code (2 files):**
- `src/tracing/guardrail_handler.py` - Violation logging
- `src/langgraph/guardrail_integration.py` - Agent integration

**Tests (2 files):**
- `src/tracing/test_guardrail_handler.py`
- `src/langgraph/test_guardrail_integration.py`

---

## Corrections Applied

### ✅ Correction 1: WARN Mode Clarification
Bedrock returns `BLOCK` or `ALLOW` with metadata, not native `WARN`. Our code interprets non-blocking violations as `WARN` for logging and metrics.

### ✅ Correction 2: Dual Block Handling
Agent integration handles BOTH exception-based (`GuardrailInterventionException`) and response-based (`{"guardrailAction": "BLOCKED"}`) guardrail blocks.

### ✅ Correction 3: Optional Confidence Field
Violation schema has `confidence?: number` (optional) with default value of 1.0 when Bedrock doesn't provide it.

### ✅ Correction 4: Conceptual Topic Names
Topics use conceptual definitions (`SYSTEM_COMMAND_EXECUTION`, `CREDENTIAL_HANDLING`, `DESTRUCTIVE_ACTIONS`) instead of literal phrases.

---

## Validation Gates

All 4 gates passed:
- ✅ Gate 1: PII Block Test
- ✅ Gate 2: WARN Mode Test (Non-Blocking)
- ✅ Gate 3: Alarm Sanity Check
- ✅ Gate 4: Failure Isolation Test

---

## Cost Impact

**Monthly:** ~$2-3
- Guardrail evaluations: ~$1-2
- DynamoDB: ~$0.50
- CloudWatch alarms: ~$0.20

---

**Next Phase:** Phase 8.3 (Output Validation)
