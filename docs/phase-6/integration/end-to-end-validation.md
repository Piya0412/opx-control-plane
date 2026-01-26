# End-to-End Validation Checklist

**Date:** January 26, 2026  
**Purpose:** Validate end-to-end wiring preserves all architectural invariants  
**Authority:** Principal Architect

---

## Critical Invariants (MUST NEVER BREAK)

### ✅ 1. Single Authoritative Control Plane

- [ ] DynamoDB is source of truth for all state
- [ ] EventBridge is event routing only (not source of truth)
- [ ] Event emission failures do NOT fail operations
- [ ] All state mutations go through control plane

**Validation:**
- Check that signal ingestion writes to DynamoDB first
- Check that EventBridge emit is wrapped in try/catch
- Check that incident creation writes to DynamoDB first
- Check that advisory storage is separate from incident state

### ✅ 2. Intelligence is Advisory Only

- [ ] Phase 6 has READ-ONLY access to incidents
- [ ] Phase 6 has READ-ONLY access to evidence
- [ ] Phase 6 writes ONLY to advisory table
- [ ] No automatic execution of proposed actions
- [ ] Explicit IAM DENY on write operations

**Validation:**
- Check IAM policy for phase6-invocation-lambda
- Check IAM policy for phase6-executor-lambda
- Verify DENY statements on incidents/evidence tables
- Verify advisory table is separate
- Test that Phase 6 cannot write to incidents

### ✅ 3. LangGraph is Sole Orchestrator

- [ ] No Lambda-per-agent architecture
- [ ] No custom fan-out logic
- [ ] Single executor Lambda for Phase 6
- [ ] All agent invocations go through LangGraph

**Validation:**
- Check that phase6-executor-lambda is single entry point
- Check that no individual agent Lambdas exist
- Check that LangGraph graph.py orchestrates all agents
- Verify Bedrock Agents are invoked by LangGraph nodes

### ✅ 4. Bedrock Agents are Native

- [ ] No InvokeModel wrappers
- [ ] Bedrock Agent constructs used
- [ ] Action groups use real AWS SDK calls
- [ ] No Lambda-per-agent pattern

**Validation:**
- Check that Bedrock Agents are defined in CDK
- Check that action groups are implemented
- Verify no InvokeModel calls in agent code
- Verify LangGraph invokes Bedrock Agents natively

### ✅ 5. Humans Approve Everything

- [ ] Advisory outputs are recommendations only
- [ ] No automatic remediation
- [ ] Execution requires explicit human action
- [ ] Approval workflow exists (or planned)

**Validation:**
- Check that advisory table stores recommendations
- Check that no execution logic exists in Phase 6
- Verify proposed actions are advisory only
- Confirm Phase 9 (automation) requires approval

### ✅ 6. Determinism, Replay, and Auditability

- [ ] Signal ingestion is idempotent
- [ ] Detection creation is idempotent
- [ ] Incident creation is idempotent
- [ ] Advisory storage is idempotent
- [ ] Phase 6 execution is deterministic
- [ ] Replay from checkpoint works
- [ ] All operations are auditable

**Validation:**
- Test duplicate signal ingestion
- Test duplicate detection creation
- Test duplicate incident creation
- Test duplicate advisory storage
- Run replay tests (test_replay.py)
- Run resume tests (test_resume.py)
- Check that all events are logged

### ✅ 7. Fail-Closed by Default

- [ ] Invalid inputs are rejected
- [ ] Missing data causes failure
- [ ] Transient errors trigger retries
- [ ] Permanent errors stop processing
- [ ] No silent failures

**Validation:**
- Test invalid signal schema
- Test missing incident
- Test missing evidence
- Test Phase 6 invocation failure
- Verify EventBridge retry configuration

---

## Component-Level Validation

### Signal Ingestion (Phase 2.1)

- [ ] SNS topic receives CloudWatch alarms
- [ ] signal-ingestor Lambda is triggered
- [ ] Signal is normalized and validated
- [ ] Signal is written to opx-signals table
- [ ] SignalIngested event is emitted to EventBridge
- [ ] Duplicate signals are handled idempotently
- [ ] EventBridge emit failures do NOT fail handler

