# Phase 8.7: Advisory Recommendation Persistence - Design Summary

**Status:** DESIGN REVIEW  
**Date:** 2026-01-31  
**Full Design:** `docs/phases/phase-8/PHASE_8.7_DESIGN.md`

---

## TL;DR

Phase 8.7 adds a **DynamoDB table to persist agent recommendations** for CLI inspection and audit, without enabling autonomous execution or modifying incident state.

---

## Key Design Decisions

### 1. What It IS
- ✅ Persistent storage of agent recommendations
- ✅ CLI-inspectable advisory outputs
- ✅ Audit trail for compliance
- ✅ Fail-open, non-blocking persistence

### 2. What It is NOT
- ❌ Autonomous execution
- ❌ Approval workflows
- ❌ Trust scoring
- ❌ UI or dashboard
- ❌ Incident state modification

---

## Architecture

### Table Schema

**Table:** `opx-agent-recommendations`

**Keys:**
- PK: `recommendationId` (rec-{incidentId}-{agentName}-{timestamp})
- GSI: `incidentId-timestamp-index`
- GSI: `agentType-timestamp-index`
- GSI: `executionId-timestamp-index`

**Attributes:**
- `incidentId`, `executionId`, `agentName`, `agentType`
- `recommendation` (Map: rootCause, actions, blastRadius)
- `confidence`, `reasoning`, `citations`
- `metadata` (cost, tokens, duration)
- `status` (`GENERATED`, `SUPERSEDED`, `ARCHIVED`)
- `approved` (Boolean, reserved for Phase 9, always `false` in Phase 8.7)
- `ttl` (90 days)

**Key Design Choice:** We use `recommendationId` as PK (not `incidentId` + `timestamp`) to:
- Enable immutable, independently-addressable records
- Support multi-dimensional queries via GSIs without hot partitions
- Allow future flexibility (proactive recommendations, what-if analysis)
- Enable replay versioning (each replay creates new records with unique IDs)

### Control Flow

```
LangGraph Executor Lambda
  ↓
Execute 6 Agents
  ↓
Build Consensus
  ↓
Persist Recommendations (NEW - fail-open)
  ↓
Return Response
```

**Key:** Executor Lambda writes recommendations, not agents.

---

## Safety Principles

### Fail-Open Design

```python
try:
    persist_recommendations(...)
except Exception as e:
    logger.warning(f"Failed to persist: {e}")
    emit_metric("RecommendationPersistenceFailure", 1)
# Execution continues regardless
```

**Why?** Recommendations are advisory, not authoritative. Agent execution must succeed even if persistence fails.

**Determinism Clarification:**
- **Functional Determinism:** Replays produce the same agent outputs (same reasoning, same recommendations)
- **Persistence Versioning:** Each replay creates new records with unique IDs and timestamps
- **Why Both?** Enables debugging (functional determinism) and comparison across replays (versioning)

### Decoupling from Incident State

| Aspect | Incidents | Recommendations |
|--------|-----------|-----------------|
| Authority | Source of truth | Advisory only |
| Lifecycle | Permanent | TTL (90 days) |
| Foreign Keys | None | Reference only |
| Failure Mode | Fail-closed | Fail-open |

**No coupling:** Deleting recommendations does NOT affect incidents.

### Approval Flag Governance (Phase 9 Protection)

The `approved` field is reserved for Phase 9 integration. **Critical rules:**

1. **Only humans or external systems may set `approved = true`** (never agents or executor)
2. **Default is `false`** (approval is opt-in)
3. **Immutable after approval** (no modifications allowed)
4. **Audit trail required** (separate approval events table)

**Phase 8.7:** Field exists but is never set to `true`. Documented for future use.

---

## CLI Inspection

### Query by Incident

```bash
aws dynamodb query \
  --table-name opx-agent-recommendations \
  --index-name incidentId-timestamp-index \
  --key-condition-expression "incidentId = :iid" \
  --expression-attribute-values '{":iid":{"S":"incident-api-gateway-123"}}' \
  --scan-index-forward false
```

### Helper Script

```bash
./scripts/view-recommendations.sh incident-api-gateway-123
```

**Output:**
```json
{
  "agent": "signal-intelligence",
  "confidence": "0.87",
  "rootCause": "Database connection pool exhaustion",
  "actions": ["Scale RDS read replicas", "Increase connection pool size"],
  "timestamp": "2026-01-31T12:00:00.000Z"
}
```

