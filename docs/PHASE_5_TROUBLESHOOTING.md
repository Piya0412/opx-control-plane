# Phase 5: Automated Learning Operations - Troubleshooting Guide

**Version:** 1.0.0  
**Last Updated:** January 25, 2026

---

## Common Issues and Solutions

### Issue 1: Pattern Extraction Failure

**Symptoms:**
- `PATTERN_EXTRACTION` operation status: `FAILURE`
- Error in CloudWatch Logs
- Alarm: `opx-pattern-extraction-failure`

**Common Causes:**

1. **Insufficient Outcomes**
   ```
   Error: No outcomes found for time window
   ```
   **Solution:** Verify outcomes exist in the specified date range. Check `opx-outcomes` table.

2. **DynamoDB Throttling**
   ```
   Error: ProvisionedThroughputExceededException
   ```
   **Solution:** Check DynamoDB metrics. Consider increasing capacity or using on-demand billing.

3. **Lambda Timeout**
   ```
   Error: Task timed out after 300.00 seconds
   ```
   **Solution:** Check data volume. Consider reducing time window or increasing Lambda timeout.

**Debugging Steps:**

1. Check CloudWatch Logs:
   ```bash
   aws logs tail /aws/lambda/opx-pattern-extraction-handler --follow
   ```

2. Check audit record:
   ```bash
   aws dynamodb get-item \
     --table-name opx-automation-audit \
     --key '{"PK": {"S": "AUDIT#<auditId>"}, "SK": {"S": "METADATA"}}'
   ```

3. Verify outcomes exist:
   ```bash
   aws dynamodb query \
     --table-name opx-outcomes \
     --key-condition-expression "PK = :pk" \
     --expression-attribute-values '{":pk": {"S": "OUTCOME#2026-01"}}'
   ```

4. Manual retry:
   ```bash
   curl -X POST https://api.example.com/learning/extract-patterns \
     -H "Authorization: ..." \
     -d '{"startDate": "...", "endDate": "...", "emergency": true}'
   ```

---

### Issue 2: Calibration Failure (CRITICAL)

**Symptoms:**
- `CALIBRATION` operation status: `FAILURE`
- Error in CloudWatch Logs
- Alarm: `opx-calibration-failure` (CRITICAL)

**Common Causes:**

1. **Insufficient Data**
   ```
   Error: Insufficient outcomes for calibration (25 < 30)
   ```
   **Solution:** This is expected behavior (fail-closed). Wait for more outcomes or adjust minimum threshold.
   
   **Audit Record:**
   ```json
   {
     "status": "SUCCESS",
     "results": {
       "skipped": "INSUFFICIENT_DATA",
       "outcomeCount": 25,
       "minimumRequired": 30
     }
   }
   ```

2. **Kill Switch Active**
   ```
   Error: Operation skipped - kill switch active
   ```
   **Solution:** Check kill switch status. Deactivate if appropriate.
   
   ```bash
   curl https://api.example.com/learning/kill-switch/status
   ```

3. **DynamoDB Connection Error**
   ```
   Error: Unable to connect to DynamoDB
   ```
   **Solution:** Check VPC configuration, security groups, and DynamoDB endpoint.

**Debugging Steps:**

1. Check outcome count:
   ```bash
   aws dynamodb query \
     --table-name opx-outcomes \
     --key-condition-expression "PK = :pk AND SK BETWEEN :start AND :end" \
     --expression-attribute-values '{
       ":pk": {"S": "OUTCOME"},
       ":start": {"S": "2026-01-01"},
       ":end": {"S": "2026-01-31"}
     }' \
     --select COUNT
   ```

2. Check calibration window:
   - Should be previous full calendar month
   - Example: If today is 2026-02-15, window is 2026-01-01 to 2026-01-31

3. Manual retry with custom window:
   ```bash
   curl -X POST https://api.example.com/learning/calibrate \
     -H "Authorization: ..." \
     -d '{
       "startDate": "2026-01-01T00:00:00.000Z",
       "endDate": "2026-01-31T23:59:59.999Z",
       "emergency": true
     }'
   ```

---

### Issue 3: Snapshot Creation Failure

**Symptoms:**
- `SNAPSHOT` operation status: `FAILURE`
- Error in CloudWatch Logs
- Alarm: `opx-snapshot-failure`

**Common Causes:**

1. **Duplicate Snapshot ID**
   ```
   Error: ConditionalCheckFailedException
   ```
   **Solution:** This is expected for immutable snapshots. Verify snapshot already exists.

2. **Invalid Date Range**
   ```
   Error: Invalid date range for snapshot type
   ```
   **Solution:** Verify date range matches snapshot type:
   - DAILY: Single day (00:00:00 to 23:59:59)
   - WEEKLY: Monday to Sunday
   - MONTHLY: First to last day of month

