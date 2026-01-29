# Phase 8.2: Deployment Checklist

**Date:** January 29, 2026  
**Status:** Ready for Deployment

## Pre-Deployment Checklist

### 1. Code Quality ✅
- [x] TypeScript compiles without errors
- [x] Python has no syntax errors
- [x] All 4 corrections applied
- [x] All governance rules followed

### 2. Tests Written ✅
- [x] 8 unit tests created
- [x] 7 integration tests created
- [ ] Unit tests executed and passing
- [ ] Integration tests executed and passing

### 3. Documentation ✅
- [x] Design document updated
- [x] Implementation summary created
- [x] Validation gates documented
- [x] Testing guide created

## Deployment Steps

### Step 1: Run Unit Tests
```bash
# Activate virtual environment
source venv/bin/activate

# Install test dependencies
pip install pytest pytest-asyncio moto boto3

# Run tests
./scripts/run-guardrail-tests.sh
```

**Expected Result:** All tests pass  
**Status:** ⏳ PENDING

---

### Step 2: Build Infrastructure
```bash
# Build TypeScript
npm run build

# Synthesize CDK
npx cdk synth OpxControlPlaneStack
```

**Expected Result:** No errors, CloudFormation template generated  
**Status:** ⏳ PENDING

---

### Step 3: Deploy Stack
```bash
# Deploy to AWS
npx cdk deploy OpxControlPlaneStack

# Confirm changes when prompted
```

**Expected Result:** Stack deployed successfully  
**Status:** ⏳ PENDING

**Outputs to Capture:**
- GuardrailId
- GuardrailArn
- GuardrailViolationsTableName

---

### Step 4: Verify Resources Created

#### 4.1: Verify Guardrail
```bash
GUARDRAIL_ID=$(aws cloudformation describe-stacks \
  --stack-name OpxControlPlaneStack \
  --query 'Stacks[0].Outputs[?OutputKey==`GuardrailId`].OutputValue' \
  --output text)

aws bedrock get-guardrail --guardrail-identifier $GUARDRAIL_ID
```

**Expected:** Guardrail details with all policies  
**Status:** ⏳ PENDING

---

#### 4.2: Verify DynamoDB Table
```bash
aws dynamodb describe-table --table-name opx-guardrail-violations
```

**Expected:** Table with 2 GSIs, no TTL  
**Status:** ⏳ PENDING

---

#### 4.3: Verify CloudWatch Alarms
```bash
aws cloudwatch describe-alarms \
  --alarm-names OPX-Guardrails-HighPIIViolationRate \
               OPX-Guardrails-HighContentViolationRate
```

**Expected:** 2 alarms in OK state  
**Status:** ⏳ PENDING

---

### Step 5: Execute Validation Gates

#### Gate 1: Real Bedrock PII Block Test
```bash
# Get agent ID and alias ID from your Bedrock console
AGENT_ID=<your-agent-id>
ALIAS_ID=<your-alias-id>

# Run validation script
./scripts/validate-guardrails.sh $AGENT_ID $ALIAS_ID
```

**Expected:** All PII tests block, DynamoDB records created, metrics emitted  
**Status:** ⏳ PENDING

---

#### Gate 2: WARN Mode Does Not Block
```bash
# Included in validation script above
```

**Expected:** Responses returned, WARN violations logged  
**Status:** ⏳ PENDING

---

#### Gate 3: Alarm Sanity Check
```bash
# Included in validation script above
# Wait 5-10 minutes for alarm to fire and reset
```

**Expected:** Alarm fires, SNS notification, alarm resets  
**Status:** ⏳ PENDING

---

#### Gate 4: Failure Isolation Test

##### 4.1: Get Lambda Role Name
```bash
LAMBDA_ROLE=$(aws lambda get-function \
  --function-name opx-agent-orchestrator \
  --query 'Configuration.Role' \
  --output text | cut -d'/' -f2)

echo "Lambda Role: $LAMBDA_ROLE"
```

##### 4.2: Remove DynamoDB Permissions
```bash
# List attached policies
aws iam list-attached-role-policies --role-name $LAMBDA_ROLE

# Detach DynamoDB policy (note the policy ARN)
aws iam detach-role-policy \
  --role-name $LAMBDA_ROLE \
  --policy-arn <dynamodb-policy-arn>
```

##### 4.3: Test Agent Invocation
```bash
# Invoke agent with PII
aws bedrock-agent-runtime invoke-agent \
  --agent-id $AGENT_ID \
  --agent-alias-id $ALIAS_ID \
  --session-id test-failure-$(date +%s) \
  --input-text "My email is user@example.com" \
  --guardrail-identifier $GUARDRAIL_ID \
  --guardrail-version 1
```

**Expected:** Agent completes, no exception thrown  
**Status:** ⏳ PENDING

