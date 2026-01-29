# Phase 8.1: Prompt & Response Tracing

**Status:** ✅ APPROVED - READY FOR IMPLEMENTATION  
**Created:** January 29, 2026  
**Approved:** January 29, 2026 (with required adjustments applied)  
**Estimated Duration:** 1 day

## Objective

Capture and store all LLM interactions for audit, debugging, and compliance.

## Core Principle

**Tracing failures must NEVER fail an agent.**

- Async processing only
- Best-effort delivery
- Graceful degradation
- No exceptions propagated

## Architecture

### Data Flow

```
LangGraph Agent Node
    ↓ (invoke Bedrock Agent)
Bedrock Agent Response
    ↓ (async, non-blocking)
EventBridge Event
    ↓
Trace Processor Lambda
    ↓ (redact PII)
DynamoDB: opx-llm-traces
    ↓ (90-day TTL)
Automatic deletion
```

### Trace Schema

```typescript
interface LLMTrace {
  // Identity
  traceId: string;              // UUID v4
  traceVersion: string;         // Schema version (e.g., "v1") - for future evolution
  timestamp: string;            // ISO 8601
  
  // Context
  agentId: string;              // e.g., "signal-intelligence"
  incidentId: string;           // Context for trace (✅ OK in DynamoDB, ❌ NEVER as CloudWatch dimension)
  executionId: string;          // LangGraph execution ID
  
  // Model
  model: string;                // e.g., "anthropic.claude-3-sonnet-20240229-v1:0"
  modelVersion: string;         // e.g., "20240229"
  
  // Prompt
  prompt: {
    text: string;               // Full prompt (redacted)
    tokens: number;             // Input token count
    template: string;           // Prompt template ID
    variables: Record<string, string>; // Template variables (stringified, redacted, truncated to 2KB)
  };
  
  // Response
  response: {
    text: string;               // Full response (redacted)
    tokens: number;             // Output token count
    finishReason: string;       // "stop", "length", "content_filter"
    latency: number;            // Response time in ms
  };
  
  // Cost
  cost: {
    inputCost: number;          // USD (input tokens * rate)
    outputCost: number;         // USD (output tokens * rate)
    total: number;              // USD (sum)
  };
  
  // Metadata
  metadata: {
    retryCount: number;         // How many retries
    guardrailsApplied: string[]; // Which guardrails fired
    validationStatus: "passed" | "failed" | "warning";
    redactionApplied: boolean;  // Was PII redacted?
    captureMethod: "sync" | "async"; // How was trace captured
  };
  
  // TTL
  ttl: number;                  // Unix timestamp (90 days from now)
}
```

### DynamoDB Table Design

**Table:** `opx-llm-traces`

**Keys:**
- `traceId` (PK, String) - UUID
- `timestamp` (SK, String) - ISO 8601

**GSI:** `agentId-timestamp-index`
- `agentId` (PK, String)
- `timestamp` (SK, String)
- Projection: ALL
- **NOTE:** incidentId is NOT used as GSI key (cardinality protection)

**TTL:** `ttl` attribute (90 days)

**Capacity:** On-demand billing

**Governance Rules (LOCKED):**
- ✅ incidentId allowed in DynamoDB (for querying)
- ❌ incidentId NEVER as CloudWatch metric dimension
- ❌ incidentId NEVER as GSI key alone

## Redaction Rules

### PII Patterns (MUST REDACT)

1. **Email addresses**
   - Pattern: `\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b`
   - Replacement: `[EMAIL_REDACTED]`

2. **Phone numbers**
   - Pattern: `\b\d{3}[-.]?\d{3}[-.]?\d{4}\b`
   - Replacement: `[PHONE_REDACTED]`

3. **SSN**
   - Pattern: `\b\d{3}-\d{2}-\d{4}\b`
   - Replacement: `[SSN_REDACTED]`

4. **AWS Account IDs**
   - Pattern: `\b\d{12}\b`
   - Replacement: `[AWS_ACCOUNT_REDACTED]`

