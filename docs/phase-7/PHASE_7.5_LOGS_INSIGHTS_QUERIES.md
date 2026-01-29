# Phase 7.5: CloudWatch Logs Insights Queries

**Purpose:** Pre-built queries for Knowledge Base analytics and troubleshooting.

---

## Query 1: Zero-Result Queries (Knowledge Gaps)

**Purpose:** Identify queries that returned no results (knowledge gaps)

```
fields @timestamp, query, incident_id, latency_ms
| filter event_type = "retrieval_success" and result_count = 0
| sort @timestamp desc
| limit 20
```

**Use Case:** Identify missing runbooks or postmortems

---

## Query 2: Low-Relevance Queries

**Purpose:** Identify queries with low average relevance scores (< 0.5)

```
fields @timestamp, query, avg_relevance_score, result_count
| filter event_type = "retrieval_success" and avg_relevance_score < 0.5 and avg_relevance_score > 0
| sort avg_relevance_score asc
| limit 20
```

**Use Case:** Identify poor-quality retrieval results

---

## Query 3: Document Citation Frequency

**Purpose:** Analyze which documents are most frequently cited

```
fields @timestamp, query, citations
| filter event_type = "retrieval_success" and result_count > 0
| stats count(*) as citation_count by citations
| sort citation_count desc
| limit 20
```

**Use Case:** Identify most valuable documents

---

## Query 4: High Latency Queries

**Purpose:** Identify slow queries (> 1000ms)

```
fields @timestamp, query, latency_ms, result_count
| filter latency_ms > 1000
| sort latency_ms desc
| limit 20
```

**Use Case:** Performance troubleshooting

---

## Query 5: Error Analysis

**Purpose:** Analyze retrieval errors

```
fields @timestamp, query, error, incident_id
| filter event_type = "retrieval_error"
| sort @timestamp desc
| limit 20
```

**Use Case:** Troubleshoot Knowledge Base failures

---

## Query 6: Query Pattern Analysis

**Purpose:** Identify most common query patterns

```
fields query
| filter event_type = "retrieval_success"
| stats count(*) as query_count by query
| sort query_count desc
| limit 20
```

**Use Case:** Understand user behavior and common questions

---

## Query 7: Incident-Specific Retrieval

**Purpose:** Analyze all retrievals for a specific incident

```
fields @timestamp, query, result_count, avg_relevance_score, latency_ms
| filter incident_id = "INC-2026-001"
| sort @timestamp asc
```

**Use Case:** Debug incident-specific retrieval issues

---

## Query 8: Daily Summary Statistics

**Purpose:** Daily aggregated statistics

```
fields @timestamp
| filter event_type = "retrieval_success"
| stats 
    count(*) as total_queries,
    sum(result_count = 0) as zero_results,
    avg(latency_ms) as avg_latency,
    avg(avg_relevance_score) as avg_relevance
by bin(@timestamp, 1d)
| sort @timestamp desc
```

**Use Case:** Daily operational review

---

## Query 9: Query Type Distribution

**Purpose:** Analyze query types (runbook vs postmortem vs general)

```
fields @timestamp, query
| filter event_type = "retrieval_success"
| stats count(*) as query_count by 
    case 
        when query like /runbook|procedure|how to|steps/ then "runbook"
        when query like /postmortem|incident|outage|failure/ then "postmortem"
        else "general"
    end as query_type
| sort query_count desc
```

**Use Case:** Understand content demand

---

## Query 10: Relevance Score Distribution

**Purpose:** Analyze distribution of relevance scores

```
fields avg_relevance_score
| filter event_type = "retrieval_success" and avg_relevance_score > 0
| stats count(*) as query_count by 
    case 
        when avg_relevance_score >= 0.8 then "high (0.8-1.0)"
        when avg_relevance_score >= 0.6 then "medium (0.6-0.8)"
        when avg_relevance_score >= 0.4 then "low (0.4-0.6)"
        else "very_low (<0.4)"
    end as relevance_bucket
| sort relevance_bucket asc
```

**Use Case:** Quality assessment

---

## How to Use

### 1. Open CloudWatch Logs Insights
```
AWS Console → CloudWatch → Logs → Insights
```

### 2. Select Log Group
```
/aws/lambda/opx-knowledge-rag-tool-retrieve-knowledge
```

### 3. Paste Query
Copy one of the queries above

### 4. Set Time Range
- Last 1 hour (troubleshooting)
- Last 24 hours (daily review)
- Last 7 days (trend analysis)

### 5. Run Query
Click "Run query"

### 6. Export Results (Optional)
- Export to CSV
- Export to CloudWatch Dashboard
- Save query for reuse

---

## Automation

These queries can be automated using:
- CloudWatch Logs Insights API
- Lambda scheduled functions
- EventBridge rules

See `src/knowledge/analytics-processor.py` for example automation.

---

## Best Practices

1. **Run queries during off-peak hours** (analytics can be resource-intensive)
2. **Use time ranges wisely** (shorter ranges = faster queries)
3. **Save frequently-used queries** (CloudWatch allows saving queries)
4. **Export results to S3** (for long-term analysis)
5. **Combine with DynamoDB analytics** (for deeper insights)

---

**Last Updated:** January 29, 2026  
**Phase:** 7.5 - Knowledge Base Monitoring
