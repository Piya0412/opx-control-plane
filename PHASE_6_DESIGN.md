# Phase 6: AI Decision Intelligence Layer — DESIGN

**Status:** 📋 DESIGN PHASE - AWAITING APPROVAL  
**Dependencies:** Phase 3 (Incident Construction) ✅, Phase 4 (Learning) 🔲, Phase 5 (Automation) 🔲  
**Estimated Effort:** 4-6 weeks  
**Risk Level:** MEDIUM (AI integration, but advisory only)

---

## Executive Summary

Phase 6 introduces AI-powered decision intelligence to provide deep investigation and recommendations **without any execution authority**. This is where agents are implemented, but they remain strictly advisory.

**Key Principle:** Intelligence advises. Control decides. Humans approve.

---

## Objectives

### Primary
1. Provide deep incident investigation using AI agents
2. Generate structured recommendations for human review
3. Correlate signals, metrics, logs, and traces intelligently
4. Search historical incidents and knowledge base
5. Estimate blast radius and risk

### Secondary
1. Reduce mean time to understand (MTTU)
2. Improve recommendation quality over time
3. Build institutional memory through RAG
4. Enable parallel investigation workflows

### Non-Objectives
- ❌ Execute any actions
- ❌ Make decisions
- ❌ Approve incidents
- ❌ Mutate authoritative state
- ❌ Operate without human oversight

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CONTROL PLANE (Phase 1-3)                │
│              Deterministic, Authoritative, No AI            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Read-Only Access
                         ↓
┌─────────────────────────────────────────────────────────────┐
│              AI DECISION INTELLIGENCE LAYER                 │
│                    (Phase 6 - Advisory Only)                │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Agent Orchestrator (LangGraph)               │  │
│  │  • Parallel agent execution                          │  │
│  │  • Timeout enforcement                               │  │
│  │  • Result aggregation                                │  │
│  │  • Structured output validation                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │                                   │
│         ┌───────────────┼───────────────┐                   │
│         ↓               ↓               ↓                   │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ Signal   │    │Historical│    │  Change  │              │
│  │ Analysis │    │ Incident │    │Intelligence│             │
│  │  Agent   │    │  Agent   │    │  Agent   │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│         ↓               ↓               ↓                   │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │   Risk   │    │Knowledge │    │Execution │              │
│  │  & Blast │    │   (RAG)  │    │ Proposal │              │
│  │  Radius  │    │  Agent   │    │  Agent   │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│                                                             │
│  All agents: Read-only, Time-bounded, Structured output    │
└─────────────────────────────────────────────────────────────┘
                         │
                         │ Recommendations Only
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                    HUMAN OPERATOR                           │
│              Reviews, Approves, Executes                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Agent Specifications

### 1. Signal Analysis Agent

**Purpose:** Correlate metrics, logs, and traces to identify root cause

**Inputs:**
- Incident ID
- Evidence bundle
- Signal IDs
- Time window

**Capabilities:**
- Query CloudWatch metrics
- Search CloudWatch Logs
- Analyze X-Ray traces
- Identify anomalies
- Correlate across services

**Output Schema:**
```typescript
{
  agentId: "signal-analysis",
  incidentId: string,
  analysis: {
    rootCauseHypothesis: string,
    confidence: number, // 0-1
    supportingSignals: string[],
    anomalies: Array<{
      metric: string,
      baseline: number,
      observed: number,
      deviation: number
    }>,
    correlations: Array<{
      signal1: string,
      signal2: string,
      correlation: number,
      interpretation: string
    }>
  },
  reasoning: string[],
  executedAt: string,
  durationMs: number
}
```

**Constraints:**
- Max execution time: 30 seconds
- Read-only CloudWatch access
- No metric writes
- No alarm modifications

---

### 2. Historical Incident Agent

**Purpose:** Find similar past incidents and their resolutions

**Inputs:**
- Incident classification
- Service name
- Severity
- Signal patterns

**Capabilities:**
- Vector similarity search
- Incident pattern matching
- Resolution strategy lookup
- Time-to-resolution estimation

