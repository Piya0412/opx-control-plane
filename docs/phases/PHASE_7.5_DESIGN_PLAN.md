# Phase 7.5: Knowledge Base Monitoring & Observability — DESIGN PLAN

**Status:** ✅ APPROVED WITH CONDITIONS  
**Dependencies:** Phase 7.4 (Knowledge RAG Agent Integration) ✅  
**Estimated Duration:** 2-3 days  
**Approval Date:** January 29, 2026  
**Authorization:** Proceed to implementation (Tasks 1-4 only)

---

## Executive Summary

Phase 7.5 adds comprehensive monitoring and observability for the Bedrock Knowledge Base to ensure:
- **Retrieval quality** is measurable and improving
- **Performance** meets SLA targets (< 2s P95 latency)
- **Cost** is tracked and optimized
- **Failures** are detected and alerted
- **Usage patterns** inform content curation

**Key Principle:** You can't improve what you don't measure.

---

## Objectives

### Primary
1. Monitor Knowledge Base retrieval performance and quality
2. Track citation accuracy and relevance
3. Alert on degraded retrieval quality or failures
4. Provide visibility into knowledge corpus usage
5. Enable data-driven content curation decisions

### Secondary
1. Optimize retrieval costs through usage analysis
2. Identify knowledge gaps (queries with no results)
3. Measure impact of knowledge base on incident resolution
4. Support A/B testing of retrieval strategies

### Non-Objectives
- ❌ Real-time alerting (CloudWatch alarms are sufficient)
- ❌ Custom embeddings or vector stores (use Bedrock native)
- ❌ Query caching (deferred to Phase 8.5+)
- ❌ A/B testing (deferred to Phase 8.5+)
- ❌ User-facing analytics dashboard (Phase 8)
- ❌ Citation semantic correctness (Phase 8 - AI Governance)
- ❌ Human feedback loops (Phase 8+)
- ❌ Retrieval behavior changes (Phase 8+)

---

## Architecture Overview