5. **AWS Access Keys**
   - Pattern: `AKIA[0-9A-Z]{16}`
   - Replacement: `[AWS_KEY_REDACTED]`

6. **IP Addresses** (optional)
   - Pattern: `\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b`
   - Replacement: `[IP_REDACTED]`

### Redaction Implementation

```python
import re
import json

PII_PATTERNS = {
    'email': (r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[EMAIL_REDACTED]'),
    'phone': (r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', '[PHONE_REDACTED]'),
    'ssn': (r'\b\d{3}-\d{2}-\d{4}\b', '[SSN_REDACTED]'),
    'aws_account': (r'\b\d{12}\b', '[AWS_ACCOUNT_REDACTED]'),
    'aws_key': (r'AKIA[0-9A-Z]{16}', '[AWS_KEY_REDACTED]'),
}

def redact_pii(text: str) -> tuple[str, bool]:
    """
    Redact PII from text. Returns (redacted_text, was_redacted).
    
    CRITICAL: This must run BEFORE storage/logging, AFTER cost computation.
    """
    redacted = text
    was_redacted = False
    
    for pattern_name, (pattern, replacement) in PII_PATTERNS.items():
        if re.search(pattern, redacted):
            redacted = re.sub(pattern, replacement, redacted)
            was_redacted = True
    
    return redacted, was_redacted

def prepare_variables(variables: dict) -> dict[str, str]:
    """
    Prepare prompt variables for storage.
    
    CRITICAL STEPS:
    1. Stringify all values (no raw objects)
    2. Redact PII from each value
    3. Truncate to 2KB per variable
    
    This prevents accidental credential/secret persistence.
    """
    prepared = {}
    MAX_VAR_LENGTH = 2048  # 2KB per variable
    
    for key, value in variables.items():
        # Step 1: Stringify
        if isinstance(value, str):
            str_value = value
        else:
            str_value = json.dumps(value)
        
        # Step 2: Redact PII
        redacted_value, _ = redact_pii(str_value)
        
        # Step 3: Truncate
        if len(redacted_value) > MAX_VAR_LENGTH:
            redacted_value = redacted_value[:MAX_VAR_LENGTH] + "...[TRUNCATED]"
        
        prepared[key] = redacted_value
    
    return prepared
```

## Implementation

### 1. LangGraph Integration

**Location:** `src/langgraph/agent_node.py`

```python
async def invoke_agent_with_tracing(
    agent_id: str,
    input_data: dict,
    state: dict
) -> dict:
    """
    Invoke Bedrock Agent with async tracing.
    
    CRITICAL: Tracing failures NEVER fail the agent.
    """
    
    trace_id = str(uuid.uuid4())
    start_time = time.time()
    
    try:
        # Invoke agent
        response = await bedrock_agent_runtime.invoke_agent(
            agentId=agent_id,
            agentAliasId="TSTALIASID",
            sessionId=state["executionId"],
            inputText=input_data["query"]
        )
        
        latency = (time.time() - start_time) * 1000  # ms
        
        # Calculate cost BEFORE redaction (need raw token counts)
        cost = calculate_cost(response)
        
        # Emit trace event (async, non-blocking)
        # Redaction happens in trace processor, not here
        await emit_trace_event(
            trace_id=trace_id,
            trace_version="v1",  # Schema versioning for future evolution
            agent_id=agent_id,
            incident_id=state["incidentId"],
            execution_id=state["executionId"],
            prompt=input_data["query"],
            prompt_variables=input_data.get("variables", {}),
            response=response["output"],
            latency=latency,
            model=get_agent_model(agent_id),
            cost=cost
        )
        
        return response
        
    except Exception as e:
        # Agent failure - still try to trace
        try:
            await emit_trace_event(
                trace_id=trace_id,
                trace_version="v1",
                agent_id=agent_id,
                incident_id=state["incidentId"],
                error=str(e)
            )
        except:
            # Tracing failed - log but don't propagate
            logger.warning(f"Trace emission failed for {trace_id}")
        
        # Re-raise original exception
        raise e
```

