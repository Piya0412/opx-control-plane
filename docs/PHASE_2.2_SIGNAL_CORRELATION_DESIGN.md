# Phase 2.2: Signal Correlation — Design Document

**Version:** 1.0.0  
**Date:** 2026-01-17  
**Status:** 🔲 DESIGN DRAFT — AWAITING REVIEW

---

## 🎯 Phase 2.2 Mission

**Deterministically compile observations (signals) into hypotheses (candidates).**

Phase 2.2 is a **compiler**, not a decision engine. It transforms structured inputs (signals) into structured outputs (candidates) using explicit, deterministic rules.

---

## 🧠 Mental Model

```
Signals (observations)
    ↓
Correlation Rules (deterministic compiler)
    ↓
Candidates (hypotheses)
    ↓
CP-5 (candidate storage)
    ↓
CP-6 (promotion decision)
    ↓
CP-7 (incident creation)
```

**Critical Distinction:**
- Phase 2.2 asks: "Do these signals suggest an incident?"
- Phase 2.2 does NOT answer: "Should we create an incident?"

**Candidates are questions, not answers.**

---

## 🔒 Phase 2.1 Frozen Invariants (MUST NOT CHANGE)

These are locked from Phase 2.1 and cannot be modified:

1. **SignalEvent is a pure observation**
   - No correlation logic in signals
   - No decision-making in signals
   - Signals are immutable facts

2. **signalId is semantic identity, not timestamp identity**
   - Based on identity window (1-minute buckets)
   - Deterministic and replayable
   - Same alarm + same window → same signalId

3. **No TTL on opx-signals**
   - Signals kept indefinitely
   - Required for replay verification
   - Required for historical correlation

4. **EventBridge is never authoritative**
   - DynamoDB is source of truth
   - EventBridge is fan-out only
   - EventBridge failures are non-blocking

5. **Signal ingestion never creates incidents**
   - Signals → Candidates only
   - No CP-7 bypass
   - No direct incident creation

6. **Normalizers never guess or infer**
   - No defaults
   - No magic
   - No heuristics
   - Invalid input → null

---

## 🚫 Phase 2.2 Forbidden Patterns

### ❌ Direct Incident Creation
```typescript
// FORBIDDEN
if (signals.length > threshold) {
  await createIncident({ service, severity });
}

// REQUIRED
if (signals.length > threshold) {
  await createCandidate({ signals, correlationRule });
}
```

### ❌ Severity Escalation
```typescript
// FORBIDDEN
const severity = signals.some(s => s.severity === 'SEV1') 
  ? 'SEV1' 
  : 'SEV2';

// REQUIRED
const severity = signals[0].severity; // Use first signal's severity
```

### ❌ Heuristics or Scoring
```typescript
// FORBIDDEN
const confidence = calculateConfidence(signals);
if (confidence > 0.8) { createCandidate(); }

// REQUIRED
if (correlationRule.matches(signals)) { createCandidate(); }
```

### ❌ ML or Anomaly Detection
```typescript
// FORBIDDEN
const isAnomaly = await mlModel.predict(signals);

// REQUIRED
const matches = correlationRule.evaluate(signals);
```

### ❌ Signal Mutation
```typescript
// FORBIDDEN
signal.correlationId = candidateId;
await signalStore.update(signal);

// REQUIRED
// Signals are immutable - never update them
```

---

## 📦 Phase 2.2 Components

### 1. CorrelationRule Schema

**Purpose:** Explicit, deterministic rules for grouping signals into candidates

**Schema:**
```typescript
interface CorrelationRule {
  ruleId: string;              // Unique rule identifier
  ruleName: string;            // Human-readable name
  ruleVersion: string;         // Semantic version
  
  // Matching criteria
  filters: {
    source?: SignalSource[];   // Match specific sources
    signalType?: SignalType[]; // Match specific types
    service?: string[];        // Match specific services
    severity?: SignalSeverity[]; // Match specific severities
  };
  
  // Correlation window
  timeWindow: {
    duration: string;          // ISO 8601 duration (e.g., "PT5M")
    alignment: 'sliding' | 'fixed'; // Window type
  };
  
  // Grouping criteria
  groupBy: {
    service: boolean;          // Group by service
    severity: boolean;         // Group by severity
    identityWindow: boolean;   // Group by identity window
  };
  
  // Threshold
  threshold: {
    minSignals: number;        // Minimum signals to create candidate
    maxSignals?: number;       // Maximum signals per candidate
  };
  
  // Candidate generation
  candidateTemplate: {
    title: string;             // Template with variables
    description: string;       // Template with variables
    tags?: string[];           // Static tags
  };
  
  // Metadata
  createdAt: string;
  createdBy: string;
  enabled: boolean;
}
```

