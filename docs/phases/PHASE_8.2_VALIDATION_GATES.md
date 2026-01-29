# Phase 8.2: Validation Gates - Testing Checklist

**Date:** January 29, 2026  
**Status:** ⏳ AWAITING VALIDATION  
**Production Approval:** CONDITIONAL on all 4 gates passing

## Architectural Decision

✅ Phase 8.2 is APPROVED for TESTING  
⏳ Production approval is CONDITIONAL on validation gates below

## Mandatory Validation Gates

**DO NOT SKIP** - All four must be green before production deployment.

---

## Gate 1: Real Bedrock PII Block Test ⏳

**Objective:** Verify actual Bedrock enforcement, not mocks.

### Test Cases

#### Test 1.1: Email Detection
```bash
# Input
"My email is user@example.com"

# Expected Results
✅ Block happens (Bedrock returns BLOCKED)
✅ Lambda returns graceful degradation
✅ DynamoDB record is written
✅ Metric increments once
```

**Status:** ⏳ NOT TESTED  
**Evidence Required:** CloudWatch logs, DynamoDB scan, metrics screenshot

---

#### Test 1.2: Phone Detection
```bash
# Input
"Call me at 555-123-4567"

# Expected Results
✅ Block happens
✅ Lambda returns graceful degradation
✅ DynamoDB record is written
✅ Metric increments once
```

**Status:** ⏳ NOT TESTED  
**Evidence Required:** CloudWatch logs, DynamoDB scan, metrics screenshot

---

#### Test 1.3: AWS Key-like String Detection
```bash
# Input
"My access key is AKIAIOSFODNN7EXAMPLE"

# Expected Results
✅ Block happens
✅ Lambda returns graceful degradation
✅ DynamoDB record is written
✅ Metric increments once
```

**Status:** ⏳ NOT TESTED  
**Evidence Required:** CloudWatch logs, DynamoDB scan, metrics screenshot

---

### Gate 1 Validation Commands

```bash
# 1. Deploy stack
npx cdk deploy OpxControlPlaneStack

# 2. Get guardrail ID from outputs
GUARDRAIL_ID=$(aws cloudformation describe-stacks \
  --stack-name OpxControlPlaneStack \
  --query 'Stacks[0].Outputs[?OutputKey==`GuardrailId`].OutputValue' \
  --output text)

# 3. Test email detection
aws bedrock-agent-runtime invoke-agent \
  --agent-id <agent-id> \
  --agent-alias-id <alias-id> \
  --session-id test-email-$(date +%s) \
  --input-text "My email is user@example.com" \
  --guardrail-identifier $GUARDRAIL_ID \
  --guardrail-version 1

# 4. Verify DynamoDB record
aws dynamodb scan \
  --table-name opx-guardrail-violations \
  --filter-expression "contains(content.#input, :email)" \
  --expression-attribute-names '{"#input":"input"}' \
  --expression-attribute-values '{":email":{"S":"[EMAIL]"}}' \
  --limit 1

# 5. Verify CloudWatch metric
aws cloudwatch get-metric-statistics \
  --namespace OPX/Guardrails \
  --metric-name ViolationCount \
  --dimensions Name=ViolationType,Value=PII Name=Action,Value=BLOCK \
  --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

**Gate 1 Status:** ⏳ PENDING

---

## Gate 2: WARN Mode Does Not Block ⏳

**Objective:** Validate ALLOW + LOG path (non-blocking violations).

### Test Cases

#### Test 2.1: Mild Profanity
```bash
# Input
"This is a damn good solution"

# Expected Results
✅ Agent response is returned (NOT blocked)
✅ Violation logged as WARN
✅ No exception thrown
✅ No retries triggered
```

**Status:** ⏳ NOT TESTED  
**Evidence Required:** Agent response JSON, DynamoDB record showing action=WARN

---

#### Test 2.2: Non-violent Misconduct Phrasing
```bash
# Input
"We could potentially bypass this check"

# Expected Results
✅ Agent response is returned (NOT blocked)
✅ Violation logged as WARN
✅ No exception thrown
✅ No retries triggered
```

**Status:** ⏳ NOT TESTED  
**Evidence Required:** Agent response JSON, DynamoDB record showing action=WARN

---

### Gate 2 Validation Commands

```bash
# 1. Test mild profanity
aws bedrock-agent-runtime invoke-agent \
  --agent-id <agent-id> \
  --agent-alias-id <alias-id> \
  --session-id test-profanity-$(date +%s) \
  --input-text "This is a damn good solution" \
  --guardrail-identifier $GUARDRAIL_ID \
  --guardrail-version 1

# 2. Verify response returned (not blocked)
# Check exit code = 0 and response contains output

# 3. Verify WARN violation logged
aws dynamodb query \
  --table-name opx-guardrail-violations \
  --index-name type-timestamp-index \
  --key-condition-expression "violationType = :vtype" \
  --expression-attribute-values '{":vtype":{"S":"CONTENT"}}' \
  --scan-index-forward false \
  --limit 1

# 4. Verify action = WARN
# Check violation.action = "WARN" in DynamoDB record
```

**Gate 2 Status:** ⏳ PENDING

---

## Gate 3: Alarm Sanity Check ⏳

**Objective:** Verify alarms fire and reset correctly.

### Test Case

#### Test 3.1: High PII Violation Rate Alarm
```bash
# Trigger: ≥2 PII blocks within 5 minutes

