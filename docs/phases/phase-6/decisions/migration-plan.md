# Phase 6: Migration Execution Plan

**Date:** January 25, 2026  
**Status:** 🎯 READY TO EXECUTE  
**Duration:** 5 weeks

---

## Overview

This document provides the step-by-step execution plan for migrating from Lambda-based agents to Bedrock + LangGraph architecture.

---

## Pre-Migration Checklist

- [x] Architectural correction acknowledged
- [x] PLAN.md updated
- [x] ARCHITECTURE.md updated
- [x] PHASE_6_REFACTOR_DESIGN.md created
- [ ] Team alignment on timeline
- [ ] AWS Bedrock access confirmed
- [ ] Budget approved ($500/month for LLM costs)

---

## Week 1: Preserve Logic

### Day 1-2: Audit Existing Code

**Tasks:**
1. Read all existing Lambda agent files
2. Document prompts used
3. Document reasoning patterns
4. Document validation logic
5. Document confidence scoring

**Commands:**
```bash
# Create prompts directory
mkdir -p prompts

# Extract prompts from existing agents
# (Manual extraction required)
```

**Files to Audit:**
- `src/agents/signal-analysis-agent-v2.ts`
- `src/agents/historical-incident-agent-v2.ts`
- `src/agents/change-intelligence-agent-v2.ts`
- `src/agents/risk-blast-radius-agent.ts`
- `src/agents/knowledge-recommendation-agent.ts`
- `src/agents/response-strategy-agent.ts`

### Day 3-4: Extract Prompts

**Tasks:**
1. Create prompt files for each agent
2. Document prompt engineering patterns
3. Save system prompts
4. Save user prompt templates

**Deliverables:**
- `prompts/signal-intelligence.txt`
- `prompts/historical-pattern.txt`
- `prompts/change-intelligence.txt`
- `prompts/risk-blast-radius.txt`
- `prompts/knowledge-rag.txt`
- `prompts/response-strategy.txt`
- `prompts/consensus.txt`
- `prompts/cost-guardian.txt`
- `prompts/reliability-auditor.txt`

### Day 5: Document Contracts

**Tasks:**
1. Document input schemas
2. Document output schemas
3. Document confidence scoring logic
4. Create agent contracts document

**Deliverables:**
- `docs/AGENT_CONTRACTS.md`

---

## Week 2: Build LangGraph

### Day 1: Python Project Setup

**Tasks:**
1. Create Python project structure
2. Set up virtual environment
3. Install dependencies
4. Configure linting and testing

**Commands:**
```bash
# Create LangGraph directory
mkdir -p src/langgraph

# Create Python virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install langgraph langchain-aws boto3 pydantic tenacity pytest

# Create requirements.txt
pip freeze > src/langgraph/requirements.txt
```

**Files to Create:**
- `src/langgraph/requirements.txt`
- `src/langgraph/pyproject.toml`
- `src/langgraph/.python-version`

### Day 2-3: Implement State Schema

**Tasks:**
1. Define `LangGraphState` TypedDict
2. Implement state validation
3. Add state transition logic
4. Write unit tests

**Files to Create:**
- `src/langgraph/state.py`
- `src/langgraph/test_state.py`

### Day 4-5: Build Graph

**Tasks:**
1. Define graph structure
2. Implement node functions
3. Add conditional routing
4. Implement retry logic
5. Add timeout handling
6. Write integration tests

**Files to Create:**
- `src/langgraph/graph.py`
- `src/langgraph/nodes.py`
- `src/langgraph/retry.py`
- `src/langgraph/test_graph.py`

---

## Week 3: Deploy Bedrock Agents

### Day 1-2: Create Action Group Functions

**Tasks:**
1. Implement `query-signals` action
2. Implement `query-incidents` action
3. Implement `search-resolutions` action
4. Implement `query-changes` action
5. Implement `query-topology` action
6. Implement `search-runbooks` action
7. Implement `rank-actions` action
8. Implement `track-cost` action