3. **No Data to Snapshot**
   ```
   Error: No data found for snapshot
   ```
   **Solution:** Verify data exists in source tables for the specified date range.

**Debugging Steps:**

1. Check if snapshot already exists:
   ```bash
   aws dynamodb get-item \
     --table-name opx-snapshots \
     --key '{"PK": {"S": "SNAPSHOT#DAILY#2026-01-25"}, "SK": {"S": "METADATA"}}'
   ```

2. Verify date range calculation:
   - DAILY: `getDailyWindow(now)` → previous day
   - WEEKLY: `getWeeklyWindow(now)` → previous Monday-Sunday
   - MONTHLY: `getMonthlyWindow(now)` → previous month

3. Check source data:
   ```bash
   aws dynamodb query \
     --table-name opx-outcomes \
     --key-condition-expression "PK = :pk AND SK BETWEEN :start AND :end" \
     --expression-attribute-values '{
       ":pk": {"S": "OUTCOME"},
       ":start": {"S": "2026-01-25T00:00:00.000Z"},
       ":end": {"S": "2026-01-25T23:59:59.999Z"}
     }'
   ```

---

### Issue 4: Rate Limit Exceeded

**Symptoms:**
- API response: `429 Too Many Requests`
- Error: `RATE_LIMIT_EXCEEDED`
- Header: `Retry-After: 1800`

**Common Causes:**

1. **Too Many Manual Triggers**
   - Pattern Extraction: 5/hour per principal
   - Calibration: 3/hour per principal
   - Snapshot: 10/hour per principal

**Solution:**

1. Wait for retry-after period:
   ```bash
   # Check Retry-After header
   curl -I https://api.example.com/learning/extract-patterns
   # Retry-After: 1800 (seconds)
   ```

2. Use different IAM principal (if available)

3. Use EMERGENCY_OVERRIDE authority (if justified):
   ```bash
   curl -X POST https://api.example.com/learning/extract-patterns \
     -H "Authorization: ..." \
     -d '{"...", "emergency": true}'
   ```

**Debugging Steps:**

1. Check rate limit records:
   ```bash
   aws dynamodb query \
     --table-name opx-automation-config \
     --key-condition-expression "PK = :pk" \
     --expression-attribute-values '{
       ":pk": {"S": "RATELIMIT#<principalId>#PATTERN_EXTRACTION"}
     }'
   ```

2. Calculate remaining time:
   ```
   Oldest request timestamp: 1706184000000 (2026-01-25 12:00:00)
   Current timestamp: 1706185800000 (2026-01-25 12:30:00)
   Window: 3600000ms (1 hour)
   Retry after: 1706184000000 + 3600000 - 1706185800000 = 1800000ms (30 minutes)
   ```

---

### Issue 5: Kill Switch Not Blocking Operations

**Symptoms:**
- Kill switch status: `active: true`
- Operations still executing

**Common Causes:**

1. **EMERGENCY_OVERRIDE Authority**
   - Operations with `emergency: true` and `EMERGENCY_OVERRIDE` authority bypass kill switch
   - This is expected behavior

2. **Kill Switch Check Failing Open**
   - If kill switch check fails, operations are allowed (fail-open)
   - Check CloudWatch Logs for errors

3. **Stale Configuration**
   - DynamoDB read may be eventually consistent
   - Wait a few seconds and retry

**Debugging Steps:**

1. Verify kill switch status:
   ```bash
   curl https://api.example.com/learning/kill-switch/status
   ```

2. Check operation authority:
   ```bash
   aws dynamodb get-item \
     --table-name opx-automation-audit \
     --key '{"PK": {"S": "AUDIT#<auditId>"}, "SK": {"S": "METADATA"}}' \
     --query 'Item.triggeredBy'
   ```

3. Check for kill switch check errors:
   ```bash
   aws logs filter-pattern "Kill switch check failed" \
     --log-group-name /aws/lambda/opx-pattern-extraction-handler
   ```

---

### Issue 6: Drift Alert Received

**Symptoms:**
- SNS notification: `[ADVISORY] Calibration Drift Detected`
- Drift: `|drift| > 0.15`

**This is NOT an error - it's an advisory alert.**

**Actions:**

1. Review drift details:
   ```json
   {
     "drift": 0.18,
     "driftPercent": "18.0",
     "previousBands": { "low": 0.3, "medium": 0.6, "high": 0.8 },
     "newBands": { "low": 0.35, "medium": 0.65, "high": 0.85 },
     "advisory": true,
     "action": "HUMAN_REVIEW_RECOMMENDED"
   }
   ```

2. Consult with data science team

3. Decide if manual confidence band update is warranted

4. Document decision in incident log

**No automatic changes are made - drift alerts are advisory only.**