---

## Security & Governance

### IAM Permissions

- **Executor Lambda:** Write-only to recommendations table
- **Operators:** Read-only via separate IAM role
- **No blast radius increase:** Recommendations are advisory, not authoritative

### Auditability

- Complete audit trail of agent recommendations
- Queryable by incident, agent, timestamp
- Immutable records (no updates)
- TTL for automatic cleanup (90 days)

---

## Implementation Checklist

### Infrastructure (1 day)
- [ ] Create `opx-agent-recommendations` DynamoDB table
- [ ] Add 3 GSIs (incidentId, agentType, executionId)
- [ ] Enable TTL
- [ ] Update Lambda IAM role
- [ ] Add CloudWatch alarms

### Application Code (1-2 days)
- [ ] Create `recommendation_persistence.py`
- [ ] Update `graph.py` to call persistence
- [ ] Implement fail-open error handling
- [ ] Emit CloudWatch metrics

### Testing (1 day)
- [ ] Unit tests for persistence module
- [ ] Integration tests for end-to-end flow
- [ ] Failure tests (verify fail-open)

### Documentation (0.5 day)
- [ ] Create `RECOMMENDATION_INSPECTION.md`
- [ ] Create `view-recommendations.sh` script
- [ ] Update `PLAN.md`, `QUERY_REFERENCE.md`, demo walkthrough

### Deployment (0.5 day)
- [ ] Deploy CDK stack
- [ ] Run demo and verify
- [ ] Test CLI queries

**Total Effort:** 3-5 days

---

## Success Criteria

### Must Have
- [x] Recommendations persisted after agent execution
- [x] Queryable by incident ID via CLI
- [x] Includes all 7 outputs (6 agents + consensus)
- [x] TTL set to 90 days
- [x] Fail-open behavior (errors don't block)

### Should Have
- [x] GSIs for querying by agent type and execution ID
- [x] CloudWatch metrics and alarms
- [x] Helper script for human-readable output

---

## Explicit Non-Goals

Phase 8.7 will **NOT** do:

1. ❌ Autonomous execution (Phase 9)
2. ❌ Approval workflows
3. ❌ Trust scoring (Phase 8.6)
4. ❌ UI or dashboard
5. ❌ Incident state modification
6. ❌ Learning or calibration (Phase 4 handles this)
7. ❌ Cost enforcement (Phase 8.4 handles this)
8. ❌ Real-time streaming

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| DynamoDB throttling | Fail-open, alarms, batch writes |
| Persistence latency | <100ms target, async writes (future) |
| Storage cost growth | 90-day TTL, cost alarms |
| Missing recommendations | CloudWatch alarms, replay capability |
| PII leakage | Phase 8.2 guardrails already redact |

---

## Future Enhancements

### Phase 8.7.1: Async Retry (Optional)
- SQS DLQ for failed writes
- Separate Lambda for retry
- Estimated: 2-3 days

### Phase 8.7.2: Recommendation Versioning (Optional)
- Track recommendation changes over time
- Compare across executions
- Estimated: 3-5 days

### Integration with Phase 8.5-8.6 (Future)
- Add trust scores to recommendations
- Filter by trust threshold
- Estimated: 1 week

### Integration with Phase 9 (Future)
- Recommendations become execution proposals
- Approval workflow references recommendations
- Estimated: 2-3 weeks

---

## Value Proposition

### For Operators
- Inspect agent recommendations via CLI
- Understand agent reasoning
- Review recommendations post-incident

### For Compliance
- Complete audit trail of AI recommendations
- Demonstrates AI transparency
- Supports regulatory review

### For Learning
- Data for confidence calibration (Phase 4)
- Input for trust scoring (Phase 8.6, future)
- Historical analysis

---

## Next Steps

1. **Review** this design with senior engineers
2. **Approve** or request changes
3. **Implement** infrastructure and code
4. **Test** thoroughly (unit, integration, failure)
5. **Deploy** and verify with demo
6. **Document** in PLAN.md and query reference

---

**Full Design Document:** `docs/phases/phase-8/PHASE_8.7_DESIGN.md`  
**Estimated Effort:** 3-5 days  
**Dependencies:** Phase 6, 8.1-8.4 (all complete)  
**Status:** AWAITING APPROVAL

