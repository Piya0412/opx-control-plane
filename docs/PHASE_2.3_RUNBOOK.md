# Phase 2.3 Incident Orchestration - Operational Runbook

**Version:** 1.0.0  
**Date:** 2026-01-19  
**Status:** 🟢 OPERATIONAL (Partial - Blocked at Candidate Generation)

---

## System Overview

Phase 2.3 connects candidates (from Phase 2.2 correlation) to incidents through deterministic promotion and orchestration.

### Current Deployment Status

**OPERATIONAL ✅**
- Signal Ingestion (Phase 2.1)
- Correlation Engine (Phase 2.2)
- Orchestration Infrastructure (Phase 2.3)

**BLOCKED ⛔**
- Candidate Generation (requires Phase 2.4 Detection Engine)
- Incident Creation (never reached due to block)

---

## Architecture

```
CloudWatch Alarm
    ↓ SNS
opx-signal-ingestor (Phase 2.1) ✅ WORKING
    ↓ SignalIngested event
opx-correlator (Phase 2.2) ✅ WORKING
    ↓ Threshold evaluation ✅ WORKING
opx-candidate-processor (Phase 2.3) ✅ WORKING
    ↓ CandidateBuilder ❌ BLOCKED (needs Phase 2.4)
Promotion Engine (CP-6) ⏸️ NOT REACHED
    ↓
Incident Manager (CP-7) ⏸️ NOT REACHED
    ↓
Incident Created ⏸️ NOT REACHED
```

---

## Components

### 1. Signal Ingestor (Phase 2.1)

**Lambda:** `opx-signal-ingestor`  
**Trigger:** SNS Topic `opx-cloudwatch-alarms`  
**Status:** ✅ OPERATIONAL

**What It Does:**
- Receives CloudWatch Alarm notifications
- Normalizes signal format
- Stores in DynamoDB (`opx-signals`)
- Emits `SignalIngested` event

**Logs:** `/aws/lambda/opx-signal-ingestor`

**Key Metrics:**
- Invocations per minute
- Error rate
- Duration (p50, p99)
- DynamoDB write throttles

---

### 2. Correlator (Phase 2.2)

**Lambda:** `opx-correlator`  
**Trigger:** EventBridge rule `opx-signal-ingested-to-correlator`  
**Status:** ✅ OPERATIONAL

**What It Does:**
- Loads enabled correlation rules
- Queries signals within time windows
- Evaluates thresholds
- Attempts candidate generation (currently blocked)

**Logs:** `/aws/lambda/opx-correlator`

**Key Metrics:**
- Rules evaluated per invocation
- Rules matched per invocation
- Thresholds met per invocation
- Candidates generated (currently 0)

**Known Limitation:**
- Candidate generation blocked by missing Phase 2.4 components
- Will log: `Cannot build candidate with zero detections`

---

### 3. Candidate Processor (Phase 2.3)

**Lambda:** `opx-candidate-processor`  
**Trigger:** EventBridge rule `opx-candidate-created-to-processor`  
**Status:** ✅ DEPLOYED (Not yet tested - no candidates created)

**What It Does:**
- Receives `CandidateCreated` events
- Calls Promotion Engine (CP-6)
- Creates incidents via Incident Manager (CP-7)
- Logs orchestration attempts

**Logs:** `/aws/lambda/opx-candidate-processor`

**Key Metrics:**
- Candidates processed per minute
- Promotion rate (PROMOTE/DEFER/SUPPRESS)
- Incidents created per minute
- Orchestration failures

---

## DynamoDB Tables

### opx-signals
**Purpose:** Store all ingested signals  
**Status:** ✅ OPERATIONAL  
**TTL:** 90 days  
**GSI:** `service-observedAt-index`, `severity-observedAt-index`

**Monitoring:**
- Write capacity units
- Read capacity units
- Throttled requests (must be 0)

### opx-correlation-rules
**Purpose:** Store correlation rule definitions  
**Status:** ✅ OPERATIONAL  
**GSI:** `enabled-index` (for loading active rules)

**Current Rules:** 1 enabled test rule

### opx-candidates
**Purpose:** Store candidate incidents  
**Status:** ✅ DEPLOYED (Empty - no candidates created yet)  
**TTL:** 90 days

### opx-promotion-decisions
**Purpose:** Store promotion decisions from CP-6  
**Status:** ✅ DEPLOYED (Empty - not yet reached)  
**TTL:** None (permanent audit trail)

### opx-incidents
**Purpose:** Store active incidents  
**Status:** ✅ DEPLOYED (Empty - not yet reached)  
**TTL:** None (permanent)