```
┌─────────────────────────────────────────────────────────────┐
│         Knowledge RAG Agent (Bedrock)                       │
│         Invokes retrieve-knowledge action group             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  Lambda: opx-knowledge-rag-tool-retrieve-knowledge          │
│                                                             │
│  • Retrieves from Bedrock Knowledge Base                    │
│  • Emits CloudWatch metrics                                 │
│  • Logs structured events                                   │
│  • Tracks latency, result count, relevance                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│         Bedrock Knowledge Base (HJPLE9IOEU)                 │
│         • Vector search via OpenSearch Serverless           │
│         • Returns chunks with relevance scores              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│              MONITORING LAYER (Phase 7.5)                   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         CloudWatch Metrics                           │  │
│  │  • KnowledgeRetrievalCount                           │  │
│  │  • KnowledgeRetrievalLatency (P50, P95, P99)         │  │
│  │  • KnowledgeRetrievalResultCount                     │  │
│  │  • KnowledgeRetrievalErrors                          │  │
│  │  • KnowledgeRetrievalZeroResults                     │  │
│  │  • KnowledgeRetrievalRelevanceScore (avg)            │  │
│  │  • KnowledgeCitationAccuracy                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         CloudWatch Logs Insights                     │  │
│  │  • Query patterns analysis                           │  │
│  │  • Zero-result queries (knowledge gaps)              │  │
│  │  • Low-relevance queries (< 0.5 score)               │  │
│  │  • Citation usage by document                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         CloudWatch Alarms                            │  │
│  │  • Retrieval latency > 2s (P95)                      │  │
│  │  • Error rate > 5%                                   │  │
│  │  • Zero results rate > 50%                           │  │
│  │  • Relevance score < 0.4 (avg)                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         CloudWatch Dashboard                         │  │
│  │  • Retrieval performance (latency, throughput)       │  │
│  │  • Quality metrics (relevance, zero results)         │  │
│  │  • Cost tracking (queries per day, embeddings)       │  │
│  │  • Document usage heatmap                            │  │
│  │  • Knowledge gap analysis                            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│         DynamoDB: opx-knowledge-retrieval-metrics           │
│         • Detailed query logs for analysis                  │
│         • PK: date#query_hash                               │
│         • SK: timestamp                                     │
│         • TTL: 90 days                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Task Breakdown

### Task 1: CloudWatch Metrics Emission (1 day)

**Objective:** Emit structured metrics from knowledge retrieval Lambda

**Deliverables:**
1. Update `src/langgraph/action_groups/knowledge_retrieval.py`:
   - Emit `KnowledgeRetrievalCount` (count)
   - Emit `KnowledgeRetrievalLatency` (milliseconds)
   - Emit `KnowledgeRetrievalResultCount` (count)
   - Emit `KnowledgeRetrievalErrors` (count)
   - Emit `KnowledgeRetrievalZeroResults` (count)
   - Emit `KnowledgeRetrievalRelevanceScore` (average)

2. Add metric dimensions (LOW CARDINALITY ONLY):
   - `AgentId`: knowledge-rag
   - `QueryType`: classification (e.g., "runbook", "postmortem")
   - ❌ NO IncidentId dimension (high cardinality - log only)

3. Structured logging:
   - Log query text (sanitized)
   - Log result count
   - Log relevance scores
   - Log execution time

3. Structured logging (NON-BLOCKING):
   - Log incident_id (NOT as metric dimension)
   - Log query text (sanitized)
   - Log result count
   - Log relevance scores
   - Log execution time
   - All logging wrapped in try/catch (best-effort)

4. Non-blocking metric emission:
   - All metric emission wrapped in try/catch
   - Retrieval MUST succeed even if metrics fail
   - Log metric emission failures (do not throw)

**Acceptance Criteria:**
- Metrics visible in CloudWatch within 1 minute
- Dimensions are low-cardinality (AgentId, QueryType only)
- Logs are structured JSON (parseable by Logs Insights)
- Metric emission failures do not break retrieval
- IncidentId logged but NOT used as metric dimension



---

### Task 2: CloudWatch Dashboard (0.5 days)

**Objective:** Create operational dashboard for Knowledge Base monitoring

**Deliverables:**
1. CDK construct: `infra/constructs/knowledge-base-dashboard.ts`
2. Dashboard widgets:
   - **Performance Panel:**
     - Retrieval latency (P50, P95, P99) - line graph
     - Queries per minute - line graph
     - Error rate - line graph
   - **Quality Panel:**
     - Average relevance score - line graph
     - Zero results rate - line graph
     - Results per query distribution - bar chart
   - **Usage Panel:**
     - Queries by type (runbook vs postmortem) - pie chart
     - Top 10 queries - table
     - Document citation frequency - bar chart
   - **Cost Panel:**
     - Queries per day - line graph
     - Estimated monthly cost - single value
     - Cost per incident - single value

3. Time range: Last 24 hours (default), configurable

**Acceptance Criteria:**
- Dashboard accessible via CloudWatch console
- All widgets render with real data
- Dashboard updates automatically (1-minute refresh)

---

### Task 3: CloudWatch Alarms (0.5 days)

**Objective:** Alert on degraded retrieval quality or failures

**Deliverables:**
1. CDK construct: `infra/constructs/knowledge-base-alarms.ts`
2. Alarms:
   - **High Latency Alarm:**
     - Metric: `KnowledgeRetrievalLatency` (P95)
     - Threshold: > 2000 ms
     - Evaluation: 2 out of 3 datapoints
     - Action: SNS topic (opx-knowledge-base-alerts)
   - **High Error Rate Alarm:**
     - Metric: `KnowledgeRetrievalErrors`
     - Threshold: > 5% of queries
     - Evaluation: 2 out of 3 datapoints
     - Action: SNS topic
   - **High Zero Results Rate Alarm:**
     - Metric: `KnowledgeRetrievalZeroResults`
     - Threshold: > 50% of queries
     - Evaluation: 3 out of 5 datapoints
     - Action: SNS topic
   - **Low Relevance Score Alarm:**
     - Metric: `KnowledgeRetrievalRelevanceScore` (avg)
     - Threshold: < 0.4
     - Evaluation: 3 out of 5 datapoints
     - Action: SNS topic

3. SNS topic with email subscription (configurable)
4. TreatMissingData = notBreaching on ALL alarms (prevents false positives during low traffic)

**Acceptance Criteria:**
- Alarms trigger on threshold breach
- SNS notifications received via email
- Alarms auto-resolve when metrics return to normal
- No false positives during low traffic periods

---

### Task 4: Query Analytics & Knowledge Gaps (1 day)

**Objective:** Identify knowledge gaps and optimize content

**Deliverables:**
1. DynamoDB table: `opx-knowledge-retrieval-metrics`
   - **NOT AUTHORITATIVE** (analytics exhaust only)
   - **NOT REPLAYED** (not part of incident lifecycle)
   - **NOT USED FOR DECISIONS** (observability only)
   - PK: `date#query_hash` (e.g., "2026-01-29#abc123")
   - SK: `timestamp` (ISO-8601)
   - Attributes:
     - `query_text` (sanitized)
     - `result_count` (number)
     - `relevance_scores` (array)
     - `citations` (array of document IDs)
     - `incident_id` (string)
     - `agent_id` (string)
     - `latency_ms` (number)
     - `error` (string, if failed)
   - TTL: 90 days
   - GSI: `query_text-timestamp-index` (for query pattern analysis)