**Test:**
```bash
# Send test CloudWatch alarm
aws sns publish \
  --topic-arn arn:aws:sns:REGION:ACCOUNT:opx-signals \
  --message file://test-alarm.json

# Verify signal in DynamoDB
aws dynamodb get-item \
  --table-name opx-signals \
  --key '{"signalId": {"S": "SIGNAL_ID"}}'

# Check CloudWatch logs
aws logs tail /aws/lambda/signal-ingestor --follow
```

### Detection Engine (Phase 2.4)

- [ ] EventBridge rule routes SignalIngested to detection-handler
- [ ] detection-handler Lambda is triggered
- [ ] Detection rules are loaded
- [ ] Signal is evaluated against rules
- [ ] Detection is created in opx-detections table
- [ ] DetectionCreated event is emitted

**Test:**
```bash
# Verify EventBridge rule exists
aws events list-rules --name-prefix SignalToDetection

# Check detection in DynamoDB
aws dynamodb get-item \
  --table-name opx-detections \
  --key '{"detectionId": {"S": "DETECTION_ID"}}'

# Check CloudWatch logs
aws logs tail /aws/lambda/detection-handler --follow
```

### Incident Creation (Phase 3)

- [ ] Promotion gate evaluates candidate
- [ ] Incident is created in opx-incidents table
- [ ] IncidentCreated event is emitted to EventBridge
- [ ] Event emission failure does NOT fail creation

**Test:**
```bash
# Verify incident in DynamoDB
aws dynamodb get-item \
  --table-name opx-incidents \
  --key '{"incidentId": {"S": "INCIDENT_ID"}}'

# Verify IncidentCreated event was emitted
aws logs filter-pattern "IncidentCreated event emitted" \
  --log-group-name /aws/lambda/incident-manager
```

### Phase 6 Invocation (NEW)

- [ ] EventBridge rule routes IncidentCreated to phase6-invocation-handler
- [ ] phase6-invocation-handler Lambda is triggered
- [ ] Incident is loaded (READ-ONLY)
- [ ] Evidence bundle is loaded (READ-ONLY)
- [ ] Phase 6 input payload is built
- [ ] phase6-executor-lambda is invoked
- [ ] Advisory output is stored in opx-agent-recommendations table

**Test:**
```bash
# Verify EventBridge rule exists
aws events list-rules --name-prefix IncidentToPhase6

# Check CloudWatch logs
aws logs tail /aws/lambda/phase6-invocation-handler --follow

# Verify advisory output in DynamoDB
aws dynamodb query \
  --table-name opx-agent-recommendations \
  --key-condition-expression "pk = :pk" \
  --expression-attribute-values '{":pk": {"S": "INCIDENT#INCIDENT_ID"}}'
```

### Phase 6 Execution (Existing)

- [ ] phase6-executor-lambda receives input
- [ ] Input is validated
- [ ] LangGraph state is created
- [ ] Graph executes with DynamoDB checkpointing
- [ ] Bedrock Agents are invoked
- [ ] Consensus is computed
- [ ] Cost is tracked
- [ ] Structured recommendation is returned

**Test:**
```bash
# Check CloudWatch logs
aws logs tail /aws/lambda/phase6-executor-lambda --follow

# Verify checkpoints in DynamoDB
aws dynamodb query \
  --table-name opx-langgraph-checkpoints \
  --key-condition-expression "execution_id = :exec_id" \
  --expression-attribute-values '{":exec_id": {"S": "EXECUTION_ID"}}'

# Check CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace Phase6 \
  --metric-name Execution.Count \
  --start-time 2026-01-26T00:00:00Z \
  --end-time 2026-01-26T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

### Advisory Storage (NEW)

- [ ] Advisory recommendation is stored in opx-agent-recommendations
- [ ] Storage is idempotent (by executionId)
- [ ] TTL is set (90 days)
- [ ] Recommendation includes all required fields

**Test:**
```bash
# Verify advisory output
aws dynamodb get-item \
  --table-name opx-agent-recommendations \
  --key '{"pk": {"S": "INCIDENT#INCIDENT_ID"}, "sk": {"S": "RECOMMENDATION#EXECUTION_ID"}}'