# Expected Results
✅ Alarm fires (state = ALARM)
✅ SNS notification arrives
✅ Alarm resets when violations stop (state = OK)
```

**Status:** ⏳ NOT TESTED  
**Evidence Required:** CloudWatch alarm state transitions, SNS email/SMS

---

### Gate 3 Validation Commands

```bash
# 1. Trigger multiple PII violations rapidly
for i in {1..3}; do
  aws bedrock-agent-runtime invoke-agent \
    --agent-id <agent-id> \
    --agent-alias-id <alias-id> \
    --session-id test-alarm-$i \
    --input-text "My email is user$i@example.com" \
    --guardrail-identifier $GUARDRAIL_ID \
    --guardrail-version 1
  sleep 10
done

# 2. Check alarm state
aws cloudwatch describe-alarms \
  --alarm-names OPX-Guardrails-HighPIIViolationRate

# 3. Wait 10 minutes (no more violations)

# 4. Verify alarm resets to OK
aws cloudwatch describe-alarms \
  --alarm-names OPX-Guardrails-HighPIIViolationRate \
  --query 'MetricAlarms[0].StateValue'

# Expected: "OK"
```

**Gate 3 Status:** ⏳ PENDING

---

## Gate 4: Failure Isolation Test (CRITICAL) ⏳

**Objective:** Prove guardrails are non-blocking by design, not by accident.

### Test Cases

#### Test 4.1: DynamoDB Throttling
```bash
# Force failure: Temporarily remove DynamoDB write permissions

# Expected Results
✅ Agent response still completes
✅ No exception leaks
✅ Failure is logged only (CloudWatch logs)
```

**Status:** ⏳ NOT TESTED  
**Evidence Required:** Agent response JSON, CloudWatch logs showing error

---

#### Test 4.2: Metrics Emission Failure
```bash
# Force failure: Temporarily remove CloudWatch PutMetricData permissions

# Expected Results
✅ Agent response still completes
✅ No exception leaks
✅ Failure is logged only (CloudWatch logs)
```

**Status:** ⏳ NOT TESTED  
**Evidence Required:** Agent response JSON, CloudWatch logs showing error

---

### Gate 4 Validation Commands

```bash
# Test 4.1: DynamoDB Throttling
# 1. Remove DynamoDB write permissions from Lambda role
aws iam detach-role-policy \
  --role-name <lambda-role-name> \
  --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess

# 2. Invoke agent with PII
aws bedrock-agent-runtime invoke-agent \
  --agent-id <agent-id> \
  --agent-alias-id <alias-id> \
  --session-id test-failure-$(date +%s) \
  --input-text "My email is user@example.com" \
  --guardrail-identifier $GUARDRAIL_ID \
  --guardrail-version 1

# 3. Verify agent response still returned
# Check exit code = 0 and response contains output

# 4. Check CloudWatch logs for error
aws logs filter-log-events \
  --log-group-name /aws/lambda/<lambda-name> \
  --filter-pattern "ERROR: Failed to store guardrail violation" \
  --start-time $(date -u -d '5 minutes ago' +%s)000

# 5. Restore permissions
aws iam attach-role-policy \
  --role-name <lambda-role-name> \
  --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess

# Test 4.2: Metrics Emission Failure
# Similar process for CloudWatch permissions
```

**Gate 4 Status:** ⏳ PENDING

---

## Non-Negotiable Rules (Verified in Implementation)

These rules were followed in implementation and must remain true:

- ✅ Guardrails never change agent decisions
- ✅ Guardrails never enrich prompts
- ✅ Guardrails never add retry loops
- ✅ Guardrails never depend on incident lifecycle

**Verification:** Code review confirms all rules followed.

---

## Overall Status

| Gate | Status | Blocker |
|------|--------|---------|
| Gate 1: Real Bedrock PII Block | ⏳ PENDING | Requires deployed Bedrock Agent |
| Gate 2: WARN Mode Does Not Block | ⏳ PENDING | Requires deployed Bedrock Agent |
| Gate 3: Alarm Sanity Check | ⏳ PENDING | Requires 5+ minutes of testing |
| Gate 4: Failure Isolation | ⏳ PENDING | Requires permission manipulation |

**Production Approval:** ⏳ CONDITIONAL (0/4 gates passed)

---

## Next Steps

1. **Deploy Infrastructure**
   ```bash
   npx cdk deploy OpxControlPlaneStack
   ```

2. **Execute Gate 1 Tests**
   - Test email detection
   - Test phone detection
   - Test AWS key detection
   - Verify all 4 confirmations for each

3. **Execute Gate 2 Tests**
   - Test mild profanity
   - Test misconduct phrasing
   - Verify response returned, WARN logged

4. **Execute Gate 3 Tests**
   - Trigger alarm
   - Verify SNS notification
   - Verify alarm reset

5. **Execute Gate 4 Tests**
   - Test DynamoDB failure isolation
   - Test CloudWatch failure isolation
   - Verify agent continues

6. **Document Results**
   - Update this file with ✅ or ❌ for each test
   - Attach evidence (logs, screenshots, metrics)
   - Get production approval

---

## Evidence Collection Template

For each gate, collect:

1. **Command executed**
2. **Response received** (JSON)
3. **DynamoDB record** (if applicable)
4. **CloudWatch logs** (error messages)
5. **CloudWatch metrics** (screenshots)
6. **Alarm state** (if applicable)

Store evidence in: `docs/phase-8/validation-evidence/`

---

**Created:** January 29, 2026  
**Last Updated:** January 29, 2026  
**Status:** Ready for validation testing  
**Estimated Testing Time:** 2-3 hours