**Output Schema:**
```typescript
{
  agentId: "historical-incident",
  incidentId: string,
  similarIncidents: Array<{
    incidentId: string,
    similarity: number, // 0-1
    service: string,
    severity: string,
    resolution: {
      type: string,
      summary: string,
      timeToResolve: number, // minutes
      resolvedBy: string
    },
    relevantActions: string[]
  }>,
  patterns: Array<{
    pattern: string,
    frequency: number,
    successRate: number
  }>,
  recommendations: string[],
  executedAt: string,
  durationMs: number
}
```

**Constraints:**
- Max execution time: 20 seconds
- Read-only incident store access
- No incident mutations
- Minimum similarity threshold: 0.7

---

### 3. Change Intelligence Agent

**Purpose:** Correlate incident with recent deployments and configuration changes

**Inputs:**
- Incident time window
- Affected services
- Evidence signals

**Capabilities:**
- Query deployment history
- Analyze configuration changes
- Identify recent releases
- Correlate change timing with incident

**Output Schema:**
```typescript
{
  agentId: "change-intelligence",
  incidentId: string,
  recentChanges: Array<{
    changeId: string,
    type: "DEPLOYMENT" | "CONFIG" | "INFRASTRUCTURE",
    service: string,
    timestamp: string,
    timeDelta: number, // minutes before incident
    suspicionScore: number, // 0-1
    details: {
      version?: string,
      configKey?: string,
      oldValue?: string,
      newValue?: string
    }
  }>,
  correlationAnalysis: {
    likelyTrigger: boolean,
    confidence: number,
    reasoning: string
  },
  rollbackRecommendation: {
    recommended: boolean,
    targetVersion?: string,
    risk: "LOW" | "MEDIUM" | "HIGH"
  },
  executedAt: string,
  durationMs: number
}
```

**Constraints:**
- Max execution time: 25 seconds
- Read-only deployment store access
- No rollback execution
- Lookback window: 24 hours

---

### 4. Risk & Blast Radius Agent

**Purpose:** Estimate incident impact and propagation risk

**Inputs:**
- Incident service
- Evidence bundle
- Service dependency graph

**Capabilities:**
- Analyze service dependencies
- Estimate affected users
- Calculate blast radius
- Predict propagation paths

**Output Schema:**
```typescript
{
  agentId: "risk-blast-radius",
  incidentId: string,
  blastRadius: {
    scope: "SINGLE_SERVICE" | "MULTI_SERVICE" | "INFRASTRUCTURE",
    affectedServices: string[],
    estimatedUsers: number,
    estimatedRequests: number,
    propagationPaths: Array<{
      from: string,
      to: string,
      probability: number,
      latency: number // minutes
    }>
  },
  riskAssessment: {
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    businessImpact: string,
    technicalImpact: string
  },
  mitigationPriority: Array<{
    action: string,
    priority: number,
    expectedImpact: string
  }>,
  executedAt: string,
  durationMs: number
}
```

**Constraints:**
- Max execution time: 20 seconds
- Read-only service graph access
- No topology modifications
- Conservative estimates (fail-safe)

---

### 5. Knowledge (RAG) Agent

**Purpose:** Search runbooks, postmortems, and documentation

**Inputs:**
- Incident classification
- Service name
- Error patterns
- Search query

**Capabilities:**
- Vector search across documents
- Semantic similarity matching
- Citation extraction
- Relevance ranking

**Output Schema:**
```typescript
{
  agentId: "knowledge-rag",
  incidentId: string,
  relevantDocuments: Array<{
    documentId: string,
    type: "RUNBOOK" | "POSTMORTEM" | "ARCHITECTURE" | "PLAYBOOK",
    title: string,
    relevanceScore: number, // 0-1
    excerpt: string,
    url: string,
    lastUpdated: string,
    citations: Array<{
      section: string,
      content: string,
      relevance: number
    }>
  }>,
  suggestedRunbooks: string[],
  relatedPostmortems: string[],
  executedAt: string,
  durationMs: number
}
```

**Constraints:**
- Max execution time: 15 seconds
- Read-only document store access
- No document modifications
- Minimum relevance score: 0.6

