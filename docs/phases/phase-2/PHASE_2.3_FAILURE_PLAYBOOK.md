# Phase 2.3 Incident Orchestration - Failure Playbook

**Version:** 1.0.0  
**Date:** 2026-01-19  
**Purpose:** Step-by-step procedures for handling failures in the incident orchestration pipeline

---

## Table of Contents

1. [Signal Ingestion Failures](#signal-ingestion-failures)
2. [Correlation Engine Failures](#correlation-engine-failures)
3. [Candidate Processing Failures](#candidate-processing-failures)
4. [DynamoDB Failures](#dynamodb-failures)
5. [EventBridge Failures](#eventbridge-failures)
6. [Duplicate Incident Detection](#duplicate-incident-detection)
7. [Complete Pipeline Outage](#complete-pipeline-outage)

---

## Signal Ingestion Failures

### Scenario: SNS → Lambda Invocation Failing

**Symptoms:**
- CloudWatch Alarms firing but no signals in opx-signals
- SNS delivery failures in SNS metrics
- No ingestor Lambda logs

**Impact:** HIGH - No signals entering system

**Diagnosis:**
```bash
# Check SNS subscription status
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-east-1:998461587244:opx-cloudwatch-alarms

# Check Lambda status
aws lambda get-function --function-name opx-signal-ingestor

# Check recent Lambda errors
aws logs tail /aws/lambda/opx-signal-ingestor --since 30m --format short
```

**Resolution Steps:**

1. **Verify SNS subscription exists:**
   ```bash
   aws sns subscribe \
     --topic-arn arn:aws:sns:us-east-1:998461587244:opx-cloudwatch-alarms \
     --protocol lambda \
     --notification-endpoint arn:aws:lambda:us-east-1:998461587244:function:opx-signal-ingestor
   ```

2. **Verify Lambda permission:**
   ```bash
   aws lambda add-permission \
     --function-name opx-signal-ingestor \
     --statement-id sns-invoke \
     --action lambda:InvokeFunction \
     --principal sns.amazonaws.com \
     --source-arn arn:aws:sns:us-east-1:998461587244:opx-cloudwatch-alarms
   ```

3. **Test with manual signal:**
   ```bash
   aws sns publish \
     --topic-arn arn:aws:sns:us-east-1:998461587244:opx-cloudwatch-alarms \
     --message file://test-signals/signal-1.json
   ```

4. **Verify signal stored:**
   ```bash
   aws dynamodb scan --table-name opx-signals --select COUNT
   ```

**Escalation:** If issue persists after 15 minutes, page AWS support

---

### Scenario: Signal Normalization Errors

**Symptoms:**
- Lambda invocations successful
- Errors in logs: "Invalid signal format"
- No signals stored in DynamoDB

**Impact:** MEDIUM - Signals dropped, no incidents created

**Diagnosis:**
```bash
# Check recent errors
aws logs filter-pattern /aws/lambda/opx-signal-ingestor \
  --filter-pattern "ERROR" \
  --since 30m
```

**Resolution Steps:**

1. **Identify malformed signals:**
   - Check error logs for signal structure
   - Compare with expected CloudWatch Alarm format

2. **Verify signal format:**
   ```json
   {
     "AlarmName": "service-SEV1-alarm",
     "NewStateValue": "ALARM",
     "StateChangeTime": "2026-01-19T00:00:00.000Z",
     "AlarmDescription": "...",
     "AWSAccountId": "998461587244",
     "Region": "us-east-1"
   }
   ```

3. **Check normalization rules:**
   - Review `src/signal/signal-normalizer.ts`
   - Verify alarm name pattern: `{service}-{severity}-*`

4. **Temporary mitigation:**
   - Update normalization rules if needed
   - Deploy fix via CDK
   - Signals will be reprocessed on next alarm

**Escalation:** If normalization logic needs changes, consult Phase 2.1 design doc

---

## Correlation Engine Failures

### Scenario: Correlator Lambda Not Triggering

**Symptoms:**
- Signals in opx-signals
- No correlator logs
- No candidates created

**Impact:** HIGH - No correlation happening

**Diagnosis:**
```bash
# Check EventBridge rule
aws events describe-rule \
  --event-bus-name opx-audit-events \
  --name opx-signal-ingested-to-correlator

# Check rule targets
aws events list-targets-by-rule \
  --event-bus-name opx-audit-events \
  --rule opx-signal-ingested-to-correlator
```

**Resolution Steps:**

1. **Enable EventBridge rule:**
   ```bash
   aws events enable-rule \
     --event-bus-name opx-audit-events \
     --name opx-signal-ingested-to-correlator
   ```

2. **Verify event pattern:**
   ```json
   {
     "source": ["opx.signal"],
     "detail-type": ["SignalIngested"]
   }
   ```

3. **Check Lambda permission:**
   ```bash
   aws lambda get-policy --function-name opx-correlator
   ```

4. **Test with manual event:**
   ```bash
   aws events put-events \
     --entries file://test-event.json
   ```

5. **Verify correlator invoked:**
   ```bash
   aws logs tail /aws/lambda/opx-correlator --since 5m
   ```

**Escalation:** If EventBridge rule misconfigured, redeploy via CDK

---

### Scenario: Correlation Rules Not Loading

**Symptoms:**
- Correlator logs: "No enabled rules found"
- Rules exist in opx-correlation-rules
- No candidates created

**Impact:** HIGH - No correlation happening

**Diagnosis:**
```bash
# Check rules in DynamoDB
aws dynamodb scan \
  --table-name opx-correlation-rules \
  --query "Items[*].[ruleId.S, enabled.S]"

# Check correlator logs
aws logs tail /aws/lambda/opx-correlator --since 10m --format short
```

**Resolution Steps:**

1. **Verify rule format:**
   - Check `enabled` field is STRING ('true' or 'false'), not BOOLEAN
   - GSI requires STRING type

2. **Verify GSI exists:**
   ```bash
   aws dynamodb describe-table --table-name opx-correlation-rules \
     --query "Table.GlobalSecondaryIndexes[?IndexName=='enabled-index']"
   ```

3. **Reload rules:**
   ```bash
   npx ts-node scripts/load-test-correlation-rule.ts
   ```

4. **Verify rule loaded:**
   ```bash
   aws dynamodb get-item \
     --table-name opx-correlation-rules \
     --key '{"ruleId":{"S":"rule-test-high-severity"},"version":{"S":"1.0.0"}}'
   ```

**Escalation:** If GSI missing, redeploy table via CDK (requires data migration)

---

### Scenario: Threshold Not Met

**Symptoms:**
- Correlator running
- Rules matched
- No candidates created
- Logs: "Threshold not met"

**Impact:** LOW - Expected behavior for low signal volume

**Diagnosis:**
```bash
# Check correlator logs
aws logs tail /aws/lambda/opx-correlator --since 10m --format short | grep "threshold"

# Check signal count in window
aws dynamodb query \
  --table-name opx-signals \
  --index-name service-observedAt-index \
  --key-condition-expression "service = :s AND observedAt BETWEEN :start AND :end" \
  --expression-attribute-values '{":s":{"S":"testapi"},":start":{"S":"2026-01-19T00:00:00Z"},":end":{"S":"2026-01-19T00:05:00Z"}}'
```

**Resolution Steps:**

1. **Verify signal volume:**
   - Check if enough signals in time window
   - Threshold requires 2+ signals within 5 minutes

2. **Check time window alignment:**
   - Windows are fixed (00:00, 00:05, 00:10, etc.)
   - Signals must fall within same window

3. **Adjust threshold if needed:**
   - Update correlation rule
   - Reload via script

**Escalation:** This is expected behavior - no action needed unless threshold is misconfigured

---

## Candidate Processing Failures

### Scenario: Candidate Generation Blocked (CURRENT STATE)

**Symptoms:**
- Correlator logs: "Cannot build candidate with zero detections"
- Threshold met but no candidates created
- opx-candidates table empty

**Impact:** HIGH - No incidents created (EXPECTED until Phase 2.4)

**Diagnosis:**
```bash
# Check correlator logs
aws logs tail /aws/lambda/opx-correlator --since 10m --format short | grep "detection"
```

**Root Cause:**
CandidateBuilder requires detections from Phase 2.4 Detection Engine (not yet implemented).

**Resolution Steps:**

1. **Verify this is expected:**
   - Check `PHASE_2.3_STEP_8_BLOCKED.md`
   - Confirm Phase 2.4 not yet deployed

2. **No action needed:**
   - Pipeline is safe to leave running
   - Will automatically work once Phase 2.4 deployed

3. **Monitor for Phase 2.4 deployment:**
   - Detection Engine
   - Evidence Graph Builder
   - Normalization Engine

**Escalation:** Wait for Phase 2.4 deployment - no workaround available

---

### Scenario: Candidate Processor Lambda Failing

**Symptoms:**
- Candidates in opx-candidates
- Processor Lambda errors
- No incidents created
- DLQ messages

**Impact:** CRITICAL - Candidates not processed

**Diagnosis:**
```bash
# Check processor logs
aws logs tail /aws/lambda/opx-candidate-processor --since 30m --format short

# Check DLQ
aws sqs get-queue-attributes \
  --queue-url <DLQ_URL> \
  --attribute-names ApproximateNumberOfMessages
```

**Resolution Steps:**

1. **Check Lambda errors:**
   ```bash
   aws logs filter-pattern /aws/lambda/opx-candidate-processor \
     --filter-pattern "ERROR" \
     --since 30m
   ```

2. **Common errors:**
   - Candidate not found → Check opx-candidates table
   - Policy not found → Check opx-promotion-policies
   - DynamoDB throttling → Check capacity metrics

3. **Replay failed candidates:**
   - Candidates in DLQ will be retried automatically
   - Max retries: 3
   - After max retries, manual intervention needed

4. **Manual reprocessing:**
   ```bash
   # Get candidate from DLQ
   aws sqs receive-message --queue-url <DLQ_URL>
   
   # Reprocess via EventBridge
   aws events put-events --entries file://candidate-event.json
   ```

**Escalation:** If DLQ has > 10 messages, page on-call immediately

---

## DynamoDB Failures

### Scenario: Table Throttling

**Symptoms:**
- Lambda errors: `ProvisionedThroughputExceededException`
- CloudWatch metric: `ThrottledRequests` > 0
- Increased Lambda duration

**Impact:** CRITICAL - Data loss possible

**Diagnosis:**
```bash
# Check throttling metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ThrottledRequests \
  --dimensions Name=TableName,Value=opx-signals \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

**Resolution Steps:**

1. **Immediate mitigation:**
   - Tables use on-demand billing (should auto-scale)
   - Check for hot partitions

2. **Identify hot partition:**
   ```bash
   # Check write patterns
   aws dynamodb scan --table-name opx-signals \
     --projection-expression "pk" \
     --limit 100
   ```

3. **Temporary rate limiting:**
   - Reduce signal ingestion rate at source
   - Disable non-critical alarms

4. **Long-term fix:**
   - Review partition key design
   - Consider composite keys
   - Add write sharding

**Escalation:** If throttling persists > 5 minutes, page AWS support

---

### Scenario: Table Unavailable

**Symptoms:**
- Lambda errors: `ResourceNotFoundException`
- All operations failing
- AWS console shows table status: UPDATING or DELETING

**Impact:** CRITICAL - Complete outage

**Diagnosis:**
```bash
# Check table status
aws dynamodb describe-table --table-name opx-signals \
  --query "Table.TableStatus"
```

**Resolution Steps:**

1. **If status is UPDATING:**
   - Wait for update to complete (usually < 5 minutes)
   - Monitor status every 30 seconds

2. **If status is DELETING:**
   - **CRITICAL:** Table being deleted
   - Check CloudTrail for who initiated deletion
   - Restore from backup immediately

3. **Restore from backup:**
   ```bash
   # List available backups
   aws dynamodb list-backups --table-name opx-signals
   
   # Restore from latest backup
   aws dynamodb restore-table-from-backup \
     --target-table-name opx-signals \
     --backup-arn <BACKUP_ARN>
   ```

4. **Verify restoration:**
   ```bash
   aws dynamodb describe-table --table-name opx-signals
   ```

**Escalation:** Page on-call immediately, notify management

---

## EventBridge Failures

### Scenario: Events Not Delivered

**Symptoms:**
- Events emitted (logs show PutEvents success)
- Target Lambda not invoked
- No errors in EventBridge metrics

**Impact:** HIGH - Pipeline broken

**Diagnosis:**
```bash
# Check EventBridge metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Events \
  --metric-name FailedInvocations \
  --dimensions Name=RuleName,Value=opx-signal-ingested-to-correlator \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

**Resolution Steps:**

1. **Verify rule enabled:**
   ```bash
   aws events describe-rule \
     --event-bus-name opx-audit-events \
     --name opx-signal-ingested-to-correlator
   ```

2. **Verify event pattern matches:**
   - Check source: `opx.signal`
   - Check detail-type: `SignalIngested`
   - Case-sensitive match required

3. **Test event pattern:**
   ```bash
   aws events test-event-pattern \
     --event-pattern file://rule-pattern.json \
     --event file://test-event.json
   ```

4. **Check target configuration:**
   ```bash
   aws events list-targets-by-rule \
     --event-bus-name opx-audit-events \
     --rule opx-signal-ingested-to-correlator
   ```

**Escalation:** If event pattern is correct but events not delivered, contact AWS support

---

## Duplicate Incident Detection

### Scenario: DUPLICATE INCIDENT CREATED (CRITICAL)

**Symptoms:**
- Same signal → multiple incidents
- Same candidateId → multiple incidentIds
- Replay test fails

**Impact:** CRITICAL - System integrity compromised

**IMMEDIATE ACTIONS (DO NOT DELAY):**

1. **KILL SWITCH - DISABLE ALL EVENTBRIDGE RULES:**
   ```bash
   aws events disable-rule \
     --event-bus-name opx-audit-events \
     --name opx-signal-ingested-to-correlator
   
   aws events disable-rule \
     --event-bus-name opx-audit-events \
     --name opx-candidate-created-to-processor
   ```

2. **STOP ALL TESTING:**
   - Do NOT send more signals
   - Do NOT attempt to fix in production
   - Do NOT re-enable rules

3. **COLLECT EVIDENCE:**
   ```bash
   # Export duplicate incidents
   aws dynamodb scan --table-name opx-incidents > incidents-$(date +%s).json
   
   # Export candidates
   aws dynamodb scan --table-name opx-candidates > candidates-$(date +%s).json
   
   # Export orchestration log
   aws dynamodb scan --table-name opx-orchestration-log > orchestration-$(date +%s).json
   
   # Export all Lambda logs
   aws logs tail /aws/lambda/opx-signal-ingestor --since 2h > ingestor-$(date +%s).log
   aws logs tail /aws/lambda/opx-correlator --since 2h > correlator-$(date +%s).log
   aws logs tail /aws/lambda/opx-candidate-processor --since 2h > processor-$(date +%s).log
   ```

4. **IDENTIFY ROOT CAUSE:**
   - Check incident IDs for duplicates
   - Check candidateIds for duplicates
   - Check timestamps for replay
   - Check identity computation logic

5. **OFFLINE INVESTIGATION:**
   - Do NOT patch in production
   - Reproduce in dev environment
   - Fix identity computation
   - Add determinism tests
   - Verify fix with replay tests

6. **RECOVERY PLAN:**
   - Delete duplicate incidents (manual)
   - Verify identity computation fixed
   - Deploy fix to dev
   - Run full replay test suite
   - Deploy to prod only after 100% replay success
   - Re-enable rules one at a time
   - Monitor for 24 hours

**Escalation:** Page on-call, notify management, schedule incident review

---

## Complete Pipeline Outage

### Scenario: All Components Failing

**Symptoms:**
- No signals ingested
- No correlations
- No incidents
- Multiple Lambda errors

**Impact:** CRITICAL - Complete system failure

**Diagnosis:**
```bash
# Check all Lambda functions
for func in opx-signal-ingestor opx-correlator opx-candidate-processor; do
  echo "=== $func ==="
  aws lambda get-function --function-name $func --query "Configuration.State"
  aws logs tail /aws/lambda/$func --since 10m --format short | tail -20
done

# Check all DynamoDB tables
for table in opx-signals opx-correlation-rules opx-candidates opx-incidents; do
  echo "=== $table ==="
  aws dynamodb describe-table --table-name $table --query "Table.TableStatus"
done

# Check EventBridge rules
aws events list-rules --event-bus-name opx-audit-events
```

**Resolution Steps:**

1. **Check AWS Service Health:**
   - Visit AWS Service Health Dashboard
   - Check for regional outages

2. **Verify IAM roles:**
   ```bash
   # Check Lambda execution roles
   aws iam get-role --role-name opx-signal-ingestor-role
   aws iam get-role --role-name opx-correlator-role
   aws iam get-role --role-name opx-candidate-processor-role
   ```

3. **Redeploy infrastructure:**
   ```bash
   cd infra
   cdk diff
   cdk deploy --require-approval never
   ```

4. **Verify deployment:**
   ```bash
   # Check stack status
   aws cloudformation describe-stacks \
     --stack-name OpxControlPlaneStack \
     --query "Stacks[0].StackStatus"
   ```

5. **Test with single signal:**
   ```bash
   aws sns publish \
     --topic-arn arn:aws:sns:us-east-1:998461587244:opx-cloudwatch-alarms \
     --message file://test-signals/signal-1.json
   ```

**Escalation:** If AWS service outage, wait for resolution. Otherwise, page senior engineer.

---

## Emergency Contacts

**On-Call Engineer:** [Rotation]  
**Engineering Manager:** [Name]  
**AWS Support:** [Case portal]  
**Slack Channel:** #opx-incidents-oncall

---

## Post-Incident Checklist

After resolving any incident:

- [ ] Document root cause
- [ ] Update runbook with lessons learned
- [ ] Add monitoring/alerting to prevent recurrence
- [ ] Schedule incident review meeting
- [ ] Update failure playbook
- [ ] Test recovery procedures
- [ ] Notify stakeholders

---

**Last Updated:** 2026-01-19  
**Next Review:** After each incident