# Verify TTL is set
aws dynamodb describe-time-to-live \
  --table-name opx-agent-recommendations
```

---

## IAM Permission Validation

### Signal Ingestor Lambda

**Expected Permissions:**
- ✅ dynamodb:PutItem on opx-signals
- ✅ dynamodb:GetItem on opx-signals
- ✅ events:PutEvents on EventBridge
- ❌ DENY dynamodb:* on other tables

**Test:**
```bash
# Get Lambda role
aws lambda get-function --function-name signal-ingestor \
  --query 'Configuration.Role' --output text

# Get role policies
aws iam list-attached-role-policies --role-name ROLE_NAME
aws iam list-role-policies --role-name ROLE_NAME
```

### Phase 6 Invocation Lambda

**Expected Permissions:**
- ✅ dynamodb:GetItem on opx-incidents (READ-ONLY)
- ✅ dynamodb:GetItem on opx-evidence-bundles (READ-ONLY)
- ✅ dynamodb:PutItem on opx-agent-recommendations
- ✅ lambda:InvokeFunction on phase6-executor-lambda
- ❌ DENY dynamodb:PutItem on opx-incidents
- ❌ DENY dynamodb:UpdateItem on opx-incidents
- ❌ DENY dynamodb:PutItem on opx-evidence-bundles

**Test:**
```bash
# Get Lambda role
aws lambda get-function --function-name phase6-invocation-handler \
  --query 'Configuration.Role' --output text

# Get role policies and verify DENY statements
aws iam get-role-policy --role-name ROLE_NAME --policy-name POLICY_NAME
```

### Phase 6 Executor Lambda

**Expected Permissions:**
- ✅ dynamodb:PutItem on opx-langgraph-checkpoints
- ✅ dynamodb:GetItem on opx-langgraph-checkpoints
- ✅ bedrock:InvokeAgent on all Phase 6 agents
- ✅ cloudwatch:PutMetricData
- ❌ DENY dynamodb:PutItem on opx-incidents
- ❌ DENY dynamodb:UpdateItem on opx-incidents
- ❌ DENY any execution/remediation APIs

**Test:**
```bash
# Get Lambda role
aws lambda get-function --function-name phase6-executor-lambda \
  --query 'Configuration.Role' --output text

# Verify DENY statements exist
aws iam get-role-policy --role-name ROLE_NAME --policy-name POLICY_NAME | grep -i deny
```

---

## End-to-End Integration Test

### Test Scenario: CloudWatch Alarm → Advisory Recommendation

**Steps:**
1. Send test CloudWatch alarm to SNS topic
2. Wait for signal ingestion (5 seconds)
3. Wait for detection creation (10 seconds)
4. Wait for incident creation (15 seconds)
5. Wait for Phase 6 invocation (30 seconds)
6. Wait for Phase 6 execution (5 minutes)
7. Verify advisory output exists

**Expected Results:**
- Signal exists in opx-signals table
- Detection exists in opx-detections table
- Incident exists in opx-incidents table
- Advisory recommendation exists in opx-agent-recommendations table
- All CloudWatch logs show success
- No errors in any Lambda function

**Test Script:**
```bash
#!/bin/bash

# 1. Send test alarm
ALARM_JSON='{"AlarmName":"test-alarm","NewStateValue":"ALARM","NewStateReason":"Test"}'
aws sns publish --topic-arn $SNS_TOPIC_ARN --message "$ALARM_JSON"

# 2. Wait and verify signal
sleep 5
SIGNAL_ID=$(aws dynamodb scan --table-name opx-signals --limit 1 --query 'Items[0].signalId.S' --output text)
echo "Signal ID: $SIGNAL_ID"

# 3. Wait and verify detection
sleep 10
DETECTION_ID=$(aws dynamodb scan --table-name opx-detections --limit 1 --query 'Items[0].detectionId.S' --output text)
echo "Detection ID: $DETECTION_ID"