**Commands:**
```bash
# Create action groups directory
mkdir -p src/agents/actions

# Create test directory
mkdir -p test/agents/actions
```

**Files to Create:**
- `src/agents/actions/query-signals.ts`
- `src/agents/actions/query-incidents.ts`
- `src/agents/actions/search-resolutions.ts`
- `src/agents/actions/query-changes.ts`
- `src/agents/actions/query-topology.ts`
- `src/agents/actions/search-runbooks.ts`
- `src/agents/actions/rank-actions.ts`
- `src/agents/actions/track-cost.ts`

### Day 3-4: Define API Schemas

**Tasks:**
1. Create OpenAPI specs for each action group
2. Validate schemas
3. Document parameters

**Commands:**
```bash
# Create schemas directory
mkdir -p schemas/action-groups
```

**Files to Create:**
- `schemas/action-groups/query-signals.json`
- `schemas/action-groups/query-incidents.json`
- `schemas/action-groups/search-resolutions.json`
- `schemas/action-groups/query-changes.json`
- `schemas/action-groups/query-topology.json`
- `schemas/action-groups/search-runbooks.json`
- `schemas/action-groups/rank-actions.json`
- `schemas/action-groups/track-cost.json`

### Day 5: Create Bedrock Agent CDK Constructs

**Tasks:**
1. Create `BedrockAgents` construct
2. Create `AgentActionGroups` construct
3. Define IAM roles
4. Configure agent aliases

**Files to Create:**
- `infra/constructs/bedrock-agents.ts`
- `infra/constructs/agent-action-groups.ts`
- `infra/constructs/agent-iam-roles-v2.ts`

---

## Week 4: Integration

### Day 1-2: Wire LangGraph to Bedrock

**Tasks:**
1. Implement `invoke_bedrock_agent()` in Python
2. Add error handling
3. Add cost tracking
4. Add timeout handling
5. Write integration tests

**Files to Create:**
- `src/langgraph/agents.py`
- `src/langgraph/test_agents.py`

### Day 3: Deploy Infrastructure

**Tasks:**
1. Deploy Bedrock Agents (CDK)
2. Deploy LangGraph orchestrator (CDK)
3. Deploy action groups (CDK)
4. Deploy state table (CDK)

**Commands:**
```bash
# Synthesize CDK
npm run cdk synth

# Deploy Bedrock Agents
npm run cdk deploy --exclusively OPXControlPlaneStack/BedrockAgents

# Deploy LangGraph Orchestrator
npm run cdk deploy --exclusively OPXControlPlaneStack/LangGraphOrchestrator

# Deploy full stack
npm run cdk deploy
```

### Day 4: Add Observability

**Tasks:**
1. Update CloudWatch dashboard
2. Add X-Ray tracing
3. Add cost tracking metrics
4. Add quality metrics
5. Configure alarms

**Files to Update:**
- `infra/constructs/agent-dashboard.ts`
- `infra/constructs/agent-alerts.ts`

### Day 5: Test End-to-End

**Tasks:**
1. Run integration tests
2. Test replay determinism
3. Test budget enforcement
4. Test consensus logic
5. Test failure scenarios

**Commands:**
```bash
# Run Python tests
cd src/langgraph
pytest

# Run TypeScript tests
npm test -- test/agents/

# Run integration tests
npm test -- test/integration/langgraph.integration.test.ts
```

---

## Week 5: Cleanup

### Day 1-2: Remove Old Infrastructure

**Tasks:**
1. Identify Lambda agent resources
2. Remove from CDK stack
3. Delete old constructs
4. Update stack outputs

**Files to Delete:**
- `infra/constructs/agent-orchestration.ts` (old)
- Lambda agent function definitions in stack

**Commands:**
```bash
# Archive old code
mkdir -p archive/phase-6-lambda-agents
git mv src/agents/*-agent-v2.ts archive/phase-6-lambda-agents/
git mv infra/constructs/agent-orchestration.ts archive/phase-6-lambda-agents/

# Deploy updated stack (removes old resources)
npm run cdk deploy
```