2. Lambda function: `opx-knowledge-analytics-processor`
   - Triggered: Daily (EventBridge schedule)
   - Analyzes last 24 hours of queries
   - Identifies:
     - Top 10 zero-result queries (knowledge gaps)
     - Top 10 low-relevance queries (< 0.5 score)
     - Most cited documents
     - Least cited documents (candidates for removal)
   - Outputs: JSON report to S3 (`s3://opx-knowledge-corpus/analytics/`)

3. CloudWatch Logs Insights queries:
   - **Zero-result queries:**
     ```
     fields @timestamp, query_text, incident_id
     | filter result_count = 0
     | sort @timestamp desc
     | limit 20
     ```
   - **Low-relevance queries:**
     ```
     fields @timestamp, query_text, avg_relevance_score
     | filter avg_relevance_score < 0.5
     | sort avg_relevance_score asc
     | limit 20
     ```
   - **Document usage:**
     ```
     fields document_id, count(*) as citation_count
     | stats count(*) by document_id
     | sort citation_count desc
     ```

**Acceptance Criteria:**
- Query logs stored in DynamoDB
- Daily analytics report generated
- Logs Insights queries return actionable data
- Knowledge gaps identified for content curation



---

### Task 5: Citation Accuracy Tracking (DEFERRED TO PHASE 8)

**Status:** ❌ NOT INCLUDED IN PHASE 7.5

**Rationale:**
- Citation correctness is a governance/trust concern
- Phase 8 already owns AI quality & safety
- Phase 7.5 should stay focused on retrieval health, not semantic correctness

**Action:**
- Task 5 remains documented for future reference
- Will be implemented in Phase 8 (AI Governance)
- No work on citation semantic validation in Phase 7.5

---

---

## Approval Conditions & Binding Constraints

### Approval Status: ✅ APPROVED WITH CONDITIONS

**Approval Date:** January 29, 2026  
**Approval Type:** Conditional (minor scope constraints)  
**Authorization:** Proceed to implementation (Tasks 1-4 only)

### Binding Decisions

#### Q1. Metric Granularity
**Decision:** ✅ Current metrics are sufficient
- ❌ No per-document metrics at CloudWatch metric level
- ✅ Per-document analysis allowed via Logs Insights / DynamoDB analytics
- **Rationale:** Per-document metrics explode cardinality and cost

#### Q2. Alarm Thresholds
**Decision:** ✅ Thresholds approved as-is
- **Addition:** TreatMissingData = notBreaching on ALL alarms
- **Rationale:** Avoids false alarms during low traffic

