# Phase 5: Automated Learning Operations - Deployment Guide

**Version:** 1.0.0  
**Last Updated:** January 25, 2026

---

## Overview

This guide covers the deployment of Phase 5 automated learning operations, including infrastructure setup, configuration, and post-deployment verification.

---

## Prerequisites

### Required Tools

- AWS CLI v2.x
- AWS CDK v2.x
- Node.js v18.x or later
- npm v9.x or later
- IAM credentials with deployment permissions

### Required Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "dynamodb:*",
        "lambda:*",
        "events:*",
        "apigateway:*",
        "iam:*",
        "logs:*",
        "cloudwatch:*",
        "sns:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### Existing Infrastructure

Phase 5 depends on Phase 1-4 infrastructure:

- ✅ Signal ingestion (Phase 1)
- ✅ Detection & correlation (Phase 2)
- ✅ Incident construction (Phase 3)
- ✅ Post-incident learning (Phase 4)

**Verify existing tables:**
```bash
aws dynamodb list-tables | grep opx
# Expected:
# - opx-signals
# - opx-detections
# - opx-incidents
# - opx-outcomes
# - opx-resolution-summaries
# - opx-calibrations
```

---

## Deployment Steps

### Step 1: Install Dependencies

```bash
cd opx-control-plane
npm install
```

### Step 2: Build TypeScript

```bash
npm run build
```

**Expected output:**
```
> opx-control-plane@1.0.0 build
> tsc

✓ TypeScript compilation successful
```

### Step 3: Run Tests

```bash
npm test
```

**Expected output:**
```
Test Files  XX passed (XX)
Tests  XXX passed (XXX)
```

### Step 4: Synthesize CDK Stack

```bash
npx cdk synth
```

**Expected output:**
```
Successfully synthesized to cdk.out
```

### Step 5: Deploy Infrastructure

```bash
npx cdk deploy OpxControlPlaneStack --require-approval never
```

**Expected resources:**

1. **DynamoDB Tables:**
   - `opx-automation-audit` (audit records)
   - `opx-automation-config` (kill switch, rate limiting)
   - `opx-snapshots` (learning snapshots)

2. **Lambda Functions:**
   - `opx-pattern-extraction-handler`
   - `opx-calibration-handler`
   - `opx-snapshot-handler`
   - `opx-manual-trigger-handler`
   - `opx-kill-switch-handler`

3. **EventBridge Rules (DISABLED by default):**
   - `opx-daily-pattern-extraction` (cron: 0 0 * * ? *)
   - `opx-weekly-pattern-extraction` (cron: 0 0 ? * SUN *)
   - `opx-monthly-calibration` (cron: 0 0 1 * ? *)
   - `opx-daily-snapshot` (cron: 0 1 * * ? *)
   - `opx-weekly-snapshot` (cron: 0 1 ? * SUN *)
   - `opx-monthly-snapshot` (cron: 0 1 1 * ? *)

4. **API Gateway:**
   - REST API: `opx-learning-operations-api`
   - Endpoints:
     - POST /learning/extract-patterns
     - POST /learning/calibrate
     - POST /learning/create-snapshot
     - POST /learning/kill-switch/disable
     - POST /learning/kill-switch/enable
     - GET /learning/kill-switch/status

5. **CloudWatch Dashboard:**
   - `opx-learning-operations`

6. **CloudWatch Alarms:**
   - `opx-pattern-extraction-failure`
   - `opx-learning-high-error-rate`
   - `opx-learning-operation-timeout`
   - `opx-calibration-significant-drift`
   - `opx-calibration-failure`
   - `opx-snapshot-failure`

7. **SNS Topic:**
   - `opx-learning-operations-alerts.fifo`

**Deployment time:** ~10 minutes

### Step 6: Capture Outputs

```bash
aws cloudformation describe-stacks \
  --stack-name OpxControlPlaneStack \
  --query 'Stacks[0].Outputs' \
  --output json > deployment-outputs.json
```