---

### 6. Execution Proposal Agent

**Purpose:** Generate structured action recommendations

**Inputs:**
- All other agent outputs
- Incident context
- Historical success rates

**Capabilities:**
- Synthesize agent recommendations
- Rank actions by priority
- Estimate success probability
- Generate execution plan

**Output Schema:**
```typescript
{
  agentId: "execution-proposal",
  incidentId: string,
  proposedActions: Array<{
    actionId: string,
    type: "ROLLBACK" | "SCALE" | "RESTART" | "CONFIG_CHANGE" | "MANUAL",
    priority: number, // 1-10
    description: string,
    targetService: string,
    estimatedImpact: {
      successProbability: number, // 0-1
      timeToEffect: number, // minutes
      risk: "LOW" | "MEDIUM" | "HIGH"
    },
    prerequisites: string[],
    rollbackPlan: string,
    approvalRequired: boolean
  }>,
  executionPlan: {
    steps: Array<{
      stepNumber: number,
      action: string,
      parallelizable: boolean,
      dependencies: number[]
    }>,
    estimatedDuration: number, // minutes
    criticalPath: number[]
  },
  reasoning: string,
  executedAt: string,
  durationMs: number
}
```

**Constraints:**
- Max execution time: 30 seconds
- No action execution
- All actions require human approval
- Conservative risk estimates

---

## Agent Orchestration

### LangGraph Workflow

```python
from langgraph.graph import StateGraph, END

# Define agent state
class AgentState(TypedDict):
    incident_id: str
    evidence: dict
    agent_results: dict
    final_recommendation: dict

# Create graph
workflow = StateGraph(AgentState)

# Add agent nodes
workflow.add_node("signal_analysis", signal_analysis_agent)
workflow.add_node("historical_incident", historical_incident_agent)
workflow.add_node("change_intelligence", change_intelligence_agent)
workflow.add_node("risk_blast_radius", risk_blast_radius_agent)
workflow.add_node("knowledge_rag", knowledge_rag_agent)
workflow.add_node("execution_proposal", execution_proposal_agent)

# Define parallel execution
workflow.add_edge("signal_analysis", "execution_proposal")
workflow.add_edge("historical_incident", "execution_proposal")
workflow.add_edge("change_intelligence", "execution_proposal")
workflow.add_edge("risk_blast_radius", "execution_proposal")
workflow.add_edge("knowledge_rag", "execution_proposal")

# Execution proposal is final
workflow.add_edge("execution_proposal", END)

# Set entry point
workflow.set_entry_point("signal_analysis")
workflow.set_entry_point("historical_incident")
workflow.set_entry_point("change_intelligence")
workflow.set_entry_point("risk_blast_radius")
workflow.set_entry_point("knowledge_rag")
```

### Execution Strategy

1. **Parallel Execution:** First 5 agents run in parallel
2. **Timeout Enforcement:** Each agent has max execution time
3. **Graceful Degradation:** If agent fails, continue with others
4. **Result Aggregation:** Execution proposal agent synthesizes all results
5. **Structured Output:** All results validated against schemas

---

## LLM Integration

### Provider Options

#### Option A: AWS Bedrock (Recommended)
- **Model:** Claude 3.5 Sonnet or Claude 3 Opus
- **Advantages:**
  - Native AWS integration
  - IAM-based security
  - No API keys needed
  - Regional deployment
  - Enterprise support
- **Cost:** ~$0.003 per 1K input tokens, ~$0.015 per 1K output tokens

#### Option B: Ollama (Self-Hosted)
- **Model:** Llama 3.1 70B or Mixtral 8x7B
- **Advantages:**
  - No external API calls
  - Full data control
  - No per-token costs
  - Customizable
- **Cost:** Infrastructure only (~$500/month for GPU instances)

#### Option C: OpenAI (Fallback)
- **Model:** GPT-4 Turbo
- **Advantages:**
  - High quality
  - Well-documented
  - Reliable
- **Disadvantages:**
  - External dependency
  - API key management
  - Data privacy concerns

**Recommendation:** Start with AWS Bedrock (Claude 3.5 Sonnet) for production, Ollama for development.