#### Q3. Analytics Frequency
**Decision:** ✅ Daily is correct
- ❌ No hourly analytics
- ❌ No near-real-time aggregation
- **Rationale:** Knowledge curation, not incident response

#### Q4. Citation Accuracy Tracking (Task 5)
**Decision:** ⚠️ DEFER to Phase 8
- **Rationale:** Citation correctness is governance/trust concern (Phase 8 scope)
- **Action:** Leave documented, do not implement in Phase 7.5

#### Q5. Cost Approval
**Decision:** ✅ Approved (~$3.45/month)
- **Rationale:** Negligible, fully justified, transparent

#### Q6. Query Caching / A/B Testing
**Decision:** ❌ Explicitly deferred to Phase 8.5+
- **Rationale:** Optimization features, behavior-changing, risky without human UI

### Mandatory Constraints

#### 🔒 Constraint 1: No Incident-ID Cardinality in Metrics
- ❌ IncidentId must NOT be a CloudWatch metric dimension
- ✅ Use AgentId, QueryType only
- ✅ Log IncidentId in structured logs / DynamoDB
- **Rationale:** High cardinality, expensive, breaks CloudWatch best practices

#### 🔒 Constraint 2: Metric Emission Must Be Non-Blocking
- ✅ Metric emission must never fail the retrieval
- ✅ All metric/log emission wrapped in try/catch
- ✅ Best-effort semantics
- **Rationale:** If monitoring breaks, retrieval must still succeed

#### 🔒 Constraint 3: DynamoDB Metrics Table Is NOT Authoritative
- ❌ Not replayed
- ❌ Not used for decisions
- ❌ Not part of incident lifecycle
- ✅ Pure analytics exhaust
- **Rationale:** Observability only, not operational

### Final Approved Scope (Locked)

**✅ Phase 7.5 WILL include:**
- Tasks 1–4
- Metrics
- Dashboard
- Alarms
- Analytics
- Knowledge gap workflow

**❌ Phase 7.5 WILL NOT include:**
- Citation semantic correctness (Phase 8)
- Caching (Phase 8.5+)
- A/B testing (Phase 8.5+)
- Retrieval behavior changes (Phase 8+)
- Human feedback loops (Phase 8+)

---

## Metrics Specification

### CloudWatch Metrics

| Metric Name | Unit | Dimensions | Description |
|-------------|------|------------|-------------|
| `KnowledgeRetrievalCount` | Count | AgentId, QueryType | Total retrieval requests |
| `KnowledgeRetrievalLatency` | Milliseconds | AgentId, QueryType | Time to retrieve results |
| `KnowledgeRetrievalResultCount` | Count | AgentId, QueryType | Number of results returned |
| `KnowledgeRetrievalErrors` | Count | AgentId, QueryType, ErrorType | Failed retrievals |
| `KnowledgeRetrievalZeroResults` | Count | AgentId, QueryType | Queries with no results |
| `KnowledgeRetrievalRelevanceScore` | None | AgentId, QueryType | Average relevance score (0-1) |

**Note:** IncidentId is logged in structured logs but NOT used as a metric dimension (high cardinality).

### Alarm Thresholds

| Alarm | Threshold | Evaluation Period | Justification |
|-------|-----------|-------------------|---------------|
| High Latency | P95 > 2000ms | 2 of 3 datapoints (5 min) | SLA target is < 2s |
| High Error Rate | > 5% | 2 of 3 datapoints (5 min) | Acceptable error budget |
| High Zero Results | > 50% | 3 of 5 datapoints (15 min) | Indicates knowledge gaps |
| Low Relevance | Avg < 0.4 | 3 of 5 datapoints (15 min) | Below useful threshold |

---

## Dashboard Layout

### Panel 1: Performance (Top Left)
- **Retrieval Latency** (line graph, P50/P95/P99)
- **Queries Per Minute** (line graph)
- **Error Rate** (line graph, %)

