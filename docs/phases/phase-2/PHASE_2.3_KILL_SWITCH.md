# Phase 2.3 Kill Switch Procedures

**Version:** 1.0.0  
**Date:** 2026-01-19  
**Purpose:** Emergency procedures to immediately stop the incident orchestration pipeline

---

## ⚠️ WHEN TO USE THE KILL SWITCH

Use the kill switch **IMMEDIATELY** if any of these conditions occur:

1. **Duplicate incidents detected** (MOST CRITICAL)
   - Same signal creates multiple incidents
   - Same candidate creates multiple incidents
   - Replay test shows duplicate incidents

2. **Data corruption detected**
   - Incidents with wrong data
   - Candidates with wrong data
   - Identity computation errors

3. **Runaway incident creation**
   - Incident creation rate > 100/minute
   - Unexpected incident volume
   - Incidents created for non-existent signals

4. **Critical security issue**
   - Unauthorized access detected
   - Data leak suspected
   - IAM policy violation

5. **AWS service degradation**
   - DynamoDB throttling > 1%
   - Lambda error rate > 5%
   - EventBridge delivery failures

---

## 🔴 KILL SWITCH PROCEDURE

### Step 1: DISABLE EVENTBRIDGE RULES (30 seconds)

**This stops all new processing immediately.**

```bash
# Disable signal ingestion → correlation
aws events disable-rule \
  --event-bus-name opx-audit-events \
  --name opx-signal-ingested-to-correlator

# Disable candidate → incident processing
aws events disable-rule \
  --event-bus-name opx-audit-events \
  --name opx-candidate-created-to-processor

# Verify rules disabled
aws events describe-rule \
  --event-bus-name opx-audit-events \
  --name opx-signal-ingested-to-correlator \
  --query "State"

aws events describe-rule \
  --event-bus-name opx-audit-events \
  --name opx-candidate-created-to-processor \
  --query "State"

# Expected output: "DISABLED" for both
```

**What this does:**
- ✅ Stops correlator from processing new signals
- ✅ Stops candidate processor from creating incidents
- ✅ Signals still ingested (safe to continue)
- ✅ No data loss (events queued in EventBridge)
- ✅ Reversible (can re-enable later)

**What this does NOT do:**
- ❌ Does NOT stop signal ingestion (SNS → Lambda still active)
- ❌ Does NOT delete existing data
- ❌ Does NOT affect existing incidents

---

### Step 2: VERIFY PIPELINE STOPPED (1 minute)

```bash
# Wait 60 seconds for in-flight operations to complete
sleep 60

# Check for new candidates (should be 0)
CANDIDATES_BEFORE=$(aws dynamodb scan --table-name opx-candidates --select COUNT --query Count --output text)
sleep 30
CANDIDATES_AFTER=$(aws dynamodb scan --table-name opx-candidates --select COUNT --query Count --output text)

if [ "$CANDIDATES_BEFORE" -eq "$CANDIDATES_AFTER" ]; then
  echo "✅ Pipeline stopped - no new candidates"
else
  echo "⚠️ WARNING: Candidates still being created"
fi

# Check for new incidents (should be 0)
INCIDENTS_BEFORE=$(aws dynamodb scan --table-name opx-incidents --select COUNT --query Count --output text)
sleep 30
INCIDENTS_AFTER=$(aws dynamodb scan --table-name opx-incidents --select COUNT --query Count --output text)

if [ "$INCIDENTS_BEFORE" -eq "$INCIDENTS_AFTER" ]; then
  echo "✅ Pipeline stopped - no new incidents"
else
  echo "⚠️ WARNING: Incidents still being created"
fi
```

---

### Step 3: NOTIFY STAKEHOLDERS (2 minutes)

**Slack:**
```
@channel KILL SWITCH ACTIVATED

Pipeline: Incident Orchestration (Phase 2.3)
Reason: [DUPLICATE INCIDENTS / DATA CORRUPTION / RUNAWAY CREATION / SECURITY / AWS DEGRADATION]
Time: [TIMESTAMP]
Status: Pipeline STOPPED
Impact: No new incidents will be created
Action: Investigation in progress

Incident Commander: [YOUR NAME]
```

**Email:**
- Engineering Manager
- On-call team
- Product Manager

---

### Step 4: COLLECT EVIDENCE (5 minutes)

