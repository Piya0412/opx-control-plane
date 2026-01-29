# Phase 8.1: CloudWatch Logs Insights Queries

Useful queries for analyzing LLM traces.

## Query 1: High-Cost Traces

Find traces with cost > $0.01:

```
fields @timestamp, traceId, agentId, cost.total
| filter cost.total > 0.01
| sort cost.total desc
| limit 20
```

## Query 2: Slow Traces

Find traces with latency > 5 seconds:

```
fields @timestamp, traceId, agentId, response.latency
| filter response.latency > 5000
| sort response.latency desc
| limit 20
```

## Query 3: Redacted Traces

Count traces with PII redaction by agent:

```
fields @timestamp, traceId, agentId
| filter metadata.redactionApplied = true
| stats count() by agentId
```

## Query 4: Traces by Agent

Analyze traces for specific agent:

```
fields @timestamp, traceId, cost.total, response.latency
| filter agentId = "signal-intelligence"
| stats avg(cost.total), avg(response.latency), count() by bin(5m)
```

## Query 5: Failed Traces

Find traces with validation failures:

```
fields @timestamp, traceId, agentId, metadata.validationStatus
| filter metadata.validationStatus = "failed"
| sort @timestamp desc
| limit 50
```

## Query 6: Retry Analysis

Analyze retry patterns:

```
fields @timestamp, traceId, agentId, metadata.retryCount
| filter metadata.retryCount > 0
| stats count() by agentId, metadata.retryCount
```

## Query 7: Cost by Agent

Total cost per agent:

```
fields agentId, cost.total
| stats sum(cost.total) as totalCost, count() as invocations by agentId
| sort totalCost desc
```

## Query 8: Token Usage

Analyze token usage patterns:

```
fields @timestamp, agentId, prompt.tokens, response.tokens
| stats avg(prompt.tokens) as avgInput, avg(response.tokens) as avgOutput by agentId
```

## Query 9: Guardrails Triggered

Find traces where guardrails fired:

```
fields @timestamp, traceId, agentId, metadata.guardrailsApplied
| filter metadata.guardrailsApplied != []
| display @timestamp, traceId, agentId, metadata.guardrailsApplied
```

## Query 10: Incident Trace Timeline

View all traces for a specific incident:

```
fields @timestamp, traceId, agentId, cost.total, response.latency
| filter incidentId = "INC-001"
| sort @timestamp asc
```

## DynamoDB Query Examples

### Query by Agent (GSI)

```python
import boto3

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('opx-llm-traces')

response = table.query(
    IndexName='agentId-timestamp-index',
    KeyConditionExpression='agentId = :aid AND #ts BETWEEN :start AND :end',
    ExpressionAttributeNames={'#ts': 'timestamp'},
    ExpressionAttributeValues={
        ':aid': 'signal-intelligence',
        ':start': '2026-01-29T00:00:00Z',
        ':end': '2026-01-29T23:59:59Z'
    }
)

for item in response['Items']:
    print(f"Trace: {item['traceId']}, Cost: ${item['cost']['total']}")
```

### Get Specific Trace

```python
response = table.get_item(
    Key={
        'traceId': 'trace-123',
        'timestamp': '2026-01-29T12:00:00Z'
    }
)

trace = response['Item']
print(f"Agent: {trace['agentId']}")
print(f"Prompt: {trace['prompt']['text']}")
print(f"Response: {trace['response']['text']}")
print(f"Cost: ${trace['cost']['total']}")
```

## Metrics to Monitor

### Cost Metrics

- Total cost per day
- Cost per agent
- Cost per incident
- Cost trend over time

### Performance Metrics

- Average latency per agent
- P50, P90, P99 latency
- Timeout rate
- Retry rate

### Quality Metrics

- Redaction rate (% of traces with PII)
- Validation failure rate
- Guardrail trigger rate
- Token efficiency (output/input ratio)

## Alerts to Configure

### Cost Alert

Trigger when daily cost exceeds $10:

```
fields cost.total
| stats sum(cost.total) as dailyCost
| filter dailyCost > 10
```

### Latency Alert

Trigger when P95 latency exceeds 10 seconds:

```
fields response.latency
| stats pct(response.latency, 95) as p95
| filter p95 > 10000
```

### Error Rate Alert

Trigger when validation failure rate exceeds 5%:

```
fields metadata.validationStatus
| stats count() as total, 
        sum(case when metadata.validationStatus = "failed" then 1 else 0 end) as failures
| fields (failures / total * 100) as failureRate
| filter failureRate > 5
```