**Expected outputs:**
```json
[
  {
    "OutputKey": "AutomationAuditTableName",
    "OutputValue": "opx-automation-audit"
  },
  {
    "OutputKey": "AutomationConfigTableName",
    "OutputValue": "opx-automation-config"
  },
  {
    "OutputKey": "ApiGatewayUrl",
    "OutputValue": "https://abc123.execute-api.us-east-1.amazonaws.com/prod"
  },
  {
    "OutputKey": "AlertTopicArn",
    "OutputValue": "arn:aws:sns:us-east-1:123456789012:opx-learning-operations-alerts.fifo"
  }
]
```

---

## Post-Deployment Verification

### Verify DynamoDB Tables

```bash
# Check automation audit table
aws dynamodb describe-table --table-name opx-automation-audit

# Check automation config table
aws dynamodb describe-table --table-name opx-automation-config

# Check snapshots table
aws dynamodb describe-table --table-name opx-snapshots
```

**Expected:** All tables in `ACTIVE` status

### Verify Lambda Functions

```bash
# List all Phase 5 Lambda functions
aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `opx-`)].FunctionName'
```

**Expected:**
```json
[
  "opx-pattern-extraction-handler",
  "opx-calibration-handler",
  "opx-snapshot-handler",
  "opx-manual-trigger-handler",
  "opx-kill-switch-handler"
]
```

### Verify EventBridge Rules (Should be DISABLED)

```bash
# Check rule states
aws events list-rules --name-prefix opx- --query 'Rules[*].[Name,State]' --output table
```

**Expected:**
```
|  Name                              |  State    |
|------------------------------------|-----------|
|  opx-daily-pattern-extraction      |  DISABLED |
|  opx-weekly-pattern-extraction     |  DISABLED |
|  opx-monthly-calibration           |  DISABLED |
|  opx-daily-snapshot                |  DISABLED |
|  opx-weekly-snapshot               |  DISABLED |
|  opx-monthly-snapshot              |  DISABLED |
```

**CRITICAL:** Rules must be DISABLED initially. Enable only after verification.

### Verify API Gateway

```bash
# Get API Gateway URL
API_URL=$(aws cloudformation describe-stacks \
  --stack-name OpxControlPlaneStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
  --output text)

echo "API Gateway URL: $API_URL"

# Test kill switch status endpoint (no auth required)
curl $API_URL/learning/kill-switch/status
```

**Expected:**
```json
{
  "active": false,
  "enabled": true,
  "lastModified": "2026-01-25T12:00:00.000Z"
}
```

### Verify CloudWatch Dashboard

```bash
# Open dashboard in browser
aws cloudwatch get-dashboard --dashboard-name opx-learning-operations
```

**Or navigate to:**
AWS Console → CloudWatch → Dashboards → `opx-learning-operations`

### Verify CloudWatch Alarms

```bash
# List all Phase 5 alarms
aws cloudwatch describe-alarms --alarm-name-prefix opx- --query 'MetricAlarms[*].[AlarmName,StateValue]' --output table
```

**Expected:** All alarms in `INSUFFICIENT_DATA` state (no data yet)

### Verify SNS Topic

```bash
# Get topic ARN
TOPIC_ARN=$(aws cloudformation describe-stacks \
  --stack-name OpxControlPlaneStack \
  --query 'Stacks[0].Outputs[?OutputKey==`AlertTopicArn`].OutputValue' \
  --output text)

echo "SNS Topic ARN: $TOPIC_ARN"

# List subscriptions
aws sns list-subscriptions-by-topic --topic-arn $TOPIC_ARN
```

**Expected:** Email subscriptions configured (if specified during deployment)

---

## Configuration

### Subscribe to Alerts

```bash
# Subscribe email to SNS topic
aws sns subscribe \
  --topic-arn $TOPIC_ARN \
  --protocol email \
  --notification-endpoint ops@example.com

# Confirm subscription via email
```

