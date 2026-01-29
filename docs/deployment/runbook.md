# OPX Control Plane — Operations Runbook

**Last Updated:** January 29, 2026  
**Version:** v1.0.0-production-core

---

## Quick Reference

### System Status
- **Dashboard:** CloudWatch → OPX-Token-Analytics
- **Alarms:** CloudWatch → Alarms → Filter: "OPX"
- **Logs:** CloudWatch Logs → `/aws/lambda/opx-*`

### Emergency Contacts
- **Platform Team:** platform@example.com
- **On-Call:** oncall@example.com
- **AWS Support:** Enterprise support plan

---

## Common Operations

### 1. Check System Health

```bash
# Check all alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix "OPX" \
  --state-value ALARM

# Expected: No alarms in ALARM state
```

### 2. View Recent Incidents

```bash
# Query incidents table
aws dynamodb scan \
  --table-name opx-incidents \
  --limit 10 \
  --projection-expression "incidentId,status,createdAt"
```

### 3. Check Token Usage

Navigate to CloudWatch Dashboard:
- Dashboard: `OPX-Token-Analytics`
- Widget: "Token Usage by Agent"
- Time range: Last 24 hours

### 4. Review Guardrail Violations

```bash
# Query violations table
aws dynamodb scan \
  --table-name opx-guardrail-violations \
  --limit 10 \
  --filter-expression "violationType = :type" \
  --expression-attribute-values '{":type":{"S":"PII"}}'
```

### 5. Check Validation Errors

```bash
# Query validation errors
aws dynamodb scan \
  --table-name opx-validation-errors \
  --limit 10 \
  --projection-expression "errorId,validationType,timestamp"
```

---

## Incident Response

### High Cost Alert

**Alarm:** OPX-TokenAnalytics-BudgetCritical-95pct

**Steps:**
1. Check dashboard for cost spike
2. Identify high-cost agent
3. Review recent traces:
   ```bash
   aws dynamodb query \
     --table-name opx-llm-traces \
     --index-name AgentIndex \
     --key-condition-expression "agentId = :agent" \
     --expression-attribute-values '{":agent":{"S":"AGENT_ID"}}'
   ```
4. If anomalous, investigate incident context
5. If expected, adjust budget threshold

### PII Violation Rate High

**Alarm:** OPX-Guardrails-HighPIIViolationRate

**Steps:**
1. Query recent violations:
   ```bash
   aws dynamodb scan \
     --table-name opx-guardrail-violations \
     --filter-expression "violationType = :type" \
     --expression-attribute-values '{":type":{"S":"PII"}}'
   ```
2. Identify pattern (which agent, which prompt)
3. Review agent prompts for PII leakage
4. Update prompts if needed
5. Redeploy if prompt changes required

### Validation Error Rate High

**Alarm:** OPX-Validation-HighErrorRate

**Steps:**
1. Query recent errors:
   ```bash
   aws dynamodb scan \
     --table-name opx-validation-errors \
     --limit 20
   ```
2. Identify common failure pattern
3. Check if schema changed
4. Review agent output quality
5. Adjust validation rules if needed

### Lambda Timeout

**Symptom:** Agent invocations timing out

**Steps:**
1. Check Lambda logs:
   ```bash
   aws logs tail /aws/lambda/opx-phase6-executor --follow
   ```
2. Identify slow operation
3. Check if Bedrock API is slow
4. Increase Lambda timeout if needed:
   - Edit `infra/phase6/constructs/phase6-executor-lambda.ts`
   - Increase `timeout` value
   - Redeploy: `cdk deploy OpxPhase6Stack`

---

## Maintenance Tasks

### Daily

**Morning Check (5 minutes):**
1. Review CloudWatch alarms
2. Check cost dashboard
3. Scan error logs for anomalies

**Command:**
```bash
# Quick health check
aws cloudwatch describe-alarms \
  --state-value ALARM \
  --query 'MetricAlarms[*].[AlarmName,StateReason]' \
  --output table
```

### Weekly

**System Review (30 minutes):**
1. Review validation error trends
2. Check knowledge base usage
3. Verify backup retention
4. Review security logs

**Commands:**
```bash
# Validation error trend
aws dynamodb scan \
  --table-name opx-validation-errors \
  --filter-expression "timestamp > :week_ago" \
  --expression-attribute-values '{":week_ago":{"S":"2026-01-22T00:00:00Z"}}'

# Knowledge base usage
aws bedrock-agent get-knowledge-base \
  --knowledge-base-id <KB_ID>
```

### Monthly

**Comprehensive Review (2 hours):**
1. Review and adjust budgets
2. Update knowledge documents
3. Review security posture
4. Analyze cost trends
5. Plan capacity adjustments

---

## Troubleshooting Guide

### Agent Not Responding

**Symptoms:**
- Agent invocation returns error
- Timeout errors
- No response

**Diagnosis:**
```bash
# Check agent status
aws bedrock-agent get-agent --agent-id <AGENT_ID>

# Check Lambda logs
aws logs tail /aws/lambda/opx-phase6-executor --follow

# Check IAM permissions
aws iam get-role --role-name OpxPhase6ExecutorRole
```