### Panel 2: Quality (Top Right)
- **Average Relevance Score** (line graph, 0-1)
- **Zero Results Rate** (line graph, %)
- **Results Per Query** (bar chart, distribution)

### Panel 3: Usage (Bottom Left)
- **Queries by Type** (pie chart: runbook vs postmortem)
- **Top 10 Queries** (table: query, count, avg_relevance)
- **Document Citations** (bar chart: top 10 documents)

### Panel 4: Cost (Bottom Right)
- **Queries Per Day** (line graph)
- **Estimated Monthly Cost** (single value, $)
- **Cost Per Incident** (single value, $)

---

## Cost Analysis

### Additional Costs (Phase 7.5)

| Component | Cost | Notes |
|-----------|------|-------|
| CloudWatch Metrics | $0.30/metric/month | ~7 custom metrics = $2.10/month |
| CloudWatch Logs | $0.50/GB ingested | ~1 GB/month = $0.50/month |
| CloudWatch Alarms | $0.10/alarm/month | 4 alarms = $0.40/month |
| CloudWatch Dashboard | Free | 3 dashboards included |
| DynamoDB (metrics table) | $0.25/GB/month | ~1 GB = $0.25/month |
| Lambda (analytics) | $0.20/month | 1 invocation/day |

**Total Additional Cost:** ~$3.45/month

**Total Phase 7 Cost:** ~$353.45/month (Phase 7.3 + 7.5)

---

## Implementation Plan

### Day 1: Metrics & Logging
- [ ] Update knowledge retrieval Lambda with metric emission (non-blocking)
- [ ] Add structured logging (with incident_id in logs, not metrics)
- [ ] Wrap all metric/log emission in try/catch
- [ ] Test metrics appear in CloudWatch
- [ ] Validate metric dimensions (AgentId, QueryType only)
- [ ] Verify retrieval succeeds even if metrics fail

### Day 2: Dashboard & Alarms
- [ ] Create CloudWatch dashboard CDK construct
- [ ] Create CloudWatch alarms CDK construct (with TreatMissingData = notBreaching)
- [ ] Deploy infrastructure
- [ ] Verify dashboard renders
- [ ] Test alarm triggers
- [ ] Verify no false positives during low traffic

### Day 3: Analytics & Knowledge Gaps
- [ ] Create DynamoDB metrics table (with NOT AUTHORITATIVE documentation)
- [ ] Create analytics processor Lambda (daily schedule)
- [ ] Create EventBridge schedule
- [ ] Test daily analytics report
- [ ] Create Logs Insights queries
- [ ] Document knowledge gap workflow

### NOT INCLUDED (Deferred to Phase 8)
- [ ] ~~Citation validation logic~~ (Phase 8)
- [ ] ~~Citation accuracy metric~~ (Phase 8)
- [ ] ~~Dashboard widget for citations~~ (Phase 8)

---

## Testing Strategy

### Unit Tests
- [ ] Metric emission logic
- [ ] Citation validation rules
- [ ] Analytics processor logic
- [ ] Query sanitization

### Integration Tests
- [ ] End-to-end retrieval with metrics
- [ ] Dashboard data population
- [ ] Alarm trigger simulation
- [ ] Analytics report generation

### Manual Validation
- [ ] Trigger retrieval, verify metrics in CloudWatch
- [ ] Check dashboard updates in real-time
- [ ] Trigger alarm by injecting failures
- [ ] Review analytics report for accuracy

---

## Success Criteria

### Functional
- [ ] All metrics emitted correctly (non-blocking)
- [ ] Dashboard displays real-time data
- [ ] Alarms trigger on threshold breach (no false positives)
- [ ] Analytics report identifies knowledge gaps
- [ ] DynamoDB table documented as NOT AUTHORITATIVE

### Performance
- [ ] Metric emission adds < 10ms latency
- [ ] Retrieval succeeds even if metrics fail
- [ ] Dashboard loads in < 3 seconds
- [ ] Analytics processor completes in < 1 minute
- [ ] Logs Insights queries return in < 5 seconds

