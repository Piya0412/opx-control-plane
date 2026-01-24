# Phase 5: Automated Learning Operations - Runbook

**Version:** 1.0.0  
**Last Updated:** January 25, 2026

---

## Overview

This runbook covers daily, weekly, and monthly operations for the automated learning system, including monitoring, manual triggers, and emergency procedures.

---

## Daily Operations

### Morning Checklist (9:00 AM UTC)

1. **Check CloudWatch Dashboard**
   - Navigate to: CloudWatch → Dashboards → `opx-learning-operations`
   - Verify all operations from previous 24 hours completed successfully
   - Check error rates (should be <10%)

2. **Review Daily Pattern Extraction**
   - Expected execution: 00:00 UTC daily
   - Check audit logs for `PATTERN_EXTRACTION` with `triggerType=SCHEDULED`
   - Verify status: `SUCCESS`
   - Expected duration: <2 minutes

3. **Review Daily Snapshots**
   - Expected execution: 01:00 UTC daily
   - Check audit logs for `SNAPSHOT` with `snapshotType=DAILY`
   - Verify status: `SUCCESS`
   - Expected duration: <1 minute

4. **Check for Alarms**
   - Review SNS notifications (email/Slack)
   - Investigate any `FAILURE` or `TIMEOUT` alerts
   - Follow troubleshooting guide if needed

### Actions Required

- **If pattern extraction failed:**
  - Check logs for error details
  - Verify DynamoDB connectivity
  - Consider manual trigger if needed

- **If snapshot failed:**
  - Check logs for error details
  - Verify sufficient data exists
  - Consider manual trigger if needed

---

## Weekly Operations

### Monday Morning Checklist (9:00 AM UTC)

1. **Review Weekly Pattern Extraction**
   - Expected execution: Sunday 00:00 UTC
   - Check audit logs for `PATTERN_EXTRACTION` with `timeWindow=WEEKLY`
   - Verify patterns extracted for all services
   - Expected duration: <5 minutes

2. **Review Weekly Snapshots**
   - Expected execution: Sunday 01:00 UTC
   - Check audit logs for `SNAPSHOT` with `snapshotType=WEEKLY`
   - Verify snapshot created successfully
   - Expected duration: <2 minutes

3. **Review Metrics Trends**
   - Check success rate trend (should be >90%)
   - Check duration trend (should be stable)
   - Check error rate trend (should be <10%)

### Actions Required

- **If weekly operations failed:**
  - Follow daily troubleshooting steps
  - Consider manual trigger with custom date range
  - Escalate if persistent failures

---

## Monthly Operations

### First Monday of Month Checklist (9:00 AM UTC)

1. **Review Monthly Calibration (CRITICAL)**
   - Expected execution: 1st of month, 00:00 UTC
   - Check audit logs for `CALIBRATION` with `triggerType=SCHEDULED`
   - Verify status: `SUCCESS`
   - Expected duration: <10 minutes
   - **This is the most critical operation - failure requires immediate attention**

2. **Review Calibration Results**
   - Check drift analysis: `|drift| < 0.15` is acceptable
   - If `|drift| > 0.15`: Review drift alert (advisory only)
   - Check outcome count: Should be >30 outcomes
   - Review confidence band recommendations

3. **Review Monthly Snapshots**
   - Expected execution: 1st of month, 01:00 UTC
   - Check audit logs for `SNAPSHOT` with `snapshotType=MONTHLY`
   - Verify snapshot created successfully
   - Expected duration: <5 minutes

4. **Review Drift Alerts**
   - Check for `DRIFT` alerts in SNS notifications
   - Drift alerts are **advisory only** - no automatic changes
   - Review recommended confidence band adjustments
   - Decide if manual confidence band update is needed

### Actions Required

- **If calibration failed:**
  - **CRITICAL:** Investigate immediately
  - Check logs for error details
  - Verify sufficient outcomes exist (minimum 30)
  - Consider manual trigger with previous month date range
  - Escalate to engineering if unresolved within 1 hour

- **If drift alert received:**
  - Review drift analysis details
  - Compare previous vs new confidence bands
  - Consult with data science team
  - Decide if manual adjustment is warranted
  - Document decision in incident log

---

## Manual Trigger Commands

### Prerequisites

- AWS CLI configured with IAM credentials
- IAM principal must have `EMERGENCY_OVERRIDE` authority for emergency operations
- API Gateway endpoint URL