##### 4.4: Check CloudWatch Logs
```bash
# Get log group name
LOG_GROUP=/aws/lambda/opx-agent-orchestrator

# Check for error
aws logs filter-log-events \
  --log-group-name $LOG_GROUP \
  --filter-pattern "ERROR: Failed to store guardrail violation" \
  --start-time $(($(date +%s) - 300))000
```

**Expected:** Error logged, not thrown  
**Status:** ⏳ PENDING

##### 4.5: Restore Permissions
```bash
# Reattach DynamoDB policy
aws iam attach-role-policy \
  --role-name $LAMBDA_ROLE \
  --policy-arn <dynamodb-policy-arn>
```

**Expected:** Permissions restored  
**Status:** ⏳ PENDING

---

## Post-Deployment Verification

### 1. Query Violations
```bash
# Query all violations
aws dynamodb scan \
  --table-name opx-guardrail-violations \
  --limit 10

# Query by agent
aws dynamodb query \
  --table-name opx-guardrail-violations \
  --index-name agentId-timestamp-index \
  --key-condition-expression "agentId = :aid" \
  --expression-attribute-values '{":aid":{"S":"signal-intelligence"}}'

# Query by type
aws dynamodb query \
  --table-name opx-guardrail-violations \
  --index-name type-timestamp-index \
  --key-condition-expression "violationType = :vtype" \
  --expression-attribute-values '{":vtype":{"S":"PII"}}'
```

**Expected:** Violation records with redacted content  
**Status:** ⏳ PENDING

---

### 2. Check CloudWatch Metrics
```bash
# PII violations
aws cloudwatch get-metric-statistics \
  --namespace OPX/Guardrails \
  --metric-name ViolationCount \
  --dimensions Name=ViolationType,Value=PII Name=Action,Value=BLOCK \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum

# Content violations
aws cloudwatch get-metric-statistics \
  --namespace OPX/Guardrails \
  --metric-name ViolationCount \
  --dimensions Name=ViolationType,Value=CONTENT Name=Action,Value=WARN \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

**Expected:** Metric data points  
**Status:** ⏳ PENDING

---

### 3. Verify No incidentId in Metrics
```bash
# List all metric dimensions
aws cloudwatch list-metrics \
  --namespace OPX/Guardrails \
  --metric-name ViolationCount

# Verify dimensions are only: AgentId, ViolationType, Action
```

**Expected:** NO IncidentId dimension  
**Status:** ⏳ PENDING

---

## Validation Gate Results

| Gate | Test | Status | Evidence |
|------|------|--------|----------|
| 1 | Email PII Block | ⏳ | |
| 1 | Phone PII Block | ⏳ | |
| 1 | AWS Key PII Block | ⏳ | |
| 2 | Mild Profanity WARN | ⏳ | |
| 2 | Misconduct WARN | ⏳ | |
| 3 | Alarm Fires | ⏳ | |
| 3 | Alarm Resets | ⏳ | |
| 4 | DynamoDB Failure Isolation | ⏳ | |

**Overall Status:** ⏳ PENDING

---

## Production Approval Criteria

- [ ] All 4 validation gates pass
- [ ] All tests documented in PHASE_8.2_VALIDATION_GATES.md
- [ ] Evidence collected (logs, screenshots, metrics)
- [ ] No exceptions leaked during failure tests
- [ ] Alarms fire and reset correctly
- [ ] Metrics have no incidentId dimension

**Production Approval:** ⏳ CONDITIONAL

---

## Rollback Plan

If issues are found:

```bash
# Rollback CDK stack
npx cdk deploy OpxControlPlaneStack --rollback

# Or delete guardrail resources
aws bedrock delete-guardrail --guardrail-identifier $GUARDRAIL_ID

# Delete DynamoDB table
aws dynamodb delete-table --table-name opx-guardrail-violations

# Delete alarms
aws cloudwatch delete-alarms \
  --alarm-names OPX-Guardrails-HighPIIViolationRate \
               OPX-Guardrails-HighContentViolationRate
```

---

## Support

**Issues?** Check:
1. CloudWatch logs: `/aws/lambda/opx-agent-orchestrator`
2. DynamoDB table: `opx-guardrail-violations`
3. CloudWatch metrics: `OPX/Guardrails` namespace
4. Alarm state: CloudWatch console

**Questions?** Review:
- `PHASE_8.2_VALIDATION_GATES.md` - Detailed test procedures
- `PHASE_8.2_IMPLEMENTATION_COMPLETE.md` - Implementation details
- `PHASE_8.2_GUARDRAILS_DESIGN.md` - Design decisions

---

**Created:** January 29, 2026  
**Ready for Deployment:** YES  
**Estimated Deployment Time:** 30 minutes  
**Estimated Validation Time:** 2-3 hours