```bash
# Create evidence directory
mkdir -p kill-switch-$(date +%Y%m%d-%H%M%S)
cd kill-switch-$(date +%Y%m%d-%H%M%S)

# Export all DynamoDB tables
aws dynamodb scan --table-name opx-signals > signals.json
aws dynamodb scan --table-name opx-candidates > candidates.json
aws dynamodb scan --table-name opx-incidents > incidents.json
aws dynamodb scan --table-name opx-promotion-decisions > decisions.json
aws dynamodb scan --table-name opx-orchestration-log > orchestration.json

# Export Lambda logs (last 2 hours)
aws logs tail /aws/lambda/opx-signal-ingestor --since 2h > ingestor.log
aws logs tail /aws/lambda/opx-correlator --since 2h > correlator.log
aws logs tail /aws/lambda/opx-candidate-processor --since 2h > processor.log

# Export CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=opx-correlator \
  --start-time $(date -u -d '2 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum > metrics-correlator.json

aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=opx-candidate-processor \
  --start-time $(date -u -d '2 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum > errors-processor.json

# Create summary
echo "Kill Switch Activated: $(date)" > SUMMARY.txt
echo "Reason: [FILL IN]" >> SUMMARY.txt
echo "Signals: $(cat signals.json | jq '.Count')" >> SUMMARY.txt
echo "Candidates: $(cat candidates.json | jq '.Count')" >> SUMMARY.txt
echo "Incidents: $(cat incidents.json | jq '.Count')" >> SUMMARY.txt
```

---

### Step 5: ANALYZE ROOT CAUSE (Offline)

**DO NOT attempt to fix in production.**

1. **Identify duplicate incidents:**
   ```bash
   # Find duplicate incident IDs
   cat incidents.json | jq -r '.Items[].incidentId.S' | sort | uniq -d
   
   # Find incidents with same candidateId
   cat incidents.json | jq -r '.Items[] | "\(.candidateId.S) \(.incidentId.S)"' | sort
   ```

2. **Check identity computation:**
   - Review incident ID generation logic
   - Check for non-deterministic inputs (timestamps, UUIDs)
   - Verify hash computation

3. **Check idempotency:**
   - Review CP-6 promotion engine
   - Review CP-7 incident manager
   - Check for race conditions

4. **Reproduce in dev:**
   - Deploy same code to dev environment
   - Send same signals
   - Verify duplicate behavior

---

## 🟢 RE-ENABLING THE PIPELINE

**DO NOT re-enable until:**
- [ ] Root cause identified
- [ ] Fix implemented and tested in dev
- [ ] Replay tests pass 100%
- [ ] No duplicate incidents in dev
- [ ] Code review completed
- [ ] Incident commander approves

### Re-Enable Procedure

**Step 1: Deploy Fix**
```bash
cd infra
cdk diff  # Review changes
cdk deploy --require-approval never
```

**Step 2: Verify Fix in Dev**
```bash
# Run full replay test suite
npm test -- test/orchestration/replay-determinism.test.ts

# Verify no duplicates
npm test -- test/integration/idempotency.integration.test.ts
```

**Step 3: Enable Rules (One at a Time)**
```bash
# Enable correlation first
aws events enable-rule \
  --event-bus-name opx-audit-events \
  --name opx-signal-ingested-to-correlator

# Wait 10 minutes, monitor for issues
sleep 600

# Check for errors
aws logs tail /aws/lambda/opx-correlator --since 10m --format short | grep ERROR

# If no errors, enable candidate processing
aws events enable-rule \
  --event-bus-name opx-audit-events \
  --name opx-candidate-created-to-processor
```

**Step 4: Monitor for 1 Hour**
```bash
# Watch for duplicate incidents
watch -n 60 'aws dynamodb scan --table-name opx-incidents --select COUNT'

# Watch for errors
watch -n 60 'aws logs tail /aws/lambda/opx-candidate-processor --since 5m --format short | grep ERROR'
```

**Step 5: Run Replay Test in Production**
```bash
# Send test signal
aws sns publish \
  --topic-arn arn:aws:sns:us-east-1:998461587244:opx-cloudwatch-alarms \
  --message file://test-signals/signal-1.json

# Wait for incident creation
sleep 120

# Get incident ID
INCIDENT_ID=$(aws dynamodb scan --table-name opx-incidents --limit 1 --query 'Items[0].incidentId.S' --output text)

# Replay same signal
aws sns publish \
  --topic-arn arn:aws:sns:us-east-1:998461587244:opx-cloudwatch-alarms \
  --message file://test-signals/signal-1.json

# Wait for processing
sleep 120

# Verify NO new incident
INCIDENT_COUNT=$(aws dynamodb scan --table-name opx-incidents --select COUNT --query Count --output text)

if [ "$INCIDENT_COUNT" -eq "1" ]; then
  echo "✅ REPLAY TEST PASSED - No duplicate incident"
else
  echo "❌ REPLAY TEST FAILED - Duplicate incident detected"
  echo "🔴 DISABLE RULES IMMEDIATELY"
fi
```