---

### Issue 7: High Error Rate Alarm

**Symptoms:**
- Alarm: `opx-learning-high-error-rate`
- Error rate: >10% in 1 hour

**Common Causes:**

1. **Transient Infrastructure Issues**
   - DynamoDB throttling
   - Lambda cold starts
   - Network issues

2. **Data Quality Issues**
   - Invalid data in source tables
   - Schema changes

3. **Configuration Issues**
   - Incorrect environment variables
   - Missing IAM permissions

**Debugging Steps:**

1. Check error distribution:
   ```bash
   aws cloudwatch get-metric-statistics \
     --namespace LearningOperations \
     --metric-name Failure \
     --dimensions Name=OperationType,Value=PATTERN_EXTRACTION \
     --start-time 2026-01-25T11:00:00Z \
     --end-time 2026-01-25T12:00:00Z \
     --period 3600 \
     --statistics Sum
   ```

2. Check error types:
   ```bash
   aws logs filter-pattern "ERROR" \
     --log-group-name /aws/lambda/opx-pattern-extraction-handler \
     --start-time 1706184000000
   ```

3. Review recent changes:
   - Code deployments
   - Configuration changes
   - Infrastructure updates

4. Consider activating kill switch if widespread:
   ```bash
   curl -X POST https://api.example.com/learning/kill-switch/disable \
     -H "Authorization: ..." \
     -d '{"reason": "High error rate - investigating"}'
   ```

---

## Error Message Reference

### Pattern Extraction Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `No outcomes found` | No data in time window | Verify outcomes exist |
| `ProvisionedThroughputExceededException` | DynamoDB throttling | Increase capacity |
| `Task timed out` | Lambda timeout | Reduce time window |
| `KILL_SWITCH_ACTIVE` | Kill switch enabled | Check kill switch status |

### Calibration Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Insufficient outcomes` | <30 outcomes | Wait for more data |
| `Invalid date range` | Incorrect window | Use previous calendar month |
| `KILL_SWITCH_ACTIVE` | Kill switch enabled | Check kill switch status |

### Snapshot Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `ConditionalCheckFailedException` | Duplicate snapshot | Verify snapshot exists |
| `Invalid date range` | Incorrect window | Verify date range |
| `No data found` | No source data | Verify data exists |

### API Errors

| Status | Error | Cause | Solution |
|--------|-------|-------|----------|
| 401 | `UNAUTHORIZED` | Missing IAM principal | Check authentication |
| 403 | `INSUFFICIENT_AUTHORITY` | Wrong authority type | Use EMERGENCY_OVERRIDE |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests | Wait for retry-after |
| 503 | `KILL_SWITCH_ACTIVE` | Kill switch enabled | Check kill switch status |

---

## Log Analysis Guide

### CloudWatch Logs Insights Queries

**Find all failures in last 24 hours:**
```
fields @timestamp, operationType, status, errorMessage
| filter status = "FAILURE"
| sort @timestamp desc
| limit 100
```

**Find slow operations (>1 minute):**
```
fields @timestamp, operationType, duration
| filter duration > 60000
| sort duration desc
| limit 50
```

**Find kill switch blocks:**
```
fields @timestamp, operationType, triggerType
| filter results.skipped = "KILL_SWITCH_ACTIVE"
| sort @timestamp desc
| limit 100
```

**Find rate limit violations:**
```
fields @timestamp, principalId, operationType
| filter errorCode = "RATE_LIMIT_EXCEEDED"
| stats count() by principalId, operationType
```

---

## Performance Optimization

### Slow Pattern Extraction

**Symptoms:** Duration >2 minutes

**Solutions:**

1. Reduce time window:
   - Daily: Previous day only
   - Weekly: Previous week only
   - Monthly: Previous month only

2. Filter by service:
   ```bash
   curl -X POST https://api.example.com/learning/extract-patterns \
     -d '{"service": "order-service", ...}'
   ```

3. Increase Lambda memory (increases CPU):
   - Current: 1024 MB
   - Recommended: 2048 MB

### Slow Calibration

**Symptoms:** Duration >10 minutes

**Solutions:**

1. Verify outcome count is reasonable (<10,000)

2. Check DynamoDB query performance

3. Consider caching previous calibration results

### Slow Snapshot

**Symptoms:** Duration >5 minutes

**Solutions:**

1. Verify data volume is reasonable

2. Consider pagination for large datasets

3. Increase Lambda timeout if needed

---

## Contact Information

- **Slack Channel:** #opx-learning-operations
- **On-Call:** #opx-oncall
- **Documentation:** https://docs.example.com/opx/phase5
- **Troubleshooting Updates:** Submit PR to `docs/PHASE_5_TROUBLESHOOTING.md`

---

**End of Troubleshooting Guide**
