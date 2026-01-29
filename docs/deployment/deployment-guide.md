# OPX Control Plane — Deployment Guide

**Last Updated:** January 29, 2026  
**Version:** v1.0.0-production-core

---

## Prerequisites

### AWS Account Requirements
- AWS Account with admin access
- Region: us-east-1 (required for Bedrock)
- Service quotas verified:
  - Bedrock Agents: 6+ agents
  - Lambda concurrent executions: 1000+
  - DynamoDB tables: 10+
  - OpenSearch Serverless collections: 1+

### Local Development Environment
- Node.js 18+ (LTS)
- Python 3.12+
- AWS CDK CLI: `npm install -g aws-cdk`
- AWS CLI configured with credentials

### Cost Awareness
- **Fixed:** ~$380/month
- **Variable:** ~$0.01-0.05 per incident
- **Estimated (100 incidents/day):** ~$500-600/month

---

## Deployment Steps

### 1. Clone Repository

```bash
git clone https://github.com/Piya0412/opx-control-plane.git
cd opx-control-plane
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies
cd src/langgraph
pip install -r requirements.txt
cd ../..
```

### 3. Configure AWS Credentials

```bash
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Default region: us-east-1
# Default output format: json
```

### 4. Bootstrap CDK (First Time Only)

```bash
cdk bootstrap aws://ACCOUNT-ID/us-east-1
```

### 5. Review Stack Configuration

```bash
# Review what will be deployed
cdk diff
```

### 6. Deploy Infrastructure

```bash
# Deploy all resources
cdk deploy OpxPhase6Stack

# Confirm deployment when prompted
# This will take 15-20 minutes
```

### 7. Verify Deployment

```bash
# Check stack status
aws cloudformation describe-stacks \
  --stack-name OpxPhase6Stack \
  --query 'Stacks[0].StackStatus'

# Expected output: "CREATE_COMPLETE" or "UPDATE_COMPLETE"
```

### 8. Initialize Knowledge Base

```bash
# Upload knowledge documents
cd scripts
./ingest-knowledge-base.sh

# Verify documents indexed
aws bedrock-agent list-data-sources \
  --knowledge-base-id <KB_ID>
```

### 9. Run Validation Gates

```bash
# Run all validation gates
cd scripts
python test-all-gates.py

# Expected: All 4 gates pass
```

---

## Post-Deployment Configuration

### 1. Configure Budget Thresholds

Edit `infra/constructs/token-analytics-alarms.ts`:

```typescript
const DAILY_BUDGET = 10.00;  // USD
const MONTHLY_BUDGET = 300.00;  // USD
```

Redeploy:
```bash
cdk deploy OpxPhase6Stack
```

### 2. Set Up SNS Notifications

```bash
# Create SNS topic
aws sns create-topic --name opx-alerts

# Subscribe email
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:ACCOUNT:opx-alerts \
  --protocol email \
  --notification-endpoint your-email@example.com

# Confirm subscription via email
```

### 3. Configure CloudWatch Dashboards

Navigate to CloudWatch console:
- Dashboard: `OPX-Token-Analytics`
- Verify all 6 widgets display data
- Customize time ranges if needed

### 4. Test Agent Invocation

```bash
cd scripts
python test-agent-basic.py

# Expected: Agent responds successfully
```

---

## Deployment Verification Checklist

### Infrastructure
- [ ] DynamoDB tables created (7 tables)
- [ ] Lambda functions deployed (10 functions)
- [ ] Bedrock Agents created (6 agents)
- [ ] Bedrock Knowledge Base created
- [ ] OpenSearch Serverless collection created
- [ ] CloudWatch dashboards created (2 dashboards)
- [ ] CloudWatch alarms configured (8 alarms)
- [ ] S3 buckets created (knowledge corpus)

### Functionality
- [ ] Agent invocation works
- [ ] Knowledge retrieval works
- [ ] Guardrails block PII
- [ ] Traces are logged
- [ ] Metrics are emitted
- [ ] Dashboards display data
- [ ] Alarms are in OK state