### Initialize Kill Switch

```bash
# Set initial kill switch state (enabled = operations allowed)
aws dynamodb put-item \
  --table-name opx-automation-config \
  --item '{
    "PK": {"S": "CONFIG#KILL_SWITCH"},
    "SK": {"S": "METADATA"},
    "enabled": {"BOOL": true},
    "lastModified": {"S": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"}
  }'
```

### Configure IAM for Manual Triggers

```bash
# Create IAM policy for manual triggers
aws iam create-policy \
  --policy-name OpxLearningOperationsManualTrigger \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "execute-api:Invoke"
        ],
        "Resource": "arn:aws:execute-api:*:*:*/*/POST/learning/*"
      }
    ]
  }'

# Attach policy to IAM user/role
aws iam attach-user-policy \
  --user-name ops-user \
  --policy-arn arn:aws:iam::123456789012:policy/OpxLearningOperationsManualTrigger
```

---

## Enable Scheduled Operations

**CRITICAL:** Only enable after verification is complete.

### Step 1: Verify Manual Triggers Work

```bash
# Test manual pattern extraction
curl -X POST $API_URL/learning/extract-patterns \
  -H "Authorization: AWS4-HMAC-SHA256 ..." \
  -H "Content-Type: application/json" \
  -d '{
    "service": "order-service",
    "startDate": "2026-01-24T00:00:00.000Z",
    "endDate": "2026-01-24T23:59:59.999Z",
    "emergency": false
  }'
```

**Expected:**
```json
{
  "auditId": "PATTERN_EXTRACTION#...",
  "status": "ACCEPTED"
}
```

### Step 2: Verify Audit Logged

```bash
# Check audit record
aws dynamodb get-item \
  --table-name opx-automation-audit \
  --key '{"PK": {"S": "AUDIT#<auditId>"}, "SK": {"S": "METADATA"}}'
```

**Expected:** Audit record with `status: "SUCCESS"`

### Step 3: Enable EventBridge Rules

```bash
# Enable daily pattern extraction
aws events enable-rule --name opx-daily-pattern-extraction

# Enable weekly pattern extraction
aws events enable-rule --name opx-weekly-pattern-extraction

# Enable monthly calibration
aws events enable-rule --name opx-monthly-calibration

# Enable daily snapshot
aws events enable-rule --name opx-daily-snapshot

# Enable weekly snapshot
aws events enable-rule --name opx-weekly-snapshot

# Enable monthly snapshot
aws events enable-rule --name opx-monthly-snapshot
```

### Step 4: Verify Rules Enabled

```bash
aws events list-rules --name-prefix opx- --query 'Rules[*].[Name,State]' --output table
```

**Expected:** All rules in `ENABLED` state

---

## Rollback Procedures

### Disable All Scheduled Operations

```bash
# Disable all EventBridge rules
aws events disable-rule --name opx-daily-pattern-extraction
aws events disable-rule --name opx-weekly-pattern-extraction
aws events disable-rule --name opx-monthly-calibration
aws events disable-rule --name opx-daily-snapshot
aws events disable-rule --name opx-weekly-snapshot
aws events disable-rule --name opx-monthly-snapshot
```

### Activate Kill Switch

```bash
curl -X POST $API_URL/learning/kill-switch/disable \
  -H "Authorization: AWS4-HMAC-SHA256 ..." \
  -H "Content-Type: application/json" \
  -d '{"reason": "Rollback - disabling automated operations"}'
```

### Rollback CDK Stack

```bash
# Rollback to previous version
npx cdk deploy OpxControlPlaneStack --rollback

# Or destroy stack completely
npx cdk destroy OpxControlPlaneStack
```

**WARNING:** Destroying the stack will delete all DynamoDB tables and data.

---

## Monitoring After Deployment

### First 24 Hours

1. **Monitor CloudWatch Dashboard**
   - Check every 4 hours
   - Verify operations completing successfully
   - Check error rates (<10%)

