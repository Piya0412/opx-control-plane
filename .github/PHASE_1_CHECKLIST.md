# Phase 1 Completion Checklist

## 🔒 BLOCKERS (Must Complete Before Phase 1 Sign-off)

### Security Hardening
- [ ] API Gateway requires IAM authentication (AWS_IAM)
- [ ] IAM roles created (Creator, Reader, Operator, Approver)
- [ ] Lambda extracts IAM principal from request context
- [ ] Authorization logic enforces RBAC
- [ ] All audit events include principal ARN
- [ ] No secrets in code, env vars, or config files
- [ ] IAM policies follow least privilege

### Authoritative Event Store
- [ ] DynamoDB table `opx-incident-events` created
- [ ] Events have strictly monotonic `eventSeq`
- [ ] Events include `stateHashAfter` (SHA-256)
- [ ] Events are immutable (append-only)
- [ ] Incident service writes to event store atomically
- [ ] EventBridge is fan-out only (not replay source)
- [ ] Replay service reads from event store only

### Replay System
- [ ] Replay reconstructs state from events
- [ ] Replay recomputes state hash at each step
- [ ] Replay compares final hash with current state
- [ ] Replay fails if hashes don't match
- [ ] Replay works offline from live system
- [ ] Replay API endpoint implemented

### Permanent Idempotency
- [ ] DynamoDB table `opx-idempotency` created
- [ ] No TTL on idempotency records
- [ ] Idempotency records are immutable
- [ ] Duplicate creates return same incident (200)
- [ ] Idempotency middleware implemented
- [ ] Historical idempotency evidence preserved

### CLI Authority Model
- [ ] CLI is thin client only
- [ ] CLI uses IAM SigV4 for all requests
- [ ] CLI has no direct DynamoDB access
- [ ] CLI has no local decision-making logic
- [ ] CLI cannot bypass API validation
- [ ] Removing CLI does not affect system correctness

### Monitoring Guardrails
- [ ] Alarms emit notifications only (no actions)
- [ ] Alarms do NOT create incidents
- [ ] Alarms do NOT trigger transitions
- [ ] Monitoring has no write authority
- [ ] All state changes originate from controller API

---

## ✅ HIGH Priority (Must Complete)

### Integration Testing
- [ ] Test full incident lifecycle with real AWS services
- [ ] Test all API endpoints with IAM auth
- [ ] Test invalid transitions are rejected
- [ ] Test optimistic locking (concurrent updates)
- [ ] Test audit events in EventBridge
- [ ] Test replay produces correct state
- [ ] Test idempotency with duplicate requests

### Final Validation
- [ ] All unit tests pass (27+)
- [ ] All integration tests pass
- [ ] Security audit complete
- [ ] Code review complete
- [ ] No AI/intelligence code present
- [ ] All exit criteria met (PLAN.md)
- [ ] All sign-off conditions met

---

## 🔶 MEDIUM Priority (Should Complete)

### Error Handling
- [ ] Input validation middleware
- [ ] Standardized error format
- [ ] Request IDs in all responses
- [ ] Clear error messages

### Documentation
- [ ] API documentation complete
- [ ] Operator runbook complete
- [ ] Developer guide complete
- [ ] README updated with examples

### Disaster Recovery
- [ ] Backup procedures documented
- [ ] Restore procedures tested
- [ ] RTO/RPO targets defined

---

## 📊 LOW Priority (Nice to Have)

### Performance Testing
- [ ] Load tests created
- [ ] Performance analyzed
- [ ] Bottlenecks identified
- [ ] Optimizations applied if needed

---

## 🚦 Phase 1 Exit Criteria (from PLAN.md)

- [ ] Incidents persist across time
- [ ] Full audit & replay works (deterministic, authoritative)
- [ ] No intelligence present

## 🔒 Phase 1 Sign-off Conditions (MANDATORY)

- [ ] Replay source is deterministic and authoritative
- [ ] Idempotency is permanent and auditable
- [ ] CLI is non-authoritative
- [ ] Monitoring is read-only
- [ ] IAM-only security enforced
- [ ] No AI / heuristics / confidence scoring present

---

## 📝 Final Steps

- [ ] Update PLAN.md: Mark Phase 1 as COMPLETE
- [ ] Update PLAN.md: Mark Phase 2 as READY
- [ ] Tag release: `v1.0.0-phase1`
- [ ] Document lessons learned
- [ ] Prepare Phase 2 kickoff

---

## Estimated Time

- **BLOCKERS:** 24-32 hours
- **HIGH Priority:** 6-9 hours
- **MEDIUM Priority:** 8-12 hours
- **LOW Priority:** 3-4 hours

**Total:** 41-57 hours

**Critical Path (BLOCKERS + HIGH):** 30-41 hours
