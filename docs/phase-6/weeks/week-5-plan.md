# Phase 6 Week 5: Execution & Hardening - IMPLEMENTATION PLAN

**Date**: January 26, 2026  
**Status**: 🔒 LOCKED - Ready for Implementation  
**Authority**: Principal Architect

---

## Implementation Order (Strict Sequence)

### Task 1: DynamoDB Checkpointing Infrastructure
**Priority**: CRITICAL (blocks everything else)  
**Files**:
- `infra/phase6/constructs/langgraph-checkpoint-table.ts` (NEW)
- `infra/phase6/stacks/phase6-bedrock-stack.ts` (UPDATE)
- `src/langgraph/checkpointing.py` (UPDATE - replace MemorySaver)

**Deliverables**:
- DynamoDB table: `opx-langgraph-checkpoints`
- Partition key: `session_id` (String)
- Sort key: `checkpoint_id` (String, format: `node_id#attempt`)
- TTL: 30 days
- Point-in-time recovery enabled
- DynamoDBSaver implementation in Python

**Exit Criteria**:
- ✅ Table deployed via CDK
- ✅ DynamoDBSaver replaces MemorySaver in graph.py
- ✅ Checkpoint write/read tested

---

### Task 2: Lambda Execution Handler
**Priority**: CRITICAL  
**Files**:
- `src/langgraph/lambda_handler.py` (NEW)
- `infra/phase6/constructs/phase6-executor-lambda.ts` (NEW)
- `infra/phase6/stacks/phase6-bedrock-stack.ts` (UPDATE)

**Handler Contract**:
```python
def handler(event: dict, context) -> dict:
    """
    EventBridge → LangGraph execution entrypoint.
    
    Input: EventBridge event with incident data
    Output: Execution result with recommendation
    
    NEVER raises unhandled exceptions.
    """
```

**Responsibilities**:
1. Validate EventBridge schema
2. Generate execution_id (idempotent)
3. Call entry_node(event)
4. Invoke graph with DynamoDB checkpointing
5. Persist output to DynamoDB
6. Emit CloudWatch metrics
7. Return structured response

**IAM Permissions**:
- DynamoDB: Read/Write to checkpoint table
- Bedrock: InvokeAgent on all 6 agents
- CloudWatch: PutMetricData
- Logs: CreateLogGroup, CreateLogStream, PutLogEvents

**Exit Criteria**:
- ✅ Lambda deployed via CDK
- ✅ EventBridge trigger configured
- ✅ Handler executes graph successfully
- ✅ Checkpoints written to DynamoDB

---

### Task 3: Action Group Hardening (Read-Only)
**Priority**: HIGH  
**Files**:
- `src/langgraph/action_groups/cloudwatch_metrics.py` (UPDATE)
- `src/langgraph/action_groups/cloudwatch_logs.py` (UPDATE)
- `src/langgraph/action_groups/xray_traces.py` (UPDATE)
- `src/langgraph/action_groups/dynamodb_lookup.py` (UPDATE)
- `src/langgraph/action_groups/service_graph.py` (UPDATE)

**Implementation Rules**:
- Replace stub responses with real AWS SDK calls
- All calls are READ-ONLY (no mutations)
- Timeouts ≤ 2 seconds per call
- Failures return partial data, not exceptions
- Structured, bounded output (max 10KB per response)

**IAM Permissions** (read-only):
- CloudWatch: GetMetricData, FilterLogEvents
- X-Ray: GetTraceSummaries, BatchGetTraces
- DynamoDB: GetItem, Query (specific tables only)
- ServiceDiscovery: ListServices, GetService

**Exit Criteria**:
- ✅ All 9 action groups return real data
- ✅ IAM policies enforce read-only
- ✅ Timeouts enforced
- ✅ Partial failure handling tested

---

### Task 4: Replay & Resume Validation
**Priority**: HIGH  
**Files**:
- `src/langgraph/test_replay.py` (NEW)
- `src/langgraph/test_resume.py` (NEW)

**Test Cases**:
1. **Full Replay**: Same input → same output
2. **Resume from Checkpoint**: Crash mid-graph → resume → complete
3. **Deterministic Consensus**: Replay produces identical consensus
4. **Deterministic Cost**: Replay produces identical cost totals

**Validation Rules**:
```python
assert replay.output.consensus == original.output.consensus
assert replay.cost.total == original.cost.total
assert replay.execution_trace == original.execution_trace
```

**Exit Criteria**:
- ✅ Full replay test passes
- ✅ Resume test passes
- ✅ Determinism validated (consensus, cost, trace)

---

### Task 5: Observability & Metrics
**Priority**: MEDIUM  
**Files**:
- `src/langgraph/metrics.py` (NEW)
- `infra/phase6/constructs/phase6-dashboard.ts` (NEW)
- `infra/phase6/constructs/phase6-alarms.ts` (NEW)