### 2. Trace Processor Lambda

**Location:** `src/tracing/trace-processor.py`

```python
import boto3
import json
from datetime import datetime, timedelta

dynamodb = boto3.resource('dynamodb')
traces_table = dynamodb.Table('opx-llm-traces')

def handler(event, context):
    """
    Process trace events from EventBridge.
    
    CRITICAL: Uses native EventBridge format (event['detail']), not SQS format.
    """
    
    try:
        # Native EventBridge: single event per invocation
        trace_data = event['detail']
        
        # REDACTION ORDER (CRITICAL):
        # 1. Cost already computed (before this Lambda)
        # 2. Now redact PII (before storage)
        # 3. Then store (after redaction)
        
        # Redact PII from prompt and response
        redacted_prompt, prompt_redacted = redact_pii(trace_data['prompt']['text'])
        redacted_response, response_redacted = redact_pii(trace_data['response']['text'])
        
        # Prepare variables (stringify, redact, truncate)
        prepared_variables = prepare_variables(trace_data['prompt'].get('variables', {}))
        
        # Calculate TTL (90 days)
        ttl = int((datetime.now() + timedelta(days=90)).timestamp())
        
        # Store trace (non-authoritative, TTL-based)
        traces_table.put_item(Item={
            'traceId': trace_data['traceId'],
            'traceVersion': trace_data.get('traceVersion', 'v1'),  # Schema versioning
            'timestamp': trace_data['timestamp'],
            'agentId': trace_data['agentId'],
            'incidentId': trace_data['incidentId'],  # ✅ OK in DynamoDB, ❌ NOT in CloudWatch dimensions
            'executionId': trace_data['executionId'],
            'model': trace_data['model'],
            'modelVersion': trace_data.get('modelVersion', 'unknown'),
            'prompt': {
                'text': redacted_prompt,
                'tokens': trace_data['prompt']['tokens'],
                'template': trace_data['prompt'].get('template', 'unknown'),
                'variables': prepared_variables  # Stringified, redacted, truncated
            },
            'response': {
                'text': redacted_response,
                'tokens': trace_data['response']['tokens'],
                'finishReason': trace_data['response']['finishReason'],
                'latency': trace_data['response']['latency']
            },
            'cost': trace_data['cost'],
            'metadata': {
                **trace_data.get('metadata', {}),
                'redactionApplied': prompt_redacted or response_redacted
            },
            'ttl': ttl
        })
        
        return {'statusCode': 200}
        
    except Exception as e:
        # Log error but don't fail (best-effort tracing)
        print(f"Failed to process trace: {e}")
        return {'statusCode': 500, 'error': str(e)}
```

### 3. EventBridge Integration

**Event Pattern:**
```json
{
  "source": ["opx.langgraph"],
  "detail-type": ["LLMTraceEvent"]
}
```

**Target:** Trace Processor Lambda (native EventBridge, NOT SQS)

**Event Structure:**
```json
{
  "version": "0",
  "id": "event-id",
  "detail-type": "LLMTraceEvent",
  "source": "opx.langgraph",
  "time": "2026-01-29T12:00:00Z",
  "region": "us-east-1",
  "detail": {
    "traceId": "uuid",
    "traceVersion": "v1",
    "agentId": "signal-intelligence",
    "incidentId": "INC-001",
    "prompt": { ... },
    "response": { ... },
    "cost": { ... }
  }
}
```

**CRITICAL:** Lambda receives `event['detail']`, NOT `event['Records']` (native EventBridge, not SQS)

**Event Structure:**
```json
{
  "version": "0",
  "id": "event-id",
  "detail-type": "LLMTraceEvent",
  "source": "opx.langgraph",
  "time": "2026-01-29T12:00:00Z",
  "region": "us-east-1",
  "detail": {
    "traceId": "uuid",
    "traceVersion": "v1",
    "agentId": "signal-intelligence",
    "incidentId": "INC-001",
    "prompt": { ... },
    "response": { ... },
    "cost": { ... }
  }
}
```