---

## Data Flow

### 1. Incident Trigger
```
Incident Created (Phase 3)
  ↓
Agent Orchestrator Invoked
  ↓
Incident Context Loaded (read-only)
```

### 2. Agent Execution
```
Parallel Agent Execution
  ├─ Signal Analysis Agent → CloudWatch
  ├─ Historical Incident Agent → Incident Store
  ├─ Change Intelligence Agent → Deployment Store
  ├─ Risk & Blast Radius Agent → Service Graph
  └─ Knowledge RAG Agent → Document Store
       ↓
All Results Collected (with timeouts)
       ↓
Execution Proposal Agent Synthesizes
```

### 3. Result Storage
```
Agent Results Stored
  ↓
Recommendation Record Created
  ↓
Human Notified (EventBridge)
```

### 4. Human Review
```
Human Reviews Recommendations
  ↓
Human Approves/Rejects Actions
  ↓
Approved Actions → Phase 5 (Automation)
```

---

## Infrastructure

### Lambda Functions

1. **agent-orchestrator-lambda**
   - Runtime: Python 3.12
   - Memory: 2048 MB
   - Timeout: 120 seconds
   - Triggers: EventBridge (IncidentCreated)

2. **signal-analysis-agent-lambda**
   - Runtime: Python 3.12
   - Memory: 1024 MB
   - Timeout: 30 seconds

3. **historical-incident-agent-lambda**
   - Runtime: Python 3.12
   - Memory: 512 MB
   - Timeout: 20 seconds

4. **change-intelligence-agent-lambda**
   - Runtime: Python 3.12
   - Memory: 512 MB
   - Timeout: 25 seconds

5. **risk-blast-radius-agent-lambda**
   - Runtime: Python 3.12
   - Memory: 512 MB
   - Timeout: 20 seconds

6. **knowledge-rag-agent-lambda**
   - Runtime: Python 3.12
   - Memory: 1024 MB
   - Timeout: 15 seconds

7. **execution-proposal-agent-lambda**
   - Runtime: Python 3.12
   - Memory: 1024 MB
   - Timeout: 30 seconds

### DynamoDB Tables

1. **opx-agent-recommendations**
   - PK: `INCIDENT#{incidentId}`
   - SK: `RECOMMENDATION#{recommendationId}`
   - Attributes: agentResults, proposedActions, createdAt
   - TTL: 90 days

2. **opx-agent-executions**
   - PK: `AGENT#{agentId}`
   - SK: `EXECUTION#{executionId}`
   - Attributes: incidentId, input, output, durationMs, status
   - TTL: 30 days (observability only)

### IAM Roles

1. **AgentOrchestratorRole**
   - Invoke all agent lambdas
   - Read incidents (DynamoDB)
   - Write recommendations (DynamoDB)
   - Publish events (EventBridge)

2. **AgentExecutionRole** (per agent)
   - Read-only access to data sources
   - Write to agent-executions table
   - Bedrock InvokeModel permission

---

## Security & Governance

### Read-Only Enforcement