### opx-orchestration-log
**Purpose:** Observability log for orchestration attempts  
**Status:** ✅ DEPLOYED (Empty - not yet reached)  
**TTL:** 90 days

---

## EventBridge Rules

### opx-signal-ingested-to-correlator
**Status:** ✅ ENABLED  
**Event Pattern:**
```json
{
  "source": ["opx.signal"],
  "detail-type": ["SignalIngested"]
}
```
**Target:** opx-correlator Lambda

### opx-candidate-created-to-processor
**Status:** ✅ ENABLED  
**Event Pattern:**
```json
{
  "source": ["opx.candidate"],
  "detail-type": ["CandidateCreated"]
}
```
**Target:** opx-candidate-processor Lambda

---

## Operational Procedures

### Check Pipeline Health

```bash
# Check signal ingestion (last 10 minutes)
aws logs tail /aws/lambda/opx-signal-ingestor --since 10m --format short

# Check correlator (last 10 minutes)
aws logs tail /aws/lambda/opx-correlator --since 10m --format short

# Check candidate processor (last 10 minutes)
aws logs tail /aws/lambda/opx-candidate-processor --since 10m --format short

# Check signal count
aws dynamodb scan --table-name opx-signals --select COUNT --query Count

# Check candidate count
aws dynamodb scan --table-name opx-candidates --select COUNT --query Count

# Check incident count
aws dynamodb scan --table-name opx-incidents --select COUNT --query Count
```

### Send Test Signal

```bash
# Publish test signal to SNS
aws sns publish \
  --topic-arn arn:aws:sns:us-east-1:998461587244:opx-cloudwatch-alarms \
  --message file://test-signals/signal-1.json \
  --subject "ALARM"

# Wait 30 seconds, then check logs
sleep 30
aws logs tail /aws/lambda/opx-signal-ingestor --since 1m --format short
aws logs tail /aws/lambda/opx-correlator --since 1m --format short
```

### Verify EventBridge Rules

```bash
# Check rule status
aws events describe-rule \
  --event-bus-name opx-audit-events \
  --name opx-signal-ingested-to-correlator

aws events describe-rule \
  --event-bus-name opx-audit-events \
  --name opx-candidate-created-to-processor

# Check rule targets
aws events list-targets-by-rule \
  --event-bus-name opx-audit-events \
  --rule opx-signal-ingested-to-correlator
```

### Load Correlation Rule

```bash
# Load test rule
npx ts-node scripts/load-test-correlation-rule.ts

# Verify rule loaded
aws dynamodb scan \
  --table-name opx-correlation-rules \
  --filter-expression "enabled = :e" \
  --expression-attribute-values '{":e":{"S":"true"}}' \
  --query "Items[*].[ruleId.S, version.S, enabled.S]"
```

---

## Monitoring & Alerts

### CloudWatch Metrics to Monitor

**Lambda Metrics:**
- `Invocations` - Should match signal ingestion rate
- `Errors` - Must be 0 in steady state
- `Throttles` - Must be 0
- `Duration` - Monitor p99 latency
- `ConcurrentExecutions` - Watch for scaling issues

**DynamoDB Metrics:**
- `ConsumedReadCapacityUnits` - Should be stable
- `ConsumedWriteCapacityUnits` - Should match signal rate
- `UserErrors` - Must be 0
- `SystemErrors` - Must be 0
- `ThrottledRequests` - Must be 0 (CRITICAL)

**EventBridge Metrics:**
- `Invocations` - Should match event emission rate
- `FailedInvocations` - Must be 0
- `ThrottledRules` - Must be 0

### Recommended Alarms

```yaml
# Lambda Error Rate
Metric: Errors
Threshold: > 0
Period: 5 minutes
Action: Page on-call

# DynamoDB Throttling
Metric: ThrottledRequests
Threshold: > 0
Period: 1 minute
Action: Page on-call (CRITICAL)

# Lambda Duration
Metric: Duration (p99)
Threshold: > 25000ms (25s)
Period: 5 minutes
Action: Alert team

# Dead Letter Queue
Metric: ApproximateNumberOfMessagesVisible
Threshold: > 0
Period: 1 minute
Action: Page on-call
```

---

## Troubleshooting

### No Signals Being Ingested

**Symptoms:**
- opx-signals table empty
- No ingestor logs

**Diagnosis:**
```bash
# Check SNS subscription
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-east-1:998461587244:opx-cloudwatch-alarms

# Check Lambda permission
aws lambda get-policy --function-name opx-signal-ingestor
```

