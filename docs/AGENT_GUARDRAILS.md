# Agent & RAG Guardrails

**Purpose:** Freeze safety rules BEFORE Phase 6 implementation to make later audit enforceable.

**Status:** FROZEN - Must not be modified without architectural review  
**Effective Date:** 2026-01-24  
**Applies To:** Phase 6 (AI Advisory Agents), Phase 7 (RAG Knowledge Layer)

---

## Core Principle

**Intelligence advises. Control decides. Humans approve.**

Agents and RAG systems are advisory only. They NEVER have authority to mutate operational state.

---

## NON-NEGOTIABLE RULES

### 1. Agents Are READ-ONLY

**Rule:** Agents MUST NOT mutate any operational state.

**Prohibited Actions:**
- ❌ Create, update, or delete incidents
- ❌ Modify incident state (OPEN → ACKNOWLEDGED, etc.)
- ❌ Change promotion policies
- ❌ Mutate learning data (outcomes, summaries, calibrations, snapshots)
- ❌ Update detection rules
- ❌ Modify correlation rules
- ❌ Change confidence factors
- ❌ Execute playbooks or runbooks
- ❌ Invoke AWS APIs directly
- ❌ Write to DynamoDB tables
- ❌ Publish to EventBridge
- ❌ Send notifications (SNS, email, Slack)

**Allowed Actions:**
- ✅ Read incident data
- ✅ Read learning data
- ✅ Query DynamoDB (read-only)
- ✅ Generate recommendations (structured output)
- ✅ Analyze patterns
- ✅ Provide context
- ✅ Answer questions

**Enforcement:**
- IAM policies grant read-only permissions
- No write permissions to any DynamoDB table
- No publish permissions to EventBridge
- No invoke permissions for mutation Lambdas
- Code review required for all agent implementations

---

### 2. Agent Declaration Requirements

**Rule:** Every agent MUST declare its capabilities, data sources, permissions, and output schema.

**Required Declaration:**

```typescript
interface AgentDeclaration {
  // Identity
  agentId: string;              // Unique identifier
  agentName: string;            // Human-readable name
  version: string;              // Semantic version
  
  // Capabilities
  purpose: string;              // What this agent does
  capabilities: string[];       // List of capabilities
  
  // Data Sources
  dataSources: {
    tables: string[];           // DynamoDB tables accessed
    apis: string[];             // External APIs called
    models: string[];           // LLM models used
  };
  
  // Permissions
  permissions: {
    read: string[];             // Resources agent can read
    write: string[];            // MUST be empty array
  };
  
  // Output
  outputSchema: ZodSchema;      // Zod schema for structured output
  
  // Constraints
  maxExecutionTime: number;     // Milliseconds
  maxTokens: number;            // LLM token limit
  
  // Safety
  killSwitchEnabled: boolean;   // MUST be true
  humanApprovalRequired: boolean; // MUST be true for any action
}
```

**Enforcement:**
- Declaration file required in `src/agents/{agentId}/declaration.ts`
- Automated validation in CI/CD pipeline
- Declaration must be approved before deployment
- Any change to declaration requires re-approval

---

### 3. RAG System Requirements

**Rule:** RAG systems MUST be append-only, versioned, and snapshot-backed.

**Append-Only:**
- ✅ New documents can be added
- ❌ Existing documents cannot be modified
- ❌ Documents cannot be deleted (soft delete only)
- ✅ Document versions are immutable

**Versioned:**
- Every document has a version number
- Version increments on any change
- Previous versions are retained
- Queries can target specific versions

**Snapshot-Backed:**
- RAG index is built from learning snapshots
- Snapshots are immutable
- Index rebuilds use snapshot data
- No live data mutation during RAG operations

**Schema:**

```typescript
interface RAGDocument {
  documentId: string;           // Deterministic ID
  version: number;              // Version number
  content: string;              // Document content
  metadata: {
    source: string;             // Source (snapshot, manual, etc.)
    createdAt: string;          // ISO-8601 timestamp
    createdBy: Authority;       // Who created it
    snapshotId?: string;        // Source snapshot (if applicable)
  };
  embedding: number[];          // Vector embedding
  deletedAt?: string;           // Soft delete timestamp
}
```

**Enforcement:**
- RAG store uses append-only DynamoDB table
- No update/delete methods in RAG store
- Soft delete via `deletedAt` field
- Version conflicts rejected (optimistic locking)

---

### 4. Kill Switch Requirement

**Rule:** All agents MUST be kill-switchable with <30 second disable time.