**Rules:**
- Rules are immutable (versioned)
- Rules are deterministic (no randomness)
- Rules are replayable (same inputs → same outputs)
- Rules are explicit (no implicit logic)

**Example Rule:**
```typescript
{
  ruleId: "rule-001",
  ruleName: "Lambda High Error Rate",
  ruleVersion: "1.0.0",
  filters: {
    source: ["CLOUDWATCH_ALARM"],
    signalType: ["ALARM_STATE_CHANGE"],
    service: ["lambda"],
    severity: ["SEV2"]
  },
  timeWindow: {
    duration: "PT5M",
    alignment: "sliding"
  },
  groupBy: {
    service: true,
    severity: true,
    identityWindow: false
  },
  threshold: {
    minSignals: 2,
    maxSignals: 10
  },
  candidateTemplate: {
    title: "Lambda service experiencing high error rate",
    description: "{{signalCount}} alarms detected for lambda service in 5-minute window",
    tags: ["auto-correlated", "lambda", "error-rate"]
  },
  createdAt: "2026-01-17T00:00:00Z",
  createdBy: "system",
  enabled: true
}
```

### 2. Correlation Engine

**Purpose:** Apply correlation rules to signals and generate candidates

**Function:** `opx-signal-correlator`

**Trigger:** EventBridge rule on `SignalIngested` events

**Algorithm:**
```
1. Receive SignalIngested event
2. Load enabled correlation rules
3. For each rule:
   a. Check if signal matches rule filters
   b. If match:
      - Query signals within time window
      - Group signals by groupBy criteria
      - Check if threshold met
      - If threshold met:
        → Generate candidate (via CP-5)
        → Mark signals as correlated (metadata only)
4. Return success
```

**Determinism Guarantees:**
- Same signals + same rules → same candidates
- Same order → same candidate IDs
- Replay produces identical results

**Failure Handling:**
- Rule evaluation error → Log error, skip rule, continue
- CP-5 error → Log error, throw (retry)
- Query error → Log error, throw (retry)

**Forbidden:**
- ❌ Creating incidents
- ❌ Calling CP-7
- ❌ Mutating signals
- ❌ Heuristics or scoring
- ❌ Severity escalation

**Allowed:**
- ✅ Reading signals
- ✅ Applying rules
- ✅ Creating candidates (via CP-5)
- ✅ Emitting events

### 3. Candidate Builder

**Purpose:** Transform correlated signals into candidate requests

**Responsibilities:**
- Apply candidate template
- Substitute variables ({{signalCount}}, {{service}}, etc.)
- Compute candidate hash (for idempotency)
- Build CP-5 request

**Template Variables:**
- `{{signalCount}}` — Number of correlated signals
- `{{service}}` — Service name
- `{{severity}}` — Severity level
- `{{timeWindow}}` — Time window duration
- `{{firstObservedAt}}` — Earliest signal timestamp
- `{{lastObservedAt}}` — Latest signal timestamp

**Candidate Hash:**
```typescript
candidateHash = SHA256({
  ruleId,
  ruleVersion,
  signalIds: signals.map(s => s.signalId).sort(),
  groupKey: { service, severity, identityWindow }
})
```

**Idempotency:**
- Same signals + same rule → same candidate hash
- Duplicate candidate requests are no-ops (CP-5 handles this)

### 4. Correlation State Store

**Purpose:** Track which signals have been correlated

**DynamoDB Table:** `opx-correlation-state`

**Schema:**
```typescript
{
  pk: string;              // "CORRELATION#<ruleId>#<groupKey>"
  sk: string;              // "WINDOW#<windowStart>"
  
  ruleId: string;
  ruleVersion: string;
  groupKey: {
    service?: string;
    severity?: string;
    identityWindow?: string;
  };
  
  windowStart: string;     // ISO 8601
  windowEnd: string;       // ISO 8601
  
  signalIds: string[];     // Correlated signal IDs
  candidateId?: string;    // Generated candidate ID (if threshold met)
  
  status: 'pending' | 'candidate_created' | 'expired';
  
  createdAt: string;
  updatedAt: string;
  ttl: number;             // 7 days (correlation state is ephemeral)
}
```

**Rules:**
- Correlation state is ephemeral (7-day TTL)
- Signals are permanent (no TTL)
- State is for deduplication only, not source of truth

**Why TTL is OK here:**
- Correlation state is derived data (can be recomputed)
- Signals are source of truth (permanent)
- Old correlation state is not needed for replay

### 5. Correlation Rule Store

**Purpose:** Manage correlation rules

**DynamoDB Table:** `opx-correlation-rules`

**Schema:**
```typescript
{
  pk: string;              // "RULE#<ruleId>"
  sk: string;              // "VERSION#<ruleVersion>"
  
  ...CorrelationRule fields...
  
  ttl?: number;            // Optional TTL for disabled rules
}
```