**CloudWatch Metrics**:
- `Phase6/Execution/Count` (Count)
- `Phase6/Execution/DurationMs` (Milliseconds)
- `Phase6/Agent/DurationMs` (Milliseconds, dimension: AgentId)
- `Phase6/Agent/FailureRate` (Percent, dimension: AgentId)
- `Phase6/Cost/TotalUSD` (None, unit: USD)
- `Phase6/Replay/Count` (Count)

**CloudWatch Alarms**:
- High failure rate (>10% in 5 minutes)
- Excessive retries (>5 per execution)
- Cost threshold breach (>$10 per hour)
- Execution timeout (>60 seconds)

**Dashboard Widgets**:
- Execution count (line chart)
- Agent performance (bar chart)
- Cost tracking (line chart)
- Failure rate (gauge)

**Exit Criteria**:
- ✅ All metrics emitted
- ✅ Dashboard deployed
- ✅ Alarms configured
- ✅ Test alarm triggers

---

### Task 6: Failure Containment
**Priority**: MEDIUM  
**Files**:
- `src/langgraph/failure_handler.py` (NEW)
- `src/langgraph/agent_node.py` (UPDATE)

**Failure Handling Matrix**:

| Failure Type | Handling | Confidence | Status |
|--------------|----------|------------|--------|
| Agent timeout | Partial hypothesis | 0.0 | TIMEOUT |
| Action group failure | Partial result | Reduced | PARTIAL |
| Bedrock throttling | Retry with backoff | N/A | RETRYING |
| Budget exceeded | Signal only | N/A | SUCCESS |
| Consensus failure | Fail-closed | N/A | FAILURE |

**Rules**:
- System MUST always return a result
- No unhandled exceptions
- Partial results are valid
- Budget exceeded is a signal, not a failure

**Exit Criteria**:
- ✅ All failure types handled
- ✅ No unhandled exceptions
- ✅ Partial results tested
- ✅ Fail-closed behavior validated

---

### Task 7: Security & Governance
**Priority**: HIGH  
**Files**:
- `infra/phase6/constructs/phase6-iam-policies.ts` (NEW)
- `src/langgraph/security.py` (NEW)

**Security Guarantees**:
1. IAM-only authentication (no API keys)
2. Explicit DENY on write APIs
3. No secrets in environment variables
4. All executions auditable (CloudTrail)
5. Full replay trail preserved (30 days)

**IAM Policy Structure**:
```json
{
  "Effect": "Allow",
  "Action": [
    "cloudwatch:GetMetricData",
    "logs:FilterLogEvents",
    "xray:GetTraceSummaries",
    "dynamodb:GetItem",
    "dynamodb:Query"
  ],
  "Resource": "*"
},
{
  "Effect": "Deny",
  "Action": [
    "dynamodb:PutItem",
    "dynamodb:UpdateItem",
    "dynamodb:DeleteItem",
    "ec2:*",
    "lambda:UpdateFunctionCode"
  ],
  "Resource": "*"
}
```

**Exit Criteria**:
- ✅ Read-only IAM policies deployed
- ✅ Write operations explicitly denied
- ✅ No secrets in code
- ✅ Audit trail validated

---

### Task 8: Integration Testing
**Priority**: CRITICAL  
**Files**:
- `src/langgraph/test_week5_integration.py` (NEW)

**Test Scenarios**:
1. End-to-end execution via Lambda
2. Checkpoint persistence and resume
3. Replay determinism
4. Action group real data
5. Failure handling
6. Metrics emission
7. Cost tracking
8. Security boundaries

**Exit Criteria**:
- ✅ All integration tests pass
- ✅ Lambda execution validated
- ✅ Checkpointing validated
- ✅ Replay validated
- ✅ Observability validated

---

## Implementation Timeline

| Task | Estimated Time | Dependencies |
|------|----------------|--------------|
| 1. DynamoDB Checkpointing | 2 hours | None |
| 2. Lambda Handler | 2 hours | Task 1 |
| 3. Action Group Hardening | 3 hours | Task 2 |
| 4. Replay Validation | 2 hours | Task 1, 2 |
| 5. Observability | 2 hours | Task 2 |
| 6. Failure Containment | 1 hour | Task 2, 3 |
| 7. Security & Governance | 1 hour | Task 2, 3 |
| 8. Integration Testing | 2 hours | All tasks |

**Total Estimated Time**: 15 hours

---

## Exit Criteria (Week 5 COMPLETE)

- ✅ Lambda handler deployed and tested
- ✅ DynamoDB checkpointing live
- ✅ Resume-from-checkpoint validated
- ✅ Replay determinism validated
- ✅ Real action groups implemented (read-only)
- ✅ Observability dashboard live
- ✅ Zero unsafe mutations possible
- ✅ Kill-safe (disable Lambda = stop intelligence)

---

## Next Steps

1. Start with Task 1 (DynamoDB Checkpointing)
2. Deploy infrastructure changes
3. Update Python code
4. Run integration tests
5. Validate each task before proceeding

**Ready to begin implementation.**