### Quality
- [ ] Metrics are accurate (validated against logs)
- [ ] Alarms have no false positives (TreatMissingData = notBreaching)
- [ ] Knowledge gaps are actionable
- [ ] Dashboard is intuitive for operators
- [ ] All constraints respected (low cardinality, non-blocking, non-authoritative)



---

## Rollout Strategy

### Phase 1: Metrics Only (Low Risk)
- Deploy metric emission code
- Validate metrics in CloudWatch
- No alarms or dashboards yet
- **Duration:** 1 day
- **Rollback:** Remove metric emission code

### Phase 2: Dashboard (Low Risk)
- Deploy CloudWatch dashboard
- Validate data visualization
- Share with team for feedback
- **Duration:** 0.5 days
- **Rollback:** Delete dashboard

### Phase 3: Alarms (Medium Risk)
- Deploy CloudWatch alarms
- Set SNS topic to test email first
- Monitor for false positives (1 week)
- Adjust thresholds if needed
- **Duration:** 0.5 days
- **Rollback:** Disable alarms

### Phase 4: Analytics (Low Risk)
- Deploy DynamoDB table and Lambda
- Run analytics processor manually first
- Enable daily schedule after validation
- **Duration:** 1 day
- **Rollback:** Disable EventBridge schedule

---

## Monitoring the Monitoring

### Meta-Metrics
- [ ] Metric emission failures (Lambda errors)
- [ ] Dashboard load time
- [ ] Alarm evaluation lag
- [ ] Analytics processor duration
- [ ] DynamoDB table size growth

### Health Checks
- [ ] Daily: Review dashboard for anomalies
- [ ] Weekly: Review analytics report
- [ ] Monthly: Review alarm history (false positives)
- [ ] Quarterly: Review knowledge gap trends

---

## Knowledge Gap Workflow

### 1. Identification
- Analytics processor identifies zero-result queries
- Queries ranked by frequency
- Top 10 exported to S3 report

### 2. Triage
- SRE reviews report weekly
- Categorizes queries:
  - **Valid gap:** Missing runbook/postmortem
  - **Invalid query:** User error or out-of-scope
  - **Existing content:** Retrieval quality issue

### 3. Action
- **Valid gap:** Create new document, add to corpus
- **Invalid query:** Update agent prompt or user guidance
- **Existing content:** Improve document metadata or chunking

### 4. Validation
- Re-run query after content update
- Verify results returned with good relevance
- Track improvement in zero-results rate

---

## Future Enhancements (Post-7.5)

### Query Caching
- Cache frequent queries (e.g., "RDS failover")
- Reduce retrieval latency and cost
- Invalidate cache on content updates

### A/B Testing
- Test SEMANTIC vs HYBRID search
- Compare relevance scores
- Measure impact on incident resolution time

### Custom Embeddings
- Train custom embedding model on incident data
- Improve relevance for domain-specific queries
- Requires ML expertise and infrastructure

### Feedback Loop
- Collect human feedback on retrieval quality
- "Was this helpful?" button in UI
- Use feedback to tune retrieval parameters

### Automated Content Curation
- Automatically identify outdated documents
- Suggest document updates based on usage
- Archive low-value content

---

## Risks & Mitigations

### Risk 1: Metric Emission Adds Latency
**Probability:** Low  
**Impact:** Medium  
**Mitigation:** Emit metrics asynchronously, measure overhead, optimize if > 10ms

### Risk 2: Alarm Fatigue (False Positives)
**Probability:** Medium  
**Impact:** High  
**Mitigation:** Conservative thresholds, 1-week tuning period, SNS filtering

### Risk 3: Analytics Processor Fails
**Probability:** Low  
**Impact:** Low  
**Mitigation:** Graceful degradation, manual fallback, CloudWatch alarm on Lambda errors

### Risk 4: DynamoDB Table Growth
**Probability:** Medium  
**Impact:** Low  
**Mitigation:** 90-day TTL, monitor table size, archive to S3 if needed