**Step 6: Notify Stakeholders**
```
@channel PIPELINE RE-ENABLED

Pipeline: Incident Orchestration (Phase 2.3)
Time: [TIMESTAMP]
Status: Pipeline ACTIVE
Fix: [DESCRIPTION]
Monitoring: Active for 24 hours

Incident Commander: [YOUR NAME]
```

---

## 🔴 EMERGENCY CONTACTS

**Immediate Response:**
- On-Call Engineer: [Rotation]
- Slack: #opx-incidents-oncall

**Escalation (if issue persists > 15 minutes):**
- Engineering Manager: [Name]
- Senior Engineer: [Name]

**AWS Support (if AWS service issue):**
- Support Case Portal: [URL]
- TAM (if available): [Name]

---

## 📋 KILL SWITCH CHECKLIST

Print this and keep near your desk:

```
KILL SWITCH ACTIVATION CHECKLIST

□ Step 1: Disable EventBridge rules (30s)
  □ opx-signal-ingested-to-correlator
  □ opx-candidate-created-to-processor
  □ Verify both show "DISABLED"

□ Step 2: Verify pipeline stopped (1m)
  □ No new candidates
  □ No new incidents

□ Step 3: Notify stakeholders (2m)
  □ Slack #opx-incidents-oncall
  □ Email engineering manager
  □ Email on-call team

□ Step 4: Collect evidence (5m)
  □ Export DynamoDB tables
  □ Export Lambda logs
  □ Export CloudWatch metrics
  □ Create summary

□ Step 5: Analyze root cause (Offline)
  □ Identify duplicates
  □ Check identity computation
  □ Reproduce in dev
  □ DO NOT fix in production

RE-ENABLE CHECKLIST

□ Root cause identified
□ Fix implemented in dev
□ Replay tests pass 100%
□ No duplicates in dev
□ Code review completed
□ Incident commander approval

□ Deploy fix to production
□ Enable correlation rule
□ Monitor 10 minutes
□ Enable candidate processing rule
□ Monitor 1 hour
□ Run replay test in production
□ Verify no duplicates
□ Notify stakeholders
```

---

## 🧪 KILL SWITCH TEST PROCEDURE

**Test the kill switch quarterly to ensure it works.**

### Test Plan

1. **Schedule test:**
   - Off-peak hours
   - Notify team in advance
   - Prepare rollback plan

2. **Execute test:**
   ```bash
   # Disable rules
   bash scripts/kill-switch-disable.sh
   
   # Verify stopped
   bash scripts/kill-switch-verify.sh
   
   # Wait 5 minutes
   sleep 300
   
   # Re-enable
   bash scripts/kill-switch-enable.sh
   
   # Verify working
   bash scripts/quick-verify.sh
   ```

3. **Document results:**
   - Time to disable: [X seconds]
   - Time to verify: [X seconds]
   - Time to re-enable: [X seconds]
   - Issues encountered: [NONE / LIST]

4. **Update procedures:**
   - Fix any issues found
   - Update documentation
   - Train team on changes

---

## 📝 INCIDENT REPORT TEMPLATE

After using the kill switch, file an incident report:

```markdown
# Incident Report: Kill Switch Activation

**Date:** [YYYY-MM-DD]
**Time:** [HH:MM UTC]
**Duration:** [X hours]
**Severity:** [P0 / P1 / P2]

## Summary
[One paragraph describing what happened]

## Timeline
- [HH:MM] Issue detected
- [HH:MM] Kill switch activated
- [HH:MM] Root cause identified
- [HH:MM] Fix deployed
- [HH:MM] Pipeline re-enabled
- [HH:MM] Incident resolved

## Root Cause
[Detailed explanation of what caused the issue]

## Impact
- Signals affected: [X]
- Candidates affected: [X]
- Incidents affected: [X]
- Duplicate incidents created: [X]
- Downtime: [X minutes]

## Resolution
[What was done to fix the issue]

## Prevention
[What will be done to prevent recurrence]

## Action Items
- [ ] [Action 1]
- [ ] [Action 2]
- [ ] [Action 3]

## Lessons Learned
[What we learned from this incident]
```

---

**Last Updated:** 2026-01-19  
**Next Test:** 2026-04-19  
**Next Review:** After each activation