**Implementation:**
- Global kill switch flag in DynamoDB: `opx-automation-config`
- Per-agent kill switch flag: `AGENT#{agentId}`
- Agents check kill switch before every execution
- Kill switch check is first operation (before any work)

**Kill Switch Behavior:**

```typescript
async function executeAgent(agentId: string, input: any) {
  // FIRST: Check kill switch
  if (await isKillSwitchActive(agentId)) {
    console.log(`Agent ${agentId} disabled by kill switch`);
    return {
      status: 'SKIPPED',
      reason: 'KILL_SWITCH_ACTIVE',
      timestamp: new Date().toISOString(),
    };
  }
  
  // THEN: Execute agent logic
  // ...
}
```

**Kill Switch API:**
- `POST /agents/kill-switch/disable` - Disable all agents
- `POST /agents/kill-switch/disable/{agentId}` - Disable specific agent
- `POST /agents/kill-switch/enable` - Enable all agents
- `POST /agents/kill-switch/enable/{agentId}` - Enable specific agent
- `GET /agents/kill-switch/status` - Get kill switch status

**Enforcement:**
- Kill switch check is mandatory in agent execution wrapper
- Automated tests verify kill switch behavior
- Kill switch activation is audited
- <30 second disable time verified in tests

---

### 5. No Autonomous Execution

**Rule:** Agents MUST NOT execute autonomously without human approval.

**Prohibited:**
- ❌ Scheduled agent execution without human trigger
- ❌ Event-driven agent execution without human approval
- ❌ Agent-to-agent chaining without human oversight
- ❌ Automatic action execution based on agent recommendations

**Allowed:**
- ✅ Human-triggered agent execution
- ✅ Agent provides recommendations (human decides)
- ✅ Agent analyzes data (human reviews)
- ✅ Agent answers questions (human interprets)

**Human Approval Flow:**

```
Agent generates recommendation
    ↓
Recommendation stored in DynamoDB
    ↓
Human reviews recommendation
    ↓
Human approves/rejects
    ↓
IF approved: Control plane executes action
IF rejected: No action taken
```

**Enforcement:**
- No EventBridge rules trigger agents automatically
- All agent invocations require IAM principal (human or service with human authority)
- Agent recommendations stored separately from operational state
- Approval workflow required for any action
- Audit trail for all approvals/rejections

---

### 6. Structured Output Only

**Rule:** Agents MUST return structured output (Zod-validated), not free-form text.

**Prohibited:**
- ❌ Unstructured text responses
- ❌ Markdown documents
- ❌ HTML output
- ❌ Free-form JSON without schema

**Required:**
- ✅ Zod schema for every agent output
- ✅ Schema validation before returning
- ✅ Type-safe output
- ✅ Versioned schemas

**Example:**

```typescript
// Agent output schema
const RecommendationSchema = z.object({
  recommendationId: z.string(),
  agentId: z.string(),
  timestamp: z.string().datetime(),
  recommendation: z.object({
    action: z.enum(['ESCALATE', 'INVESTIGATE', 'CLOSE', 'WAIT']),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
    evidence: z.array(z.string()),
  }),
  metadata: z.object({
    executionTime: z.number(),
    tokensUsed: z.number(),
    modelVersion: z.string(),
  }),
});

type Recommendation = z.infer<typeof RecommendationSchema>;
```

**Enforcement:**
- Schema validation in agent execution wrapper
- Invalid output rejected (fail-closed)
- Schema versioning enforced
- Breaking schema changes require approval

---

### 7. Time-Bounded Execution

**Rule:** Agents MUST complete within defined time limits.

**Limits:**
- Default: 30 seconds
- Maximum: 5 minutes
- Configurable per agent (with approval)

**Timeout Behavior:**
- Agent execution times out
- Partial results discarded
- Timeout logged and alerted
- No retry (human must re-trigger)

**Enforcement:**
- Lambda timeout enforced
- Execution time tracked in CloudWatch
- Timeout alarms configured
- Timeout rate monitored

---

### 8. Data Source Transparency

**Rule:** Agents MUST declare all data sources and provide citations.

**Required:**
- List all DynamoDB tables accessed
- List all external APIs called
- List all LLM models used
- Provide citations for all facts

**Citation Format:**

```typescript
interface Citation {
  source: string;               // Table name, API, model
  recordId?: string;            // Specific record (if applicable)
  timestamp: string;            // When data was accessed
  confidence: number;           // Confidence in citation (0-1)
}
```

**Enforcement:**
- Citations included in agent output
- Data source declaration validated
- Undeclared data sources rejected
- Citation quality monitored

---

### 9. Model Version Pinning

**Rule:** Agents MUST use pinned LLM model versions (not "latest").