2. **Review Audit Logs**
   - Verify all operations audited
   - Check for unexpected failures
   - Verify kill switch checks

3. **Check Alarms**
   - Verify no critical alarms
   - Investigate any warnings
   - Adjust thresholds if needed

### First Week

1. **Review Weekly Operations**
   - Weekly pattern extraction (Sunday 00:00 UTC)
   - Weekly snapshot (Sunday 01:00 UTC)
   - Verify completion and duration

2. **Review Metrics Trends**
   - Success rate trend
   - Duration trend
   - Error rate trend

3. **Adjust Configuration**
   - Lambda memory/timeout if needed
   - DynamoDB capacity if needed
   - Alarm thresholds if needed

### First Month

1. **Review Monthly Calibration (CRITICAL)**
   - Expected: 1st of month, 00:00 UTC
   - Verify completion
   - Review drift analysis
   - Check confidence band recommendations

2. **Review Monthly Snapshot**
   - Expected: 1st of month, 01:00 UTC
   - Verify completion
   - Check snapshot size

3. **Performance Review**
   - Review all metrics
   - Identify optimization opportunities
   - Document lessons learned

---

## Troubleshooting Deployment Issues

### CDK Deploy Fails

**Error:** `Stack already exists`

**Solution:**
```bash
# Update existing stack
npx cdk deploy OpxControlPlaneStack --force
```

**Error:** `Insufficient permissions`

**Solution:** Verify IAM permissions (see Prerequisites)

### Lambda Function Fails

**Error:** `Module not found`

**Solution:**
```bash
# Rebuild and redeploy
npm run build
npx cdk deploy OpxControlPlaneStack
```

### DynamoDB Table Creation Fails

**Error:** `Table already exists`

**Solution:** Check if Phase 4 tables exist. Phase 5 reuses some Phase 4 tables.

### API Gateway 403 Forbidden

**Error:** `Missing Authentication Token`

**Solution:** Verify IAM SigV4 authentication headers

---

## Configuration Management

### Environment Variables

All Lambda functions use these environment variables:

```typescript
{
  AUDIT_TABLE_NAME: 'opx-automation-audit',
  CONFIG_TABLE_NAME: 'opx-automation-config',
  OUTCOMES_TABLE_NAME: 'opx-outcomes',
  CALIBRATIONS_TABLE_NAME: 'opx-calibrations',
  SNAPSHOTS_TABLE_NAME: 'opx-snapshots',
  CLOUDWATCH_NAMESPACE: 'LearningOperations',
  ALERT_TOPIC_ARN: 'arn:aws:sns:...',
  PATTERN_EXTRACTION_FUNCTION: 'opx-pattern-extraction-handler',
  CALIBRATION_FUNCTION: 'opx-calibration-handler',
  SNAPSHOT_FUNCTION: 'opx-snapshot-handler',
}
```

### Update Configuration

```bash
# Update Lambda environment variable
aws lambda update-function-configuration \
  --function-name opx-pattern-extraction-handler \
  --environment Variables={AUDIT_TABLE_NAME=opx-automation-audit,...}
```

---

## Security Considerations

### IAM Permissions

- Lambda execution roles have least-privilege permissions
- API Gateway uses IAM SigV4 authentication
- Kill switch management requires EMERGENCY_OVERRIDE authority

### Data Encryption

- DynamoDB tables encrypted at rest (AWS managed keys)
- Lambda environment variables encrypted
- SNS messages encrypted in transit

### Network Security

- Lambda functions in VPC (if required)
- Security groups restrict access
- VPC endpoints for AWS services

---

## Contact Information

- **Slack Channel:** #opx-learning-operations
- **On-Call:** #opx-oncall
- **Documentation:** https://docs.example.com/opx/phase5
- **Deployment Updates:** Submit PR to `docs/PHASE_5_DEPLOYMENT.md`

---

**End of Deployment Guide**