## CloudWatch Logs Insights Queries

### Query 1: High-Cost Traces

```
fields @timestamp, traceId, agentId, cost.total
| filter cost.total > 0.01
| sort cost.total desc
| limit 20
```

### Query 2: Slow Traces

```
fields @timestamp, traceId, agentId, response.latency
| filter response.latency > 5000
| sort response.latency desc
| limit 20
```

### Query 3: Redacted Traces

```
fields @timestamp, traceId, agentId
| filter metadata.redactionApplied = true
| count() by agentId
```

### Query 4: Traces by Agent

```
fields @timestamp, traceId, cost.total, response.latency
| filter agentId = "signal-intelligence"
| stats avg(cost.total), avg(response.latency), count() by bin(5m)
```

## Testing

### Unit Tests

```python
def test_redact_email():
    text = "Contact me at user@example.com"
    redacted, was_redacted = redact_pii(text)
    assert redacted == "Contact me at [EMAIL_REDACTED]"
    assert was_redacted == True

def test_redact_multiple_pii():
    text = "Call 555-123-4567 or email user@example.com"
    redacted, was_redacted = redact_pii(text)
    assert "[PHONE_REDACTED]" in redacted
    assert "[EMAIL_REDACTED]" in redacted
    assert was_redacted == True

def test_no_pii():
    text = "This is a normal message"
    redacted, was_redacted = redact_pii(text)
    assert redacted == text
    assert was_redacted == False

def test_prepare_variables_stringify():
    """Test that variables are stringified."""
    variables = {
        "string_var": "hello",
        "dict_var": {"key": "value"},
        "list_var": [1, 2, 3]
    }
    prepared = prepare_variables(variables)
    assert isinstance(prepared["string_var"], str)
    assert isinstance(prepared["dict_var"], str)
    assert isinstance(prepared["list_var"], str)

def test_prepare_variables_redaction():
    """Test that PII is redacted from variables."""
    variables = {
        "email": "user@example.com",
        "phone": "555-123-4567"
    }
    prepared = prepare_variables(variables)
    assert "[EMAIL_REDACTED]" in prepared["email"]
    assert "[PHONE_REDACTED]" in prepared["phone"]

def test_prepare_variables_truncation():
    """Test that large variables are truncated."""
    large_value = "x" * 3000  # 3KB
    variables = {"large": large_value}
    prepared = prepare_variables(variables)
    assert len(prepared["large"]) <= 2048 + len("...[TRUNCATED]")
    assert "[TRUNCATED]" in prepared["large"]
```

### Integration Tests

```python
async def test_trace_capture_end_to_end():
    """Test full trace capture flow."""
    
    # Invoke agent
    response = await invoke_agent_with_tracing(
        agent_id="signal-intelligence",
        input_data={"query": "Analyze metrics"},
        state={"incidentId": "INC-001", "executionId": "exec-123"}
    )
    
    # Wait for async processing
    await asyncio.sleep(2)
    
    # Verify trace stored
    traces = traces_table.query(
        IndexName='agentId-timestamp-index',
        KeyConditionExpression='agentId = :aid',
        ExpressionAttributeValues={':aid': 'signal-intelligence'},
        Limit=1,
        ScanIndexForward=False
    )
    
    assert len(traces['Items']) > 0
    trace = traces['Items'][0]
    assert trace['incidentId'] == 'INC-001'
    assert trace['metadata']['redactionApplied'] in [True, False]
```

### Failure Tests

