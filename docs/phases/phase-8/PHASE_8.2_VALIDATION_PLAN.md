# Phase 8.2: Validation Gates Execution Plan

**Date:** January 29, 2026  
**Status:** Ready for Execution  
**Guardrail ID:** xeoztij22wed  
**Violations Table:** opx-guardrail-violations

## Authorization Status

✅ Authorized to execute all 4 validation gates  
✅ Authorized for real Bedrock calls  
✅ Authorized for alarm testing  
✅ Authorized for intentional failure injection  

❌ NOT authorized to promote to prod (pending validation)  
❌ NOT authorized to relax alarms  
❌ NOT authorized to add bypass flags  
❌ NOT authorized to change enforcement semantics  

## Validation Gates

### Gate 1: Real Bedrock PII Block Test

**Objective:** Verify actual Bedrock enforcement, not mocks

**Test Inputs:**
- Email: user@example.com
- Phone: 555-123-4567
- SSN-like: 123-45-6789
- AWS key-like: AKIAIOSFODNN7EXAMPLE

**Success Criteria (ALL required):**
1. ✅ Bedrock blocks the request
2. ✅ Lambda returns graceful degradation response
3. ✅ DynamoDB record is written (with redacted PII)
4. ✅ CloudWatch metric increments once

**Failure = Gate fails**

**Execution Method:**
```bash
# Invoke agent with PII
aws bedrock-agent-runtime invoke-agent \
  --agent-id <agent-id> \
  --agent-alias-id <alias-id> \
  --session-id test-pii-block \
  --input-text "My email is user@example.com and SSN is 123-45-6789" \
  --guardrail-identifier xeoztij22wed \
  --guardrail-version DRAFT
```

**Verification:**
```bash
# Check DynamoDB for violation record
aws dynamodb scan --table-name opx-guardrail-violations --limit 1

# Check CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace OPX/Guardrails \
  --metric-name ViolationCount \
  --dimensions Name=ViolationType,Value=PII \
  --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

---

### Gate 2: WARN Mode Does Not Block

**Objective:** Validate ALLOW + LOG path for non-blocking violations

**Test Inputs:**
- Mild profanity: "damn"
- Non-violent misconduct: "I'll skip the meeting"

**Success Criteria (ALL required):**
1. ✅ Agent response is returned (NOT blocked)
2. ✅ Violation logged as WARN in DynamoDB
3. ✅ No exception thrown
4. ✅ No retries triggered

**CRITICAL:** If WARN blocks the agent → HARD FAILURE

**Execution Method:**
```bash
# Invoke agent with WARN-level content
aws bedrock-agent-runtime invoke-agent \
  --agent-id <agent-id> \
  --agent-alias-id <alias-id> \
  --session-id test-warn-mode \
  --input-text "This damn system is slow" \
  --guardrail-identifier xeoztij22wed \
  --guardrail-version DRAFT
```

**Verification:**
```bash
# Verify response was returned (not blocked)
# Check logs for WARN violation
# Verify no exceptions in CloudWatch Logs
```

---

### Gate 3: Alarm Sanity Check

**Objective:** Verify alarms fire and reset automatically

**Test Procedure:**
1. Trigger ≥2 PII blocks within 5 minutes
2. Wait for alarm to fire
3. Stop triggering violations
4. Wait for alarm to reset

**Success Criteria (ALL required):**
1. ✅ Alarm fires after threshold breach
2. ✅ SNS notification arrives
3. ✅ Alarm resets automatically when violations stop

**CRITICAL:** Sticky alarms = no prod approval

**Execution Method:**
```bash
# Trigger multiple PII violations
for i in {1..3}; do
  aws bedrock-agent-runtime invoke-agent \
    --agent-id <agent-id> \
    --agent-alias-id <alias-id> \
    --session-id test-alarm-$i \
    --input-text "Email: test$i@example.com" \
    --guardrail-identifier xeoztij22wed \
    --guardrail-version DRAFT
  sleep 30
done
```

**Verification:**
```bash
# Check alarm state
aws cloudwatch describe-alarms \
  --alarm-names "OpxPhase6Stack-GuardrailAlarmsHighPIIViolationRate*"