### Security
- [ ] IAM roles have least privilege
- [ ] No API keys in use
- [ ] Encryption at rest enabled
- [ ] Encryption in transit enabled
- [ ] PII redaction working

---

## Rollback Procedure

### If Deployment Fails

```bash
# Rollback to previous version
cdk deploy OpxPhase6Stack --rollback

# Or destroy and redeploy
cdk destroy OpxPhase6Stack
cdk deploy OpxPhase6Stack
```

### If Runtime Issues Occur

1. Check CloudWatch Logs:
   ```bash
   aws logs tail /aws/lambda/opx-phase6-executor --follow
   ```

2. Check alarm status:
   ```bash
   aws cloudwatch describe-alarms --state-value ALARM
   ```

3. Review recent traces:
   ```bash
   aws dynamodb scan --table-name opx-llm-traces --limit 10
   ```

---

## Troubleshooting

### Common Issues

**Issue:** CDK deployment fails with "Resource limit exceeded"
- **Solution:** Request quota increase for the service
- **AWS Console:** Service Quotas → Request increase

**Issue:** Bedrock Agent not responding
- **Solution:** Check agent status and IAM permissions
- **Command:** `aws bedrock-agent get-agent --agent-id <ID>`

**Issue:** Knowledge Base returns no results
- **Solution:** Verify documents are indexed
- **Command:** `aws bedrock-agent list-data-sources --knowledge-base-id <ID>`

**Issue:** High costs
- **Solution:** Check token usage dashboard
- **Dashboard:** CloudWatch → OPX-Token-Analytics

---

## Monitoring

### Key Metrics to Watch

1. **Token Usage**
   - Dashboard: OPX-Token-Analytics
   - Widget: Token Usage by Agent
   - Alert: If > 10,000 tokens/hour

2. **Cost**
   - Dashboard: OPX-Token-Analytics
   - Widget: Cost Trend
   - Alert: If > daily budget

3. **Guardrail Violations**
   - Alarm: OPX-Guardrails-HighPIIViolationRate
   - Action: Investigate if > 5%

4. **Validation Errors**
   - Table: opx-validation-errors
   - Alert: If > 10% failure rate

---

## Maintenance

### Regular Tasks

**Daily:**
- Review CloudWatch alarms
- Check cost dashboard
- Monitor error logs

**Weekly:**
- Review validation error trends
- Check knowledge base usage
- Verify backup retention

**Monthly:**
- Review and adjust budgets
- Update knowledge documents
- Review security posture

---

## Disaster Recovery

### Backup Strategy
- **DynamoDB:** Point-in-time recovery enabled
- **S3:** Versioning enabled
- **Knowledge Base:** Documents in S3 (versioned)

### Recovery Procedure

1. **Restore DynamoDB:**
   ```bash
   aws dynamodb restore-table-to-point-in-time \
     --source-table-name opx-incidents \
     --target-table-name opx-incidents-restored \
     --restore-date-time 2026-01-29T00:00:00Z
   ```

2. **Restore S3:**
   ```bash
   aws s3 cp s3://opx-knowledge-corpus/ \
     s3://opx-knowledge-corpus-restored/ \
     --recursive
   ```

3. **Redeploy Stack:**
   ```bash
   cdk deploy OpxPhase6Stack
   ```

---

## Support

### Documentation
- System Overview: `docs/architecture/system-overview.md`
- Runbook: `docs/deployment/runbook.md`
- Troubleshooting: `docs/deployment/troubleshooting.md`

### Logs
- Lambda logs: `/aws/lambda/opx-*`
- Agent logs: CloudWatch Logs Insights
- Trace logs: DynamoDB `opx-llm-traces`

### Contacts
- Platform Team: platform@example.com
- On-Call: oncall@example.com
- AWS Support: Enterprise support plan

---

**Next Steps:**
1. Complete post-deployment configuration
2. Run validation gates
3. Train operators on runbook
4. Monitor for 24 hours before production traffic