```python
async def test_tracing_failure_does_not_break_agent():
    """Verify agent continues if tracing fails."""
    
    # Mock DynamoDB failure
    with patch('boto3.resource') as mock_dynamodb:
        mock_dynamodb.side_effect = Exception("DynamoDB unavailable")
        
        # Agent should still work
        response = await invoke_agent_with_tracing(
            agent_id="signal-intelligence",
            input_data={"query": "Analyze metrics"},
            state={"incidentId": "INC-001", "executionId": "exec-123"}
        )
        
        # Verify agent response received
        assert response is not None
        assert 'output' in response
```

## Cost Analysis

**Assumptions:**
- 100 agent invocations per day
- Average prompt: 500 tokens
- Average response: 300 tokens
- 90-day retention

**DynamoDB Costs:**
- Write: 100 traces/day × $1.25 per million writes = $0.00375/day
- Storage: ~100 KB per trace × 9,000 traces × $0.25 per GB = $0.23/month
- Read: Minimal (queries for debugging only)

**Lambda Costs:**
- Invocations: 100/day × $0.20 per million = $0.0006/day
- Duration: 100ms average × 128 MB × $0.0000166667 = $0.0002/day

**Total:** ~$0.50/month (negligible)

## Success Criteria

- ✅ All agent invocations traced (100% capture)
- ✅ PII redacted from all traces (prompt, response, variables)
- ✅ Variables stringified, redacted, and truncated to 2KB
- ✅ Traces stored in DynamoDB with 90-day TTL
- ✅ Tracing failures do not break agents (non-blocking)
- ✅ Native EventBridge handler (event['detail'], not event['Records'])
- ✅ Trace versioning included (traceVersion: "v1")
- ✅ Redaction order correct (after cost, before storage)
- ✅ incidentId NOT used as CloudWatch dimension
- ✅ CloudWatch Logs Insights queries working
- ✅ Unit tests passing (redaction, variables, truncation)
- ✅ Integration tests passing (end-to-end)
- ✅ Failure tests passing (graceful degradation)

## Risks & Mitigations

**Risk 1: Async processing delay**
- Mitigation: Acceptable for observability (not real-time)
- Mitigation: EventBridge guarantees delivery

**Risk 2: PII leakage**
- Mitigation: Multiple redaction patterns
- Mitigation: Regular expression testing
- Mitigation: Variables explicitly stringified and redacted
- Mitigation: 2KB truncation prevents large secret blobs
- Mitigation: Manual audit of sample traces

**Risk 3: Storage costs**
- Mitigation: 90-day TTL (automatic cleanup)
- Mitigation: Sampling trigger at $50/month
- Mitigation: Compress large traces

## Governance Rules (Locked)

These decisions are now authoritative for Phase 8:

1. ✅ **Tracing failures NEVER fail agents** (non-blocking, async, best-effort)
2. ✅ **100% tracing** (no sampling initially, add only if DynamoDB cost > $50/month)
3. ✅ **Event-driven, async only** (EventBridge → Lambda)
4. ✅ **DynamoDB traces are non-authoritative** (TTL-based, not source of truth)
5. ✅ **TTL = 90 days** (automatic cleanup)
6. ✅ **PII redaction is mandatory** (not optional)
7. ✅ **Variables must be stringified** (no raw objects)
8. ✅ **incidentId allowed in DynamoDB** (for querying)
9. ❌ **incidentId NOT allowed in CloudWatch dimensions** (cardinality protection)
10. ✅ **Trace versioning required** (traceVersion field for schema evolution)

## Next Steps

1. ✅ **Design approved** - All adjustments applied
2. 🔄 **Begin implementation** - Start with Day 1 tasks:
   - Create `opx-llm-traces` DynamoDB table (CDK)
   - Implement redaction logic with variable preparation (Python)
   - Implement trace service with EventBridge native handler (Python)
   - Integrate with LangGraph agent node
   - Write unit tests (redaction, variables, truncation)
   - Write integration tests (end-to-end)
   - Deploy and verify

---

**Status:** ✅ APPROVED - READY FOR IMPLEMENTATION  
**Dependencies:** None (can start immediately)  
**Blocks:** 8.2, 8.3, 8.4 (need tracing infrastructure)