**Prohibited:**
- ❌ `anthropic.claude-v2` (unpinned)
- ❌ `anthropic.claude-latest` (unpinned)
- ❌ Model version auto-upgrade

**Required:**
- ✅ `anthropic.claude-v2:1` (pinned)
- ✅ `anthropic.claude-3-sonnet-20240229-v1:0` (pinned)
- ✅ Explicit model version in agent declaration

**Enforcement:**
- Model version validation in agent declaration
- Unpinned versions rejected in CI/CD
- Model version changes require approval
- Model version tracked in audit logs

---

### 10. No Feedback Loops

**Rule:** Agents MUST NOT train on their own outputs.

**Prohibited:**
- ❌ Agent output used as training data
- ❌ Agent recommendations fed back to agent
- ❌ Agent-generated content in RAG index
- ❌ Self-reinforcing loops

**Allowed:**
- ✅ Human-validated outcomes used for learning
- ✅ Human-approved recommendations stored
- ✅ Human-curated content in RAG index

**Enforcement:**
- Learning data sources validated (human-only)
- Agent outputs tagged as synthetic
- RAG index excludes agent-generated content
- Feedback loop detection in audit

---

## Violations That Block Production Deployment

The following violations MUST be resolved before production deployment:

### CRITICAL (P0) - Blocks Deployment

1. **Agent has write permissions to operational state**
   - Impact: Could mutate incidents, policies, or learning data
   - Resolution: Remove all write permissions, enforce read-only

2. **Agent executes autonomously without human approval**
   - Impact: Uncontrolled automation, safety risk
   - Resolution: Require human approval for all actions

3. **Agent is not kill-switchable**
   - Impact: Cannot disable in emergency
   - Resolution: Implement kill switch check

4. **Agent returns unstructured output**
   - Impact: Cannot validate, audit, or enforce contracts
   - Resolution: Define Zod schema, validate output

5. **RAG system allows document mutation**
   - Impact: Audit trail broken, replay impossible
   - Resolution: Enforce append-only, use soft delete

6. **Agent uses unpinned model version**
   - Impact: Non-deterministic behavior, audit trail broken
   - Resolution: Pin model version explicitly

7. **Agent creates feedback loop**
   - Impact: Self-reinforcing errors, quality degradation
   - Resolution: Exclude agent outputs from training data

### HIGH (P1) - Requires Mitigation Plan

8. **Agent missing declaration file**
   - Impact: Capabilities unclear, audit difficult
   - Resolution: Create declaration file

9. **Agent exceeds time limits**
   - Impact: Resource exhaustion, poor UX
   - Resolution: Optimize or increase limit with approval

10. **Agent missing citations**
    - Impact: Cannot verify facts, trust degraded
    - Resolution: Add citation tracking

### MEDIUM (P2) - Must Fix Before Scale

11. **Agent declaration not versioned**
    - Impact: Change tracking difficult
    - Resolution: Add semantic versioning

12. **Agent output schema not versioned**
    - Impact: Breaking changes undetected
    - Resolution: Add schema versioning

---

## Audit Checklist

Before final system integrity audit, verify:

- [ ] All agents have declaration files
- [ ] All agents are read-only (IAM policies verified)
- [ ] All agents have kill switches
- [ ] All agents return structured output (Zod-validated)
- [ ] All agents use pinned model versions
- [ ] All agents complete within time limits
- [ ] All agents provide citations
- [ ] RAG system is append-only
- [ ] RAG system is versioned
- [ ] RAG system is snapshot-backed
- [ ] No autonomous execution without human approval
- [ ] No feedback loops detected
- [ ] All violations resolved or mitigated

---

## Enforcement Mechanisms

### Code Review
- Agent implementations require architectural review
- Declaration files reviewed for completeness
- IAM policies reviewed for read-only enforcement

### Automated Testing
- Kill switch behavior tested
- Output schema validation tested
- Time limit enforcement tested
- Read-only permissions tested

### CI/CD Pipeline
- Declaration validation
- Schema validation
- Model version pinning check
- Permission audit

### Runtime Monitoring
- Kill switch status monitored
- Execution time tracked
- Output validation logged
- Permission violations alerted

### Audit Trail
- All agent executions logged
- All approvals/rejections logged
- All kill switch activations logged
- All violations logged

---

## Revision History

| Version | Date | Changes | Approved By |
|---------|------|---------|-------------|
| 1.0 | 2026-01-24 | Initial guardrails defined | System Integrity Engineer |

---

**END OF AGENT GUARDRAILS**

These rules are FROZEN and MUST NOT be modified without architectural review and approval.

Any violation of these guardrails blocks production deployment.