### Manual Pattern Extraction

```bash
# Normal manual trigger
curl -X POST https://api.example.com/learning/extract-patterns \
  -H "Authorization: AWS4-HMAC-SHA256 ..." \
  -H "Content-Type: application/json" \
  -d '{
    "service": "order-service",
    "startDate": "2026-01-01T00:00:00.000Z",
    "endDate": "2026-01-31T23:59:59.999Z",
    "emergency": false
  }'

# Emergency trigger (bypasses kill switch)
curl -X POST https://api.example.com/learning/extract-patterns \
  -H "Authorization: AWS4-HMAC-SHA256 ..." \
  -H "Content-Type: application/json" \
  -d '{
    "service": "order-service",
    "startDate": "2026-01-01T00:00:00.000Z",
    "endDate": "2026-01-31T23:59:59.999Z",
    "emergency": true
  }'
```

**Rate Limit:** 5 requests/hour per principal

### Manual Calibration

```bash
# Normal manual trigger
curl -X POST https://api.example.com/learning/calibrate \
  -H "Authorization: AWS4-HMAC-SHA256 ..." \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2026-01-01T00:00:00.000Z",
    "endDate": "2026-01-31T23:59:59.999Z",
    "emergency": false
  }'
```

**Rate Limit:** 3 requests/hour per principal

### Manual Snapshot

```bash
# Normal manual trigger
curl -X POST https://api.example.com/learning/create-snapshot \
  -H "Authorization: AWS4-HMAC-SHA256 ..." \
  -H "Content-Type: application/json" \
  -d '{
    "snapshotType": "CUSTOM",
    "startDate": "2026-01-01T00:00:00.000Z",
    "endDate": "2026-01-31T23:59:59.999Z",
    "emergency": false
  }'
```

**Rate Limit:** 10 requests/hour per principal

### Check Operation Status

```bash
# Get audit record by ID
aws dynamodb get-item \
  --table-name opx-automation-audit \
  --key '{"PK": {"S": "AUDIT#abc123..."}, "SK": {"S": "METADATA"}}'
```

---

## Emergency Procedures

### Kill Switch Activation

**When to activate:**
- Data quality issues detected
- Unexpected behavior in learning operations
- Production incident requiring investigation
- Maintenance window

**How to activate:**

```bash
# Disable kill switch (blocks all automated operations)
curl -X POST https://api.example.com/learning/kill-switch/disable \
  -H "Authorization: AWS4-HMAC-SHA256 ..." \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Production incident - investigating data quality issues"
  }'

# Response:
# {
#   "status": "DISABLED",
#   "message": "Kill switch disabled - all automated operations blocked",
#   "auditId": "KILL_SWITCH_DISABLE#..."
# }
```

**Authority Required:** `EMERGENCY_OVERRIDE` only

**Effect:**
- All scheduled operations blocked immediately
- Manual operations blocked (except EMERGENCY_OVERRIDE)
- Operations return gracefully with audit record
- No cascading failures

**Target Disable Time:** <30 seconds

### Kill Switch Deactivation

**When to deactivate:**
- Issue resolved
- Investigation complete
- Maintenance window complete

**How to deactivate:**

```bash
# Enable kill switch (allow automated operations)
curl -X POST https://api.example.com/learning/kill-switch/enable \
  -H "Authorization: AWS4-HMAC-SHA256 ..." \
  -H "Content-Type: application/json"

# Response:
# {
#   "status": "ENABLED",
#   "message": "Kill switch enabled - automated operations allowed",
#   "auditId": "KILL_SWITCH_ENABLE#..."
# }
```

**Authority Required:** `EMERGENCY_OVERRIDE` only

### Check Kill Switch Status

```bash
# Get current status (no auth required)
curl https://api.example.com/learning/kill-switch/status

# Response:
# {
#   "active": true,
#   "enabled": false,
#   "disabledAt": "2026-01-25T12:00:00.000Z",
#   "disabledBy": {
#     "type": "EMERGENCY_OVERRIDE",
#     "identifier": "arn:aws:iam::123456789012:user/ops-admin"
#   },
#   "reason": "Production incident",
#   "lastModified": "2026-01-25T12:00:00.000Z"
# }
```

---

## Monitoring Dashboard Guide

### Dashboard URL
CloudWatch → Dashboards → `opx-learning-operations`