**Operations:**
- `createRule()` — Create new rule
- `updateRule()` — Create new version (immutable)
- `enableRule()` — Enable rule
- `disableRule()` — Disable rule
- `listRules()` — List all enabled rules

**Versioning:**
- Rules are immutable
- Updates create new versions
- Old versions retained for replay

---

## 🔄 Data Flow

### Signal → Candidate Flow

```
1. CloudWatch Alarm
   ↓
2. SNS → Signal Ingestor (Phase 2.1)
   ↓
3. SignalEvent stored in opx-signals
   ↓
4. EventBridge: SignalIngested event
   ↓
5. Signal Correlator (Phase 2.2)
   ↓
6. Load correlation rules
   ↓
7. Match signal against rules
   ↓
8. Query signals in time window
   ↓
9. Group signals by criteria
   ↓
10. Check threshold
    ↓
11. If threshold met:
    → Build candidate request
    → Call CP-5.createCandidate()
    → Store correlation state
    → Emit CandidateCreated event
    ↓
12. CP-6 evaluates candidate (Phase 1)
    ↓
13. If promoted:
    → CP-7 creates incident (Phase 1)
```

### Replay Flow

```
1. Select time range
   ↓
2. Query signals from opx-signals
   ↓
3. Load correlation rules (at that time)
   ↓
4. Apply rules to signals
   ↓
5. Generate candidates
   ↓
6. Compare with actual candidates created
   ↓
7. Verify determinism
```

---

## 🧪 Testing Strategy

### Unit Tests

**Correlation Rule Matching:**
- Rule filters match correct signals
- Rule filters reject incorrect signals
- Time window calculations
- Grouping logic

**Candidate Builder:**
- Template variable substitution
- Candidate hash computation
- Idempotency verification

**Correlation State:**
- State creation
- State updates
- TTL handling

### Integration Tests

**Signal → Candidate Flow:**
- Single signal (below threshold)
- Multiple signals (above threshold)
- Signals across multiple windows
- Signals for multiple services

**Rule Evaluation:**
- Multiple rules match same signal
- No rules match signal
- Disabled rules ignored

**Idempotency:**
- Duplicate signals → same candidate
- Replay → same candidates

### Replay Tests

**Determinism Verification:**
- Same signals + same rules → same candidates
- Same order → same candidate IDs
- Replay produces identical results

---

## 🔒 Invariants

### INV-P2.2.1: Deterministic Correlation
Correlation must be deterministic:
- Same signals + same rules → same candidates
- Same order → same candidate IDs
- No randomness, no heuristics, no ML

### INV-P2.2.2: Read-Only Signals
Phase 2.2 may read signals but never:
- Update signals
- Delete signals
- Add correlation metadata to signals

### INV-P2.2.3: Candidate-Only Creation
Phase 2.2 may create candidates but never:
- Create incidents
- Call CP-7 directly
- Bypass CP-6

### INV-P2.2.4: Explicit Rules
Correlation rules must be:
- Explicit (no implicit logic)
- Versioned (immutable)
- Auditable (who, when, why)
- Replayable (deterministic)

### INV-P2.2.5: Failure Isolation
Correlation failures must not affect:
- Signal ingestion (Phase 2.1)
- Incident management (Phase 1)
- Other correlation rules

---

## 🚫 Anti-Patterns to Avoid

### 1. Implicit Correlation Logic
```typescript
// FORBIDDEN
if (signals.length > 3 && signals[0].severity === 'SEV1') {
  // Magic threshold
}

// REQUIRED
if (rule.threshold.minSignals <= signals.length) {
  // Explicit rule
}
```

### 2. Severity Escalation
```typescript
// FORBIDDEN
const severity = escalateSeverity(signals);

// REQUIRED
const severity = signals[0].severity; // Use first signal
```

### 3. Confidence Scoring
```typescript
// FORBIDDEN
const confidence = calculateConfidence(signals);
if (confidence > 0.8) { createCandidate(); }

// REQUIRED
if (rule.threshold.minSignals <= signals.length) {
  createCandidate(); // No confidence, just threshold
}
```

### 4. Signal Mutation
```typescript
// FORBIDDEN
signal.correlationId = candidateId;
await signalStore.update(signal);

// REQUIRED
// Signals are immutable - store correlation state separately
await correlationStateStore.create({
  signalIds: [signal.signalId],
  candidateId
});
```

---

## 📊 Deliverables

### Code

- [ ] `src/correlation/correlation-rule.schema.ts` — Rule schema
- [ ] `src/correlation/correlation-engine.ts` — Rule evaluation
- [ ] `src/correlation/candidate-builder.ts` — Candidate generation
- [ ] `src/correlation/correlation-state-store.ts` — State management
- [ ] `src/correlation/correlation-rule-store.ts` — Rule management
- [ ] `src/correlation/signal-correlator.ts` — Lambda handler