### Risk 5: Dashboard Overload (Too Much Data)
**Probability:** Low  
**Impact:** Low  
**Mitigation:** Focus on actionable metrics, hide advanced metrics by default

---

## Deliverables Summary

### Code
- [ ] `src/langgraph/action_groups/knowledge_retrieval.py` (updated)
- [ ] `infra/constructs/knowledge-base-dashboard.ts` (new)
- [ ] `infra/constructs/knowledge-base-alarms.ts` (new)
- [ ] `infra/constructs/knowledge-retrieval-metrics-table.ts` (new)
- [ ] `src/knowledge/analytics-processor.py` (new)

### Infrastructure
- [ ] CloudWatch dashboard: `opx-knowledge-base-dashboard`
- [ ] CloudWatch alarms: 4 alarms
- [ ] SNS topic: `opx-knowledge-base-alerts`
- [ ] DynamoDB table: `opx-knowledge-retrieval-metrics`
- [ ] Lambda: `opx-knowledge-analytics-processor`
- [ ] EventBridge schedule: daily at 00:00 UTC

### Documentation
- [ ] `PHASE_7.5_IMPLEMENTATION_COMPLETE.md`
- [ ] `docs/phase-7/PHASE_7.5_MONITORING.md`
- [ ] CloudWatch Logs Insights query library
- [ ] Runbook: "Responding to Knowledge Base Alarms"

### Tests
- [ ] Unit tests for metric emission
- [ ] Unit tests for citation validation
- [ ] Unit tests for analytics processor
- [ ] Integration test for end-to-end monitoring

---

## Approval Checklist

### Design Review
- [ ] Architecture reviewed by Principal Architect
- [ ] Metrics specification approved
- [ ] Alarm thresholds validated
- [ ] Cost estimate approved (~$3.45/month additional)

### Security Review
- [ ] No PII in logs (query text sanitized)
- [ ] IAM permissions follow least privilege
- [ ] SNS topic access controlled
- [ ] DynamoDB encryption at rest

### Operational Review
- [ ] Dashboard meets operator needs
- [ ] Alarms are actionable
- [ ] Knowledge gap workflow defined
- [ ] Runbook for alarm response

---

## Approval Questions — ANSWERED

All questions have been definitively answered by the Principal Architect:

1. **Metric Granularity:** ✅ Current metrics are sufficient (no per-document metrics at CloudWatch level)

2. **Alarm Thresholds:** ✅ Approved as-is (with TreatMissingData = notBreaching added)

3. **Analytics Frequency:** ✅ Daily is correct (no hourly or real-time)

4. **Citation Tracking:** ⚠️ Deferred to Phase 8 (governance/trust concern)

5. **Cost:** ✅ Approved (~$3.45/month additional)

6. **Scope:** ❌ Query caching and A/B testing explicitly deferred to Phase 8.5+

**All decisions are binding and locked for implementation.**

---

## Recommendation

**✅ APPROVED - Proceed with Phase 7.5 implementation** with the following locked scope:

1. **Must-Have (Tasks 1-3):**
   - Metrics emission (non-blocking, low cardinality)
   - Dashboard (with approved widgets)
   - Alarms (with TreatMissingData = notBreaching)

2. **Must-Have (Task 4):**
   - Query analytics and knowledge gaps (DynamoDB table as analytics exhaust only)

3. **Deferred to Phase 8 (Task 5):**
   - Citation accuracy tracking (governance/trust concern)

**Estimated Timeline:** 2-3 days for Tasks 1-4.

**Completion Artifact:** `PHASE_7.5_IMPLEMENTATION_COMPLETE.md` containing:
- Metrics list (final)
- Alarm ARNs
- Dashboard URL
- Sample analytics output
- Confirmation of constraints respected

---

**Status:** ✅ APPROVED WITH CONDITIONS  
**Prepared by:** Kiro AI Assistant  
**Approved by:** Principal Architect  
**Approval Date:** January 29, 2026  
**Next Step:** Proceed with implementation (Tasks 1-4 only)

