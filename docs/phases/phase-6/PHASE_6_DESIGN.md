# Phase 6: Bedrock + LangGraph Multi-Agent System

**Status:** ✅ COMPLETE  
**Completion Date:** 2026-01-26  
**Version:** 1.0.0

---

## Overview

Phase 6 implements a production-grade Bedrock multi-agent system with LangGraph orchestration, demonstrating enterprise-level agent-to-agent reasoning, consensus building, and deterministic replay.

## Architecture

### Bedrock Agents (6 Total)

1. **Signal Intelligence Agent**
   - Analyzes signal patterns
   - Identifies anomalies
   - Correlates related signals

2. **Historical Pattern Agent**
   - Searches historical incidents
   - Identifies similar patterns
   - Provides precedent analysis

3. **Change Intelligence Agent**
   - Analyzes recent changes
   - Correlates changes with incidents
   - Identifies deployment risks

4. **Risk & Blast Radius Agent**
   - Assesses incident impact
   - Estimates blast radius
   - Identifies affected services

5. **Knowledge RAG Agent**
   - Retrieves runbooks
   - Searches postmortems
   - Provides citations

6. **Response Strategy Agent**
   - Recommends mitigation steps
   - Prioritizes actions
   - Builds consensus

### LangGraph Orchestration

**Executor Lambda:** `phase6-executor-lambda`

**DAG Structure:**
```
Start → Parallel Agent Execution → Consensus → Response Strategy → End
```

**Features:**
- Stateful orchestration
- DynamoDB checkpointing
- Deterministic replay
- Retry/fallback logic
- Cost tracking per agent

### Action Groups (9 Total)

**Read-Only AWS SDK Calls:**
1. CloudWatch metrics
2. CloudWatch logs
3. DynamoDB queries
4. S3 object retrieval
5. Lambda function info
6. EC2 instance status
7. RDS database status
8. EventBridge rules
9. Knowledge base retrieval

**Security:** IAM-only, no write permissions

## Implementation

### Agent Configuration

**Model:** Claude 3.5 Sonnet v2  
**Temperature:** 0.0 (deterministic)  
**Max Tokens:** 4096  
**Guardrails:** Enabled (PII, content filtering)

### LangGraph State

**Checkpointing:**
- DynamoDB table: `opx-langgraph-checkpoints`
- Thread-based isolation
- Replay capability
- Resume from failure

**State Schema:**
- Agent outputs
- Consensus scores
- Execution metadata
- Cost tracking

### Consensus Building

**Process:**
1. Each agent provides analysis + confidence
2. Consensus node aggregates scores
3. Weighted combination
4. Conflict resolution
5. Final recommendation

**Confidence Normalization:**
- Agent-specific calibration
- Historical accuracy weighting
- Uncertainty quantification

## Design Principles

1. **Deterministic** - Same input → same output
2. **Replayable** - Checkpointed state enables replay
3. **Fail-safe** - Graceful degradation
4. **Cost-aware** - Token tracking per agent
5. **Auditable** - Complete execution trace

## Validation

**Test Coverage:** 16 tests passing

**Key Tests:**
- Integration tests (end-to-end)
- Replay tests (determinism)
- Resume tests (failure recovery)
- Determinism tests (idempotency)

## Deployment

**Stack:** OpxPhase6Stack

**Resources:**
- 6 Bedrock Agents
- 9 Action Group Lambdas
- 1 LangGraph Executor Lambda
- 1 DynamoDB checkpoint table
- CloudWatch dashboards
- CloudWatch alarms

## Cost Analysis

**Per Invocation:**
- 6 agents × ~2000 tokens = ~12,000 tokens
- Cost: ~$0.03 per incident analysis
- Monthly (100 incidents): ~$3

**Fixed Costs:**
- Lambda executions: ~$5/month
- DynamoDB: ~$2/month

## References

- Week 4 completion: `PHASE_6_WEEK_4_COMPLETE.md` (consolidated)
- Agent contracts: `AGENT_CONTRACTS.md`
- Agent guardrails: `AGENT_GUARDRAILS.md`
- Integration tests
- Replay tests

---

**Last Updated:** 2026-01-29  
**Status:** Production-ready, no changes planned