# Wait 10 minutes, verify alarm returns to OK
```

---

### Gate 4: Failure Isolation Test (MOST IMPORTANT)

**Objective:** Prove guardrails are non-blocking by design

**Test Scenarios:**
1. DynamoDB throttling (set table to provisioned with 1 RCU/WCU)
2. CloudWatch PutMetricData failure (IAM deny)

**Success Criteria (ALL required):**
1. ✅ Agent response still completes
2. ✅ No exception leaks to caller
3. ✅ Failure is logged only

**CRITICAL:** If agent fails due to guardrail failure → FIX BEFORE ANYTHING ELSE

**Execution Method:**

**Scenario A: DynamoDB Throttling**
```bash
# Temporarily set table to provisioned mode with low capacity
aws dynamodb update-table \
  --table-name opx-guardrail-violations \
  --billing-mode PROVISIONED \
  --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1

# Trigger multiple violations rapidly to cause throttling
for i in {1..10}; do
  aws bedrock-agent-runtime invoke-agent \
    --agent-id <agent-id> \
    --agent-alias-id <alias-id> \
    --session-id test-throttle-$i \
    --input-text "Email: throttle$i@example.com" \
    --guardrail-identifier xeoztij22wed \
    --guardrail-version DRAFT &
done
wait

# Restore pay-per-request
aws dynamodb update-table \
  --table-name opx-guardrail-violations \
  --billing-mode PAY_PER_REQUEST
```

**Scenario B: Metrics Failure**
```bash
# Temporarily deny CloudWatch PutMetricData for Lambda role
# (Requires IAM policy modification - document only, don't execute without backup)

# Trigger violation
aws bedrock-agent-runtime invoke-agent \
  --agent-id <agent-id> \
  --agent-alias-id <alias-id> \
  --session-id test-metrics-fail \
  --input-text "Email: metricsfail@example.com" \
  --guardrail-identifier xeoztij22wed \
  --guardrail-version DRAFT

# Restore IAM permissions
```

**Verification:**
```bash
# Check Lambda logs for error handling
aws logs tail /aws/lambda/opx-phase6-executor --follow

# Verify agent response was still returned
# Verify no exceptions propagated to caller
```

---

## Evidence Collection for Prod Sign-Off

After completing all gates, collect:

### 1. DynamoDB Violation Record (Redacted)
```bash
aws dynamodb scan \
  --table-name opx-guardrail-violations \
  --limit 1 \
  --output json > violation-record.json
```

### 2. CloudWatch Metric Graph
```bash
aws cloudwatch get-metric-statistics \
  --namespace OPX/Guardrails \
  --metric-name ViolationCount \
  --dimensions Name=ViolationType,Value=PII \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --output json > metrics-graph.json
```

### 3. Alarm Fire + Reset Timestamps
```bash
aws cloudwatch describe-alarm-history \
  --alarm-name "OpxPhase6Stack-GuardrailAlarmsHighPIIViolationRate*" \
  --history-item-type StateUpdate \
  --max-records 10 \
  --output json > alarm-history.json
```

### 4. Log Excerpt from Failure Isolation Test
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/opx-phase6-executor \
  --filter-pattern "throttle OR error OR exception" \
  --start-time $(date -u -d '30 minutes ago' +%s)000 \
  --limit 50 \
  --output json > failure-isolation-logs.json
```

---

## Execution Checklist

- [ ] Gate 1: PII Block Test
  - [ ] Bedrock blocks
  - [ ] Graceful degradation
  - [ ] DynamoDB record
  - [ ] Metric increments

- [ ] Gate 2: WARN Non-Blocking
  - [ ] Response returned
  - [ ] WARN logged
  - [ ] No exceptions
  - [ ] No retries

- [ ] Gate 3: Alarm Sanity
  - [ ] Alarm fires
  - [ ] SNS notification
  - [ ] Alarm resets

- [ ] Gate 4: Failure Isolation
  - [ ] DynamoDB throttle test
  - [ ] Agent still responds
  - [ ] No exception leaks
  - [ ] Failure logged

- [ ] Evidence Collection
  - [ ] DynamoDB record
  - [ ] Metric graph
  - [ ] Alarm timestamps
  - [ ] Log excerpts

---

## Next Steps

1. Execute all 4 validation gates in order
2. Collect evidence for each gate
3. Document results
4. Return for prod sign-off with evidence

**Estimated Time:** 2-3 hours (including alarm reset wait times)

---

**Plan Created:** January 29, 2026  
**Ready to Execute:** YES  
**Blockers:** None
