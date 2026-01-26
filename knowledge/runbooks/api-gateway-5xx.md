# API Gateway 5XX Errors Runbook

## Overview

This runbook provides procedures for diagnosing and resolving AWS API Gateway 5XX errors.

## Symptoms

- API Gateway returning 500, 502, 503, or 504 errors
- CloudWatch metrics show increased 5XXError count
- Client applications reporting service unavailable
- Increased latency in API responses

## Error Codes

- **500 Internal Server Error** - Backend integration error
- **502 Bad Gateway** - Invalid response from backend
- **503 Service Unavailable** - API Gateway throttling or overload
- **504 Gateway Timeout** - Backend timeout (29-second limit)

## Diagnosis

### Step 1: Check CloudWatch Metrics

1. Navigate to CloudWatch → Metrics → API Gateway
2. Check the following metrics:
   - `5XXError` - Server-side errors
   - `4XXError` - Client-side errors (for comparison)
   - `Count` - Total requests
   - `Latency` - Response time
   - `IntegrationLatency` - Backend response time

### Step 2: Review CloudWatch Logs

1. Navigate to CloudWatch → Log Groups → `API-Gateway-Execution-Logs_{api-id}/{stage}`
2. Enable execution logging if not already enabled
3. Search for error patterns:
   - "Execution failed"
   - "Integration timeout"
   - "Internal server error"

### Step 3: Check Backend Health

**For Lambda integration:**
```bash
aws lambda get-function \
  --function-name {function-name} \
  --query 'Configuration.State'
```

**For HTTP integration:**
```bash
curl -I https://backend-endpoint.example.com/health
```

### Step 4: Review API Gateway Configuration

1. Navigate to API Gateway → APIs → {api-name}
2. Check integration settings:
   - Integration type (Lambda, HTTP, Mock)
   - Timeout configuration (max: 29 seconds)
   - VPC link status (if applicable)

## Resolution

### 500 Internal Server Error

**Cause:** Backend integration error

**Resolution:**

1. **Check Lambda function errors:**
```bash
aws logs tail /aws/lambda/{function-name} --follow
```

2. **Check Lambda permissions:**
```bash
aws lambda get-policy --function-name {function-name}
```

3. **Verify IAM role:**
```bash
aws iam get-role --role-name {api-gateway-role}
```

### 502 Bad Gateway

**Cause:** Invalid response format from backend

**Resolution:**

1. **Check response format:**
   - Lambda: Must return `{ statusCode, body, headers }`
   - HTTP: Must return valid HTTP response

2. **Verify integration response mapping:**
   - Navigate to API Gateway → Integration Response
   - Check response templates
   - Verify status code mappings

3. **Test integration directly:**
```bash
# For Lambda
aws lambda invoke \
  --function-name {function-name} \
  --payload '{"test": "data"}' \
  response.json

# For HTTP
curl -X POST https://backend-endpoint.example.com/api \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

### 503 Service Unavailable

**Cause:** API Gateway throttling or overload

**Resolution:**

1. **Check throttle limits:**
```bash
aws apigateway get-usage-plan \
  --usage-plan-id {plan-id}
```

2. **Increase throttle limits:**
```bash
aws apigateway update-usage-plan \
  --usage-plan-id {plan-id} \
  --patch-operations \
    op=replace,path=/throttle/rateLimit,value=1000 \
    op=replace,path=/throttle/burstLimit,value=2000
```

3. **Check account limits:**
```bash
aws service-quotas get-service-quota \
  --service-code apigateway \
  --quota-code L-A93B7C5F
```

### 504 Gateway Timeout

**Cause:** Backend response time > 29 seconds

**Resolution:**

1. **Optimize backend performance:**
   - Reduce Lambda execution time
   - Add caching layer (ElastiCache)
   - Optimize database queries

2. **Implement asynchronous processing:**
   - Use SQS for long-running tasks
   - Return 202 Accepted immediately
   - Provide status endpoint for polling

3. **Increase Lambda timeout (if < 29s):**
```bash
aws lambda update-function-configuration \
  --function-name {function-name} \
  --timeout 28
```

## Verification

1. **Test API endpoint:**
```bash
curl -X GET https://{api-id}.execute-api.{region}.amazonaws.com/{stage}/endpoint \
  -H "Authorization: Bearer {token}"
```

2. **Check CloudWatch metrics:**
   - 5XXError count should be 0
   - Latency should be < 1 second
   - IntegrationLatency should be < 500ms

3. **Monitor for 30 minutes** to ensure stability

## Prevention

### Enable Monitoring

1. **CloudWatch Alarms:**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name api-gateway-5xx-errors \
  --metric-name 5XXError \
  --namespace AWS/ApiGateway \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold
```

2. **Enable X-Ray tracing:**
```bash
aws apigateway update-stage \
  --rest-api-id {api-id} \
  --stage-name {stage} \
  --patch-operations op=replace,path=/tracingEnabled,value=true
```

### Implement Best Practices

- Use API Gateway caching for frequently accessed data
- Implement request validation to reduce backend load
- Use throttling to protect backend services
- Implement circuit breaker pattern in clients
- Use exponential backoff for retries

## Related Documentation

- [API Gateway Error Codes](https://docs.aws.amazon.com/apigateway/latest/developerguide/supported-gateway-response-types.html)
- [API Gateway Throttling](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html)
- [Lambda Integration](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-integrations.html)

## Escalation

If 5XX errors persist after following this runbook:
1. Check AWS Health Dashboard for service issues
2. Review recent deployments (rollback if needed)
3. Contact AWS Support (Priority: High)
4. Escalate to API Team Lead

## Metadata

- **Severity:** SEV2
- **Services:** API Gateway, Lambda, CloudWatch, X-Ray
- **Last Updated:** 2026-01-27
- **Author:** API Team