### Widget Descriptions

**Row 1: Success/Failure Counts**
- Pattern Extraction success/failure (hourly)
- Calibration success/failure (hourly)
- Snapshot success/failure (hourly)

**Row 2: Error Rates**
- Pattern Extraction error rate (%)
- Calibration error rate (%)
- Snapshot error rate (%)
- **Alert if >10%**

**Row 3: Duration Metrics**
- Pattern Extraction duration (avg + p99)
- Calibration duration (avg + p99)
- Snapshot duration (avg + p99)
- **Alert if >5 minutes**

**Row 4: Trigger Type Breakdown**
- Scheduled operations by type
- Manual operations by type

**Row 5: Calibration Drift**
- Drift over time with threshold annotations (±0.15)
- Calibration details (outcome count, skipped count)

**Row 6: Recent Operations**
- Last 20 operations with details
- Timestamp, operation type, trigger type, status, duration, audit ID

### Alarm Thresholds

| Alarm | Threshold | Action |
|-------|-----------|--------|
| Pattern Extraction Failure | 2 consecutive | Investigate logs |
| High Error Rate | >10% in 1 hour | Investigate root cause |
| Operation Timeout | >5 minutes | Check performance |
| Significant Drift | \|drift\| > 0.15 | Review recommendations |
| Calibration Failure | 1 failure | **CRITICAL** - immediate action |
| Snapshot Failure | 2 consecutive | Investigate logs |

---

## Rate Limiting

### Limits per Principal

| Operation | Limit | Window |
|-----------|-------|--------|
| Pattern Extraction | 5 requests | 1 hour |
| Calibration | 3 requests | 1 hour |
| Snapshot | 10 requests | 1 hour |

### Rate Limit Exceeded Response

```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit exceeded. Retry after 1800 seconds."
}
```

**Headers:**
- `Retry-After`: Seconds until next allowed request
- `X-RateLimit-Limit`: Maximum requests per window
- `X-RateLimit-Remaining`: Remaining requests in current window

---

## Escalation Procedures

### Severity Levels

**P0 - Critical (Immediate Response)**
- Calibration failure (monthly operation)
- Multiple consecutive failures
- Data corruption detected

**P1 - High (Response within 1 hour)**
- Pattern extraction failure (2+ consecutive)
- Snapshot failure (2+ consecutive)
- Error rate >20%

**P2 - Medium (Response within 4 hours)**
- Single operation failure
- Error rate 10-20%
- Performance degradation

**P3 - Low (Response within 24 hours)**
- Drift alert (advisory)
- Minor performance issues
- Documentation updates

### Escalation Contacts

1. **On-Call Engineer** - Slack: #opx-oncall
2. **Data Science Team** - Slack: #opx-data-science
3. **Engineering Manager** - Email: eng-manager@example.com

---

## Audit Trail

All operations are audited in DynamoDB table: `opx-automation-audit`

### Query Audit Logs

```bash
# Get all audits for a specific operation type
aws dynamodb query \
  --table-name opx-automation-audit \
  --index-name OperationTypeIndex \
  --key-condition-expression "operationType = :opType" \
  --expression-attribute-values '{":opType": {"S": "CALIBRATION"}}'

# Get audits for a specific date range
aws dynamodb query \
  --table-name opx-automation-audit \
  --key-condition-expression "PK = :pk AND SK BETWEEN :start AND :end" \
  --expression-attribute-values '{
    ":pk": {"S": "AUDIT#CALIBRATION"},
    ":start": {"S": "2026-01-01"},
    ":end": {"S": "2026-01-31"}
  }'
```

---

## Maintenance Windows

### Scheduled Maintenance

- **When:** First Sunday of each quarter, 02:00-04:00 UTC
- **Duration:** 2 hours
- **Actions:**
  1. Activate kill switch
  2. Perform infrastructure updates
  3. Run integration tests
  4. Deactivate kill switch
  5. Verify operations resume

### Emergency Maintenance

- Activate kill switch immediately
- Notify team via Slack
- Document reason and actions
- Deactivate after resolution

---

## Contact Information

- **Slack Channel:** #opx-learning-operations
- **On-Call:** #opx-oncall
- **Documentation:** https://docs.example.com/opx/phase5
- **Runbook Updates:** Submit PR to `docs/PHASE_5_RUNBOOK.md`

---

**End of Runbook**