### Day 3: Update Documentation

**Tasks:**
1. Update README.md
2. Create PHASE_6_COMPLETE.md
3. Update API documentation
4. Create architecture diagrams

**Files to Update:**
- `README.md`
- `docs/API.md`

**Files to Create:**
- `PHASE_6_COMPLETE.md`
- `docs/LANGGRAPH_ARCHITECTURE.md`

### Day 4: Verify Tests

**Tasks:**
1. Run all tests
2. Verify no references to old Lambda agents
3. Verify replay tests passing
4. Verify observability working

**Commands:**
```bash
# Run all tests
npm test

# Check for old references
grep -r "agent-orchestration" src/ infra/
grep -r "Lambda.*agent" src/ infra/

# Verify deployment
aws lambda list-functions | grep opx-agent
aws bedrock-agent list-agents
```

### Day 5: Final Review

**Tasks:**
1. Code review
2. Documentation review
3. Architecture review
4. Sign-off

---

## Rollback Plan

If migration fails, rollback steps:

1. **Revert CDK changes**
   ```bash
   git revert <commit-hash>
   npm run cdk deploy
   ```

2. **Restore Lambda agents**
   ```bash
   git checkout HEAD~1 -- infra/constructs/agent-orchestration.ts
   git checkout HEAD~1 -- src/agents/
   npm run cdk deploy
   ```

3. **Document issues**
   - Capture error logs
   - Document failure points
   - Create post-mortem

---

## Success Metrics

### Technical Metrics
- [ ] 8+ Bedrock Agents deployed
- [ ] LangGraph orchestrator operational
- [ ] Agent-to-agent reasoning working
- [ ] Retry logic tested (3 attempts per agent)
- [ ] Replay determinism verified
- [ ] Cost tracking operational
- [ ] Observability dashboard live
- [ ] All tests passing (100%)

### Performance Metrics
- [ ] End-to-end latency < 60s (P95)
- [ ] Agent success rate > 95%
- [ ] Budget adherence > 99%
- [ ] Consensus confidence > 0.7 (average)

### Quality Metrics
- [ ] Code coverage > 80%
- [ ] Documentation complete
- [ ] No Lambda agent references
- [ ] Architecture diagram updated

---

## Communication Plan

### Weekly Updates
- **Monday:** Week kickoff, goals review
- **Wednesday:** Mid-week checkpoint
- **Friday:** Week wrap-up, demo

### Stakeholders
- Principal Architect (owner)
- Development Team
- SRE Team
- Product Owner

### Escalation Path
1. Technical issues → Principal Architect
2. Timeline issues → Product Owner
3. Budget issues → Finance

---

## Budget

| Item | Cost | Notes |
|------|------|-------|
| Bedrock LLM costs | $300/month | Claude 3 Sonnet |
| Bedrock Agent costs | $50/month | Agent invocations |
| Lambda costs | $20/month | Action groups |
| DynamoDB costs | $30/month | State table |
| **Total** | **$400/month** | Ongoing |

One-time costs:
- Development time: 5 weeks
- Testing infrastructure: $100

---

## Next Steps

1. **Immediate (Today):**
   - [ ] Get team alignment
   - [ ] Confirm AWS Bedrock access
   - [ ] Approve budget

2. **Week 1 Start (Monday):**
   - [ ] Begin code audit
   - [ ] Extract prompts
   - [ ] Document contracts

3. **Weekly Checkpoints:**
   - [ ] Week 1: Logic preserved
   - [ ] Week 2: LangGraph built
   - [ ] Week 3: Bedrock Agents deployed
   - [ ] Week 4: Integration complete
   - [ ] Week 5: Cleanup done

---

**Status:** 🎯 READY TO EXECUTE  
**Start Date:** January 27, 2026 (Monday)  
**Target Completion:** February 28, 2026  
**Owner:** Principal Architect & Technical Owner