**IAM Policy (Example):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/opx-incidents",
        "arn:aws:dynamodb:*:*:table/opx-evidence-bundles"
      ]
    },
    {
      "Effect": "Deny",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem"
      ],
      "Resource": "*"
    }
  ]
}
```

### Timeout Enforcement

- All agents have hard timeouts
- Orchestrator enforces global timeout (120s)
- Partial results returned if timeout occurs

### Output Validation

- All agent outputs validated against Zod schemas
- Invalid outputs rejected
- Validation failures logged

### Cost Controls

- Max concurrent agent executions: 10
- Per-incident agent budget: $1.00
- Monthly agent budget: $10,000
- Budget alerts at 80%

---

## Observability

### Metrics

1. **Agent Performance**
   - `agent.execution.duration` (ms)
   - `agent.execution.success_rate` (%)
   - `agent.execution.timeout_rate` (%)
   - `agent.execution.cost` ($)

2. **Recommendation Quality**
   - `recommendation.acceptance_rate` (%)
   - `recommendation.action_success_rate` (%)
   - `recommendation.time_to_review` (minutes)

3. **LLM Usage**
   - `llm.tokens.input` (count)
   - `llm.tokens.output` (count)
   - `llm.cost.per_incident` ($)
   - `llm.latency` (ms)

### Logging

- All agent inputs/outputs logged
- All LLM prompts/responses logged
- All timeouts logged
- All validation failures logged

### Tracing

- X-Ray tracing for all agent executions
- Trace ID propagated through workflow
- Parent-child relationships maintained

---

## Testing Strategy

### Unit Tests

- Agent logic (mocked LLM)
- Output validation
- Timeout handling
- Error handling

### Integration Tests

- Agent orchestration
- LLM integration (real calls)
- Data source access
- Result aggregation

### End-to-End Tests

- Full incident → recommendation flow
- Human approval workflow
- Partial failure scenarios
- Timeout scenarios

### Load Tests

- 100 concurrent incidents
- Agent throughput
- Cost per incident
- Latency percentiles

---

## Rollout Strategy

### Phase 6.1: Infrastructure & Orchestration (Week 1-2)
- Set up Lambda functions
- Configure DynamoDB tables
- Implement agent orchestrator
- Deploy LangGraph workflow

### Phase 6.2: Core Agents (Week 3-4)
- Implement Signal Analysis Agent
- Implement Historical Incident Agent
- Implement Change Intelligence Agent
- Integration tests

### Phase 6.3: Advanced Agents (Week 5)
- Implement Risk & Blast Radius Agent
- Implement Knowledge RAG Agent
- Implement Execution Proposal Agent
- End-to-end tests

### Phase 6.4: Observability & Governance (Week 6)
- CloudWatch dashboards
- Cost tracking
- Alerting
- Documentation

---

## Success Criteria

### Functional
- [ ] All 6 agents implemented and tested
- [ ] Agent orchestration working
- [ ] Recommendations generated for 100% of incidents
- [ ] Output validation passing
- [ ] Timeout enforcement working

### Performance
- [ ] Agent execution < 120 seconds (p99)
- [ ] Individual agent timeout < 30 seconds
- [ ] Cost per incident < $0.50
- [ ] Recommendation acceptance rate > 60%

### Quality
- [ ] No agent can mutate authoritative state
- [ ] All outputs structured and validated
- [ ] All executions traced and logged
- [ ] Human approval required for all actions

---

## Risks & Mitigations

### Risk 1: LLM Hallucinations
**Impact:** HIGH  
**Mitigation:**
- Structured output validation
- Human review required
- Confidence scores on all recommendations
- Explainable reasoning

### Risk 2: Cost Overruns
**Impact:** MEDIUM  
**Mitigation:**
- Per-incident budget limits
- Monthly budget alerts
- Cost tracking per agent
- Automatic throttling

### Risk 3: Agent Timeouts
**Impact:** LOW  
**Mitigation:**
- Graceful degradation
- Partial results returned
- Timeout monitoring
- Retry logic

### Risk 4: Data Privacy
**Impact:** HIGH  
**Mitigation:**
- AWS Bedrock (data not used for training)
- PII scrubbing in prompts
- Audit logging
- Regional deployment

---

## Open Questions

1. Should we implement agent result caching for similar incidents?
2. What is the minimum recommendation acceptance rate before disabling an agent?
3. Should agents have access to production metrics or only aggregated data?
4. How do we handle agent disagreements (conflicting recommendations)?
5. Should we implement agent voting/consensus mechanisms?

---

## Next Steps

1. **Review & Approval:** Review this design document
2. **Step Breakdown:** Create detailed implementation steps (PHASE_6_STEP_*.md)
3. **Prototype:** Build single-agent prototype
4. **Validation:** Test with real incidents
5. **Full Implementation:** Roll out all agents

---

**Status:** AWAITING APPROVAL  
**Estimated Start Date:** TBD  
**Estimated Completion:** 6 weeks after approval  
**Dependencies:** Phase 3 complete, Phase 4 optional, Phase 5 optional

---

**Design Authority:** This design must be approved before implementation begins.