**Solutions:**
1. Verify agent is in PREPARED state
2. Check IAM role has Bedrock permissions
3. Verify Lambda has network access
4. Check Bedrock service quotas

### Knowledge Base Returns No Results

**Symptoms:**
- RAG agent returns empty results
- Knowledge retrieval fails

**Diagnosis:**
```bash
# Check data sources
aws bedrock-agent list-data-sources \
  --knowledge-base-id <KB_ID>

# Check sync status
aws bedrock-agent get-data-source \
  --knowledge-base-id <KB_ID> \
  --data-source-id <DS_ID>
```

**Solutions:**
1. Verify documents are uploaded to S3
2. Trigger manual sync if needed
3. Check OpenSearch collection status
4. Verify IAM permissions for KB

### High Latency

**Symptoms:**
- Slow agent responses
- Increased Lambda duration

**Diagnosis:**
```bash
# Check Lambda metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=opx-phase6-executor \
  --start-time 2026-01-29T00:00:00Z \
  --end-time 2026-01-29T23:59:59Z \
  --period 3600 \
  --statistics Average
```

**Solutions:**
1. Check if Bedrock API is slow
2. Optimize agent prompts
3. Reduce knowledge base search scope
4. Increase Lambda memory (improves CPU)

---

## Performance Tuning

### Optimize Token Usage

**Goal:** Reduce cost per incident

**Actions:**
1. Review agent prompts for verbosity
2. Use Claude 3 Haiku for simple tasks
3. Reduce knowledge base search results
4. Cache common queries

**Measurement:**
- Dashboard: OPX-Token-Analytics
- Widget: Cost Per Invocation
- Target: < $0.02 per invocation

### Optimize Latency

**Goal:** Reduce agent response time

**Actions:**
1. Increase Lambda memory (1024 MB → 2048 MB)
2. Optimize knowledge base queries
3. Use parallel agent invocation where possible
4. Cache agent responses

**Measurement:**
- CloudWatch Logs Insights
- Query: `filter @type = "REPORT" | stats avg(@duration)`
- Target: < 5 seconds per agent

---

## Backup and Recovery

### Backup Verification

**Weekly Task:**
```bash
# Verify DynamoDB backups
aws dynamodb describe-continuous-backups \
  --table-name opx-incidents

# Verify S3 versioning
aws s3api get-bucket-versioning \
  --bucket opx-knowledge-corpus
```

### Recovery Test

**Monthly Task:**
1. Restore DynamoDB table to test environment
2. Verify data integrity
3. Test agent invocation
4. Document recovery time

---

## Security Operations

### Review IAM Permissions

**Monthly Task:**
```bash
# List all OPX roles
aws iam list-roles \
  --query 'Roles[?contains(RoleName, `Opx`)]'

# Review each role's policies
aws iam list-attached-role-policies \
  --role-name OpxPhase6ExecutorRole
```

### Review Guardrail Violations

**Weekly Task:**
```bash
# Query PII violations
aws dynamodb scan \
  --table-name opx-guardrail-violations \
  --filter-expression "violationType = :type AND timestamp > :week_ago" \
  --expression-attribute-values '{
    ":type":{"S":"PII"},
    ":week_ago":{"S":"2026-01-22T00:00:00Z"}
  }'
```

### Audit Trail Review

**Monthly Task:**
```bash
# Review CloudTrail logs
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceType,AttributeValue=AWS::Bedrock::Agent \
  --start-time 2026-01-01T00:00:00Z \
  --end-time 2026-01-31T23:59:59Z
```

---

## Escalation Procedures

### Level 1: Operator
- Check dashboards
- Review logs
- Follow runbook
- Resolve common issues

### Level 2: Platform Team
- Complex troubleshooting
- Configuration changes
- Code fixes
- Deployment issues

### Level 3: AWS Support
- Service outages
- Quota increases
- Bedrock API issues
- Infrastructure problems

---

## Useful Commands

### Quick Status Check
```bash
# One-liner health check
aws cloudwatch describe-alarms --state-value ALARM --query 'length(MetricAlarms)' && \
aws dynamodb describe-table --table-name opx-incidents --query 'Table.TableStatus' && \
echo "System OK"
```

### Cost Summary
```bash
# Get today's cost
aws cloudwatch get-metric-statistics \
  --namespace OPX/Analytics \
  --metric-name TotalCost \
  --start-time $(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 86400 \
  --statistics Sum
```

### Recent Errors
```bash
# Last 10 errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/opx-phase6-executor \
  --filter-pattern "ERROR" \
  --max-items 10
```

---

## Change Management

### Making Configuration Changes

1. **Test in non-production first**
2. **Document the change**
3. **Create backup/snapshot**
4. **Deploy during maintenance window**
5. **Monitor for 1 hour post-change**
6. **Rollback if issues occur**

### Deployment Checklist

- [ ] Change documented
- [ ] Backup created
- [ ] Stakeholders notified
- [ ] Maintenance window scheduled
- [ ] Rollback plan ready
- [ ] Monitoring dashboard open
- [ ] On-call engineer available

---

**For more information:**
- Deployment Guide: `docs/deployment/deployment-guide.md`
- Troubleshooting: `docs/deployment/troubleshooting.md`
- Architecture: `docs/architecture/system-overview.md`