**Resolution:**
- Verify SNS → Lambda subscription exists
- Verify Lambda has permission for SNS invocation
- Check CloudWatch Alarms are publishing to correct SNS topic

---

### Correlator Not Triggering

**Symptoms:**
- Signals in opx-signals
- No correlator logs
- No candidates created

**Diagnosis:**
```bash
# Check EventBridge rule
aws events describe-rule \
  --event-bus-name opx-audit-events \
  --name opx-signal-ingested-to-correlator

# Check if rule is enabled
# Output should show: "State": "ENABLED"

# Check rule targets
aws events list-targets-by-rule \
  --event-bus-name opx-audit-events \
  --rule opx-signal-ingested-to-correlator
```

**Resolution:**
- Enable EventBridge rule if disabled
- Verify event pattern matches SignalIngested events
- Check Lambda has permission for EventBridge invocation

---

### Correlator Running But No Candidates

**Symptoms:**
- Correlator logs show invocations
- Rules evaluated and matched
- Thresholds met
- Error: "Cannot build candidate with zero detections"

**Diagnosis:**
This is **EXPECTED BEHAVIOR** until Phase 2.4 is deployed.

**Root Cause:**
CandidateBuilder requires detections from Phase 2.4 Detection Engine.

**Resolution:**
- No action needed - this is a known limitation
- Wait for Phase 2.4 deployment
- Pipeline is safe to leave running

---

### DynamoDB Throttling

**Symptoms:**
- `ThrottledRequests` > 0
- Lambda errors: `ProvisionedThroughputExceededException`

**Diagnosis:**
```bash
# Check table capacity
aws dynamodb describe-table --table-name opx-signals \
  --query "Table.BillingModeSummary"

# Check consumed capacity
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedWriteCapacityUnits \
  --dimensions Name=TableName,Value=opx-signals \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

**Resolution:**
- Tables use on-demand billing (should auto-scale)
- If throttling persists, check for hot partitions
- Consider adding exponential backoff in Lambda

---

## Performance Baselines

### Expected Latencies

| Component | p50 | p99 | Max |
|-----------|-----|-----|-----|
| Signal Ingestor | < 100ms | < 500ms | 3s |
| Correlator | < 500ms | < 2s | 30s |
| Candidate Processor | < 1s | < 5s | 30s |

### Expected Throughput

| Metric | Rate |
|--------|------|
| Signals ingested | 10-100/min |
| Candidates created | 1-10/min (when unblocked) |
| Incidents created | 1-5/min (when unblocked) |

---

## Security

### IAM Roles

**opx-signal-ingestor-role:**
- Write: opx-signals
- PutEvents: opx-audit-events
- X-Ray tracing

**opx-correlator-role:**
- Read: opx-signals, opx-correlation-rules
- Write: opx-candidates
- PutEvents: opx-audit-events
- X-Ray tracing

**opx-candidate-processor-role:**
- Read: opx-candidates, opx-promotion-policies
- Write: opx-promotion-decisions, opx-incidents, opx-orchestration-log
- PutEvents: opx-audit-events
- X-Ray tracing

### Data Encryption

- **At Rest:** All DynamoDB tables encrypted with AWS managed keys
- **In Transit:** All API calls use TLS 1.2+
- **Logs:** CloudWatch Logs encrypted

### Audit Trail

- All Lambda invocations logged to CloudWatch
- All DynamoDB operations logged via CloudTrail
- All EventBridge events logged
- Orchestration attempts logged to opx-orchestration-log

---

## Maintenance

### Regular Tasks

**Daily:**
- Check error rates in CloudWatch
- Verify DLQs are empty
- Check DynamoDB throttling metrics

**Weekly:**
- Review correlation rule effectiveness
- Check signal ingestion patterns
- Review orchestration logs

**Monthly:**
- Review and update correlation rules
- Analyze promotion rates
- Review capacity planning

### Backup & Recovery

**DynamoDB:**
- Point-in-time recovery enabled on all tables
- Automated backups retained for 35 days

**Lambda:**
- Code stored in S3 (CDK deployment artifacts)
- Infrastructure as code in Git

**Recovery Time Objective (RTO):** < 1 hour  
**Recovery Point Objective (RPO):** < 5 minutes

---

## Contact Information

**On-Call:** [Your team's on-call rotation]  
**Slack Channel:** #opx-incidents  
**Runbook Location:** `docs/PHASE_2.3_RUNBOOK.md`

---

**Last Updated:** 2026-01-19  
**Next Review:** 2026-02-19
