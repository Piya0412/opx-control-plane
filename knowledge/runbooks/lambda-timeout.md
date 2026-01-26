# Lambda Timeout Runbook

## Overview

This runbook provides step-by-step procedures for diagnosing and resolving AWS Lambda timeout issues.

## Symptoms

- Lambda function execution exceeds configured timeout
- CloudWatch logs show "Task timed out after X seconds"
- Downstream services report request timeouts
- Increased error rates in CloudWatch metrics

## Diagnosis

### Step 1: Check CloudWatch Metrics

1. Navigate to CloudWatch → Metrics → Lambda
2. Check the following metrics:
   - `Duration` - Execution time trend
   - `Errors` - Error rate
   - `Throttles` - Throttling events
   - `ConcurrentExecutions` - Concurrent invocations

### Step 2: Review CloudWatch Logs

1. Navigate to CloudWatch → Log Groups → `/aws/lambda/{function-name}`
2. Search for timeout indicators:
   - "Task timed out after"
   - "REPORT RequestId"
   - Check "Duration" vs "Billed Duration"

### Step 3: Check Function Configuration

1. Navigate to Lambda → Functions → {function-name}
2. Verify configuration:
   - Timeout setting (default: 3 seconds, max: 15 minutes)
   - Memory allocation (affects CPU allocation)
   - VPC configuration (adds cold start latency)
   - Environment variables

### Step 4: Analyze X-Ray Traces

1. Navigate to X-Ray → Traces
2. Filter by function name
3. Identify slow subsegments:
   - Database queries
   - External API calls
   - SDK operations

## Resolution

### Option 1: Increase Timeout (Quick Fix)

**When to use:** Legitimate long-running operations

```bash
aws lambda update-function-configuration \
  --function-name {function-name} \
  --timeout 60
```

**Considerations:**
- Increases cost (billed per 100ms)
- May mask underlying performance issues
- Maximum timeout: 900 seconds (15 minutes)

### Option 2: Optimize Code Performance

**When to use:** Inefficient code causing timeouts

**Common optimizations:**
- Cache external API responses
- Use connection pooling for databases
- Parallelize independent operations
- Reduce cold start time (smaller deployment package)
- Use Lambda layers for shared dependencies

### Option 3: Increase Memory Allocation

**When to use:** CPU-bound operations

```bash
aws lambda update-function-configuration \
  --function-name {function-name} \
  --memory-size 1024
```

**Note:** Memory and CPU are proportionally allocated

### Option 4: Move to Asynchronous Processing

**When to use:** Long-running batch operations

**Approaches:**
- Use SQS for asynchronous processing
- Use Step Functions for orchestration
- Use EventBridge for event-driven workflows

## Verification

1. Trigger test invocation
2. Check CloudWatch logs for successful completion
3. Verify Duration < Timeout
4. Monitor for 24 hours to ensure stability

## Prevention

- Set CloudWatch alarms for Duration > 80% of timeout
- Implement timeout handling in code
- Use X-Ray for continuous performance monitoring
- Regular performance testing under load
- Review timeout settings during deployment

## Related Documentation

- [AWS Lambda Limits](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)
- [Lambda Performance Optimization](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [X-Ray Tracing](https://docs.aws.amazon.com/lambda/latest/dg/services-xray.html)

## Escalation

If timeout persists after following this runbook:
1. Check for AWS service issues (AWS Health Dashboard)
2. Contact AWS Support (if Enterprise Support)
3. Escalate to SRE team lead

## Metadata

- **Severity:** SEV2
- **Services:** Lambda, CloudWatch, X-Ray
- **Last Updated:** 2026-01-27
- **Author:** SRE Team
