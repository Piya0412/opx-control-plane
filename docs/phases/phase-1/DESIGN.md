# Phase 1: Incident Control Plane

**Status:** ✅ COMPLETE  
**Completion Date:** 2026-01-15  
**Version:** 1.0.0

---

## Overview

Phase 1 establishes the foundational incident control plane - a deterministic, auditable, and replayable system for managing incident lifecycle state.

## Design Principles

1. **Fail-closed by default** - Safety over convenience
2. **Deterministic behavior** - Replay must produce identical results
3. **EventBridge is fan-out only** - DynamoDB event store is source of truth
4. **No AI/heuristics in control plane** - Pure state machine logic
5. **IAM-only security** - No API keys, SigV4 everywhere
6. **Permanent idempotency** - No TTL on idempotency keys

## Architecture

### Core Components

**DynamoDB Tables:**
- `opx-incidents` - Current incident state (single-table design)
- `opx-incident-events` - Event store (authoritative, append-only)
- `opx-idempotency` - Permanent idempotency keys (no TTL)

**State Machine:**
- 7 states: PENDING, OPEN, MITIGATING, RESOLVED, CLOSED, CANCELLED, ARCHIVED
- Deterministic transitions with authority validation
- Complete audit trail

**Security:**
- IAM-only authentication
- SigV4 request signing
- No API keys or secrets

## State Machine

```
PENDING → OPEN → MITIGATING → RESOLVED → CLOSED
          ↓                      ↓
      CANCELLED              ARCHIVED
```

### State Transitions

| From | To | Trigger | Authority Required |
|------|----|---------|--------------------|
| PENDING | OPEN | Promotion approved | System |
| OPEN | MITIGATING | Mitigation started | Human/System |
| MITIGATING | RESOLVED | Issue resolved | Human |
| RESOLVED | CLOSED | Post-mortem complete | Human |
| OPEN | CANCELLED | False positive | Human |
| CLOSED | ARCHIVED | Retention policy | System |

## Implementation

### Incident Schema

```typescript
interface Incident {
  incidentId: string;           // Deterministic ID
  state: IncidentState;
  severity: Severity;
  service: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  authority: AuthorityContext;
  metadata: IncidentMetadata;
}
```

### Event Store

All state changes are recorded as events:

```typescript
interface IncidentEvent {
  eventId: string;              // UUID
  incidentId: string;
  eventType: string;
  timestamp: string;
  actor: string;
  previousState: IncidentState;
  newState: IncidentState;
  metadata: Record<string, any>;
}
```

### Idempotency

Permanent idempotency keys prevent duplicate operations:

```typescript
interface IdempotencyRecord {
  idempotencyKey: string;       // Client-provided
  incidentId: string;
  operation: string;
  result: any;
  createdAt: string;
  // NO TTL - permanent record
}
```

## Design Freeze

**Lock Date:** 2026-01-17

The following components are **FROZEN** and require architectural review for changes:

### Frozen Components

| Component | Version | Status | Tests |
|-----------|---------|--------|-------|
| Candidate Generation | 1.0.0 | 🔒 FROZEN | 115/115 ✅ |
| Promotion & Authority Gate | 1.0.0 | 🔒 FROZEN | ~100 ✅ |
| Incident Management | 1.0.0 | 🔒 FROZEN | 115/115 ✅ |
| Incident Controller | 1.0.0 | 🔒 FROZEN | 122/122 ✅ |

**Total:** ~452 tests, all passing

### Prohibited Changes

- ❌ No schema changes to core entities
- ❌ No state machine modifications
- ❌ No new states or transitions
- ❌ No reopening semantics
- ❌ No state bypass mechanisms

## API Endpoints

### Create Incident
```
POST /incidents
Authorization: AWS SigV4
Idempotency-Key: <client-key>

Body: {
  "service": "api-gateway",
  "severity": "SEV1",
  "title": "High error rate",
  "description": "...",
  "authority": {...}
}
```

### Update Incident State
```
PATCH /incidents/{incidentId}/state
Authorization: AWS SigV4

Body: {
  "newState": "MITIGATING",
  "authority": {...}
}
```

### Get Incident
```
GET /incidents/{incidentId}
Authorization: AWS SigV4
```

### List Incidents
```
GET /incidents?state=OPEN&service=api-gateway
Authorization: AWS SigV4
```

## Observability

### Metrics
- Incident creation rate
- State transition latency
- API error rates
- Idempotency hit rate

### Alarms
- High incident creation rate
- State transition failures
- API availability < 99.9%

### Logs
- All API requests (CloudWatch)
- State transitions (structured logs)
- Authority validation failures

## Testing

### Unit Tests
- State machine logic: 115 tests
- Schema validation: 50 tests
- Authority validation: 35 tests

### Integration Tests
- End-to-end incident lifecycle: 20 tests
- Idempotency verification: 15 tests
- Replay verification: 10 tests

### Load Tests
- 1000 incidents/minute sustained
- 10,000 concurrent reads
- Sub-100ms p99 latency

## Deployment

**Stack:** OpxControlPlaneStack  
**Region:** us-east-1  
**Status:** DEPLOYED

**Resources:**
- 3 DynamoDB tables
- 1 API Gateway
- 4 Lambda functions
- IAM roles and policies

## Cost

**Monthly:** ~$50-100
- DynamoDB: $30-50
- Lambda: $10-20
- API Gateway: $5-10
- CloudWatch: $5-10

## Security

### Authentication
- IAM-only (no API keys)
- SigV4 request signing
- Service-to-service via IAM roles

### Authorization
- Resource-based policies
- Least privilege IAM
- Authority context validation

### Encryption
- At rest: DynamoDB encryption
- In transit: TLS 1.2+
- Keys: AWS-managed KMS

## Compliance

- ✅ Audit trail (all events logged)
- ✅ Deterministic replay
- ✅ No data loss (append-only)
- ✅ Authority validation
- ✅ Idempotency guarantees

---

**Last Updated:** 2026-01-31
