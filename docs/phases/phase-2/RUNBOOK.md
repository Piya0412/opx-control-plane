# Phase 2: Operational Runbook

**Phase:** Observability & Detection  
**Version:** 1.0.0  
**Last Updated:** 2026-01-31

---

## Quick Reference

### Key Tables
- `opx-signals` - All normalized signals
- `opx-detections` - Detection results
- `opx-correlation-rules` - Active correlation rules

### Key Lambdas
- `opx-signal-ingestor` - Processes CloudWatch alarms
- `opx-detection-engine` - Evaluates correlation rules
- `opx-correlation-executor` - Time-window correlation

### Key Metrics
- `SignalIngestionRate` - Signals/minute
- `SignalRejectionRate` - Rejected signals/minute
- `CandidateGenerationRate` - Candidates/minute

---

## Common Operations

### Check Signal Ingestion Health

```bash
# Check recent signals
aws dynamodb query \
  --table-name opx-signals \
  --index-name service-observedAt-index \
  --key-condition-expression "service = :svc" \
  --expression-attribute-values '{":svc":{"S":"api-gateway"}}' \
  --limit 10 \
  --scan-index-forward false
```

### View Active Correlation Rules

```bash
# List all enabled rules
aws dynamodb scan \
  --table-name opx-correlation-rules \
  --filter-expression "enabled = :true" \
  --expression-attribute-values '{":true":{"BOOL":true}}'
```

### Check Kill Switch Status

```bash
# Check global kill switch
aws dynamodb get-item \
  --table-name opx-automation-config \
  --key '{"configKey":{"S":"kill-switch-global"}}'
```

### Activate Kill Switch

```bash
# Activate global kill switch
aws dynamodb put-item \
  --table-name opx-automation-config \
  --item '{
    "configKey":{"S":"kill-switch-global"},
    "enabled":{"BOOL":true},
    "reason":{"S":"Emergency stop"},
    "setBy":{"S":"oncall-engineer"},
    "setAt":{"S":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}
  }'
```

### Deactivate Kill Switch

```bash
# Deactivate global kill switch
aws dynamodb put-item \
  --table-name opx-automation-config \
  --item '{
    "configKey":{"S":"kill-switch-global"},
    "enabled":{"BOOL":false},
    "reason":{"S":"Incident resolved"},
    "setBy":{"S":"oncall-engineer"},
    "setAt":{"S":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}
  }'
```

---

## Troubleshooting

### High Signal Rejection Rate

**Symptom:** `SignalRejectionRate` > 5%

**Diagnosis:**
```bash
# Check Lambda logs for rejection reasons
aws logs filter-log-events \
  --log-group-name /aws/lambda/opx-signal-ingestor \
  --filter-pattern "REJECTED" \
  --start-time $(($(date +%s) - 3600))000
```

**Common Causes:**
1. Invalid alarm naming convention
2. Missing service or severity in alarm name
3. Malformed CloudWatch data

**Resolution:**
1. Review alarm naming standards
2. Update alarms to match pattern: `{service}-{severity}-{metric}-alarm`
3. Redeploy alarms with correct naming

### Correlation Engine Failures

**Symptom:** `CorrelationEngineErrors` alarm firing

**Diagnosis:**
```bash
# Check detection engine logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/opx-detection-engine \
  --filter-pattern "ERROR" \
  --start-time $(($(date +%s) - 3600))000
```

**Common Causes:**
1. Invalid correlation rule
2. DynamoDB throttling
3. Lambda timeout

**Resolution:**
1. Validate correlation rules
2. Increase DynamoDB capacity if throttled
3. Increase Lambda timeout if needed

### No Candidates Generated

**Symptom:** Signals arriving but no candidates created

**Diagnosis:**
```bash
# Check if correlation rules are enabled
aws dynamodb scan \
  --table-name opx-correlation-rules \
  --filter-expression "enabled = :true" \
  --expression-attribute-values '{":true":{"BOOL":true}}'

# Check recent signals
aws dynamodb query \
  --table-name opx-signals \
  --index-name observedAt-index \
  --key-condition-expression "pk = :pk" \
  --expression-attribute-values '{":pk":{"S":"SIGNAL"}}' \
  --limit 20 \
  --scan-index-forward false
```

**Common Causes:**
1. No correlation rules enabled
2. Thresholds too high
3. Time window too narrow

**Resolution:**
1. Enable appropriate correlation rules
2. Review and adjust thresholds
3. Widen time window if needed

### Kill Switch Stuck Active

**Symptom:** Kill switch remains active after incident

**Diagnosis:**
```bash
# Check kill switch status
aws dynamodb scan \
  --table-name opx-automation-config \
  --filter-expression "begins_with(configKey, :prefix)" \
  --expression-attribute-values '{":prefix":{"S":"kill-switch"}}'
```

**Resolution:**
```bash
# Deactivate all kill switches
for switch in global service-api-gateway action-restart; do
  aws dynamodb put-item \
    --table-name opx-automation-config \
    --item "{
      \"configKey\":{\"S\":\"kill-switch-$switch\"},
      \"enabled\":{\"BOOL\":false},
      \"reason\":{\"S\":\"Manual reset\"},
      \"setBy\":{\"S\":\"oncall-engineer\"},
      \"setAt\":{\"S\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}
    }"
done
```

---

## Monitoring

### Key Dashboards
- **Signal Ingestion Dashboard** - CloudWatch dashboard for signal metrics
- **Correlation Dashboard** - Correlation rule performance
- **Kill Switch Dashboard** - Kill switch status and history

### Key Alarms
- `HighSignalRejectionRate` - Rejection rate > 5%
- `CorrelationEngineErrors` - Detection engine failures
- `KillSwitchActivated` - Kill switch enabled
- `RateLimitExceeded` - Rate limit hit

### Log Insights Queries

**Signal rejection reasons:**
```
fields @timestamp, service, severity, reason
| filter @message like /REJECTED/
| sort @timestamp desc
| limit 100
```

**Correlation rule performance:**
```
fields @timestamp, ruleId, evaluationTime, candidatesGenerated
| filter @message like /CORRELATION_COMPLETE/
| stats avg(evaluationTime), sum(candidatesGenerated) by ruleId
```

**Kill switch activations:**
```
fields @timestamp, switchId, enabled, reason, setBy
| filter @message like /KILL_SWITCH/
| sort @timestamp desc
```

---

## Maintenance

### Weekly Tasks
- Review signal rejection rate trends
- Audit correlation rule effectiveness
- Check for unused correlation rules
- Review kill switch activation history

### Monthly Tasks
- Analyze signal volume trends
- Optimize correlation rule thresholds
- Review and update alarm naming standards
- Capacity planning for DynamoDB tables

### Quarterly Tasks
- Full correlation rule audit
- Performance optimization review
- Cost optimization analysis
- Documentation updates

---

**Last Updated:** 2026-01-31