### Infrastructure

- [ ] DynamoDB table: `opx-correlation-state` (7-day TTL)
- [ ] DynamoDB table: `opx-correlation-rules`
- [ ] Lambda: `opx-signal-correlator`
- [ ] EventBridge rule: `SignalIngested` → `opx-signal-correlator`

### Tests

- [ ] Unit tests: Rule matching
- [ ] Unit tests: Candidate builder
- [ ] Unit tests: Correlation state
- [ ] Integration tests: Signal → Candidate flow
- [ ] Integration tests: Rule evaluation
- [ ] Replay tests: Determinism verification

### Documentation

- [ ] Correlation rule guide
- [ ] Candidate generation guide
- [ ] Replay verification guide
- [ ] Runbook: Correlation failures

---

## ✅ Exit Criteria

Phase 2.2 is complete when:

- [ ] Correlation rules schema defined
- [ ] Correlation engine implemented
- [ ] Candidate builder implemented
- [ ] Correlation state store implemented
- [ ] Signal correlator Lambda implemented
- [ ] Infrastructure deployed
- [ ] All tests passing
- [ ] Determinism verified (replay tests)
- [ ] No direct incident creation (verified)
- [ ] No signal mutation (verified)
- [ ] No heuristics or ML (verified)
- [ ] Failure isolation verified

---

## 🚨 Critical Questions for Review

### 1. Correlation Rule Schema
- Is the rule schema explicit enough?
- Are there any implicit behaviors?
- Is versioning sufficient?

### 2. Determinism
- Is correlation truly deterministic?
- Can replay produce identical results?
- Are there any sources of non-determinism?

### 3. Failure Isolation
- Can correlation failures affect signal ingestion?
- Can correlation failures affect incident management?
- Are failures properly contained?

### 4. Idempotency
- Is candidate generation idempotent?
- Can duplicate candidates be created?
- Is candidate hash sufficient?

### 5. Scalability
- Can correlation handle high signal volumes?
- Are time window queries efficient?
- Is correlation state properly bounded?

---

## 🎯 Success Metrics

### Operational Metrics
- Correlation rule evaluation rate
- Candidate generation rate
- Candidate promotion rate (CP-6)
- False positive rate

### Quality Metrics
- Replay determinism (100%)
- Correlation failures (< 0.1%)
- Duplicate candidates (0%)

### Performance Metrics
- Correlation latency (p50, p99)
- Query performance
- Lambda cold starts

---

## 🚀 Implementation Plan

### Week 1: Schema & Rules
- [ ] Correlation rule schema
- [ ] Rule validation
- [ ] Rule store
- [ ] Unit tests

### Week 2: Correlation Engine
- [ ] Rule matching logic
- [ ] Time window queries
- [ ] Grouping logic
- [ ] Unit tests

### Week 3: Candidate Generation
- [ ] Candidate builder
- [ ] Template substitution
- [ ] CP-5 integration
- [ ] Integration tests

### Week 4: State Management
- [ ] Correlation state store
- [ ] Idempotency handling
- [ ] TTL management
- [ ] Integration tests

### Week 5: Lambda & Infrastructure
- [ ] Signal correlator Lambda
- [ ] EventBridge integration
- [ ] Infrastructure deployment
- [ ] End-to-end tests

### Week 6: Replay & Verification
- [ ] Replay verification
- [ ] Determinism tests
- [ ] Performance testing
- [ ] Documentation

---

## ⚠️ Open Questions

1. **Time Window Alignment:**
   - Should windows be sliding or fixed?
   - How do we handle signals at window boundaries?
   - What happens if a signal arrives late?

2. **Candidate Deduplication:**
   - How long should we remember candidate hashes?
   - Should correlation state have TTL?
   - What if rules change between replays?

3. **Rule Versioning:**
   - How do we handle rule updates?
   - Should old rules be replayable?
   - How do we migrate rules?

4. **Scalability:**
   - What if 1000 signals arrive in 1 second?
   - How do we batch correlation?
   - Should we use DynamoDB streams instead of EventBridge?

5. **Failure Handling:**
   - What if CP-5 is down?
   - Should we retry candidate creation?
   - How do we handle partial failures?

---

## 📝 Next Steps

1. **Review this design document**
   - Validate invariants
   - Check for forbidden patterns
   - Verify determinism guarantees

2. **Answer open questions**
   - Time window alignment
   - Candidate deduplication
   - Rule versioning
   - Scalability
   - Failure handling

3. **Approve design**
   - Sign off on schema
   - Sign off on algorithm
   - Sign off on invariants

4. **Begin implementation**
   - Only after design approval
   - Follow implementation plan
   - Test continuously

---

**STATUS: AWAITING DESIGN REVIEW**

This design must be reviewed and approved before any code is written.

---

**END OF PHASE 2.2 DESIGN DOCUMENT**