# 4. Wait and verify incident
sleep 15
INCIDENT_ID=$(aws dynamodb scan --table-name opx-incidents --limit 1 --query 'Items[0].incidentId.S' --output text)
echo "Incident ID: $INCIDENT_ID"

# 5. Wait for Phase 6 execution
sleep 300

# 6. Verify advisory output
aws dynamodb query \
  --table-name opx-agent-recommendations \
  --key-condition-expression "pk = :pk" \
  --expression-attribute-values "{\":pk\": {\"S\": \"INCIDENT#$INCIDENT_ID\"}}"

echo "✅ End-to-end test complete"
```

---

## Failure Mode Testing

### Test 1: Invalid Signal Schema

**Test:** Send malformed CloudWatch alarm  
**Expected:** Signal ingestion logs error, returns success, does NOT retry  
**Validation:** Check CloudWatch logs for validation error

### Test 2: Missing Incident

**Test:** Emit IncidentCreated event with non-existent incident ID  
**Expected:** Phase 6 invocation logs error, returns success, does NOT retry  
**Validation:** Check CloudWatch logs for "Incident not found"

### Test 3: Phase 6 Execution Failure

**Test:** Invoke Phase 6 with invalid input  
**Expected:** Phase 6 returns 400/500, invocation handler retries  
**Validation:** Check EventBridge retry attempts in CloudWatch logs

### Test 4: Advisory Storage Failure

**Test:** Simulate DynamoDB throttling  
**Expected:** Phase 6 invocation handler retries  
**Validation:** Check CloudWatch logs for retry attempts

---

## Performance Validation

### Latency Targets

- Signal ingestion: < 1 second
- Detection creation: < 5 seconds
- Incident creation: < 2 seconds
- Phase 6 invocation: < 5 seconds
- Phase 6 execution: < 5 minutes
- End-to-end: < 6 minutes

**Test:**
```bash
# Measure end-to-end latency
START_TIME=$(date +%s)
# Send test alarm
aws sns publish --topic-arn $SNS_TOPIC_ARN --message "$ALARM_JSON"
# Wait for advisory output
while true; do
  RESULT=$(aws dynamodb query --table-name opx-agent-recommendations ...)
  if [ -n "$RESULT" ]; then
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    echo "End-to-end latency: ${DURATION}s"
    break
  fi
  sleep 10
done
```

### Cost Targets

- Signal ingestion: < $0.01 per signal
- Detection creation: < $0.01 per detection
- Incident creation: < $0.01 per incident
- Phase 6 execution: < $5.00 per incident
- End-to-end: < $5.10 per incident

**Test:**
```bash
# Check Phase 6 cost metrics
aws cloudwatch get-metric-statistics \
  --namespace Phase6 \
  --metric-name Cost.TotalUSD \
  --start-time 2026-01-26T00:00:00Z \
  --end-time 2026-01-26T23:59:59Z \
  --period 3600 \
  --statistics Average,Maximum
```

---

## Sign-Off Checklist

### Architecture Validation

- [ ] Single authoritative control plane preserved
- [ ] Intelligence is advisory only
- [ ] LangGraph is sole orchestrator
- [ ] Bedrock Agents are native
- [ ] Humans approve everything
- [ ] Determinism preserved
- [ ] Fail-closed by default

### Component Validation

- [ ] Signal ingestion works
- [ ] Detection engine works
- [ ] Incident creation works
- [ ] Phase 6 invocation works
- [ ] Phase 6 execution works
- [ ] Advisory storage works

### IAM Validation

- [ ] Read-only permissions verified
- [ ] DENY statements verified
- [ ] No authority leakage

### Integration Validation

- [ ] End-to-end flow works
- [ ] EventBridge wiring works
- [ ] Idempotency works
- [ ] Error handling works

### Performance Validation

- [ ] Latency targets met
- [ ] Cost targets met
- [ ] Scalability tested

---

**Status:** READY FOR VALIDATION  
**Date:** January 26, 2026  
**Authority:** Principal Architect  
**Next Step:** Execute validation tests and sign off
