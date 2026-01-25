exe# Phase 2.2 Correlator Deployment - COMPLETE

**Date:** 2026-01-19  
**Status:** ✅ DEPLOYED AND ENABLED

---

## What Was Deployed

### 1. Lambda Function: `opx-correlator`
- **Runtime:** Node.js 20.x
- **Memory:** 512 MB
- **Timeout:** 30 seconds
- **Handler:** `src/correlation/correlation-handler.ts`
- **Status:** Active
- **DLQ:** Attached (mandatory)

**Environment Variables:**
- `SIGNALS_TABLE_NAME`: opx-signals
- `CORRELATION_RULES_TABLE_NAME`: opx-correlation-rules
- `CANDIDATES_TABLE_NAME`: opx-candidates
- `EVENT_BUS_NAME`: opx-audit-events

**IAM Permissions:**
- Read: opx-signals, opx-correlation-rules
- Write: opx-candidates
- PutEvents: opx-audit-events
- X-Ray tracing enabled

### 2. EventBridge Rule: `opx-signal-ingested-to-correlator`
- **Event Pattern:** `SignalIngested` from `opx.signal`
- **Target:** opx-correlator Lambda
- **Status:** ✅ ENABLED
- **Event Bus:** opx-audit-events

### 3. Test Correlation Rule Loaded
- **Rule ID:** rule-test-high-severity
- **Version:** 1.0.0
- **Status:** Enabled
- **Filters:** SEV1, SEV2 signals
- **Time Window:** PT5M (5 minutes, fixed alignment)
- **Grouping:** By service + severity
- **Threshold:** 2-10 signals

---

## Pipeline Status

### Complete Flow (NOW LIVE)
```
Signal Ingestion
    ↓
opx-signal-ingestor (Phase 2.1) ✅ LIVE
    ↓ SignalIngested event
opx-correlator (Phase 2.2) ✅ LIVE
    ↓ CandidateCreated event
opx-candidate-processor (Phase 2.3) ✅ LIVE
    ↓
Incident Created
```

### EventBridge Rules Status
- ✅ `opx-signal-ingested-to-correlator` - ENABLED
- ✅ `opx-candidate-created-to-processor` - ENABLED
- ❌ `opx-incident-created-to-downstream` - DISABLED (placeholder)

---

## Code Changes

### New Files
1. `src/correlation/correlation-handler.ts` - Lambda handler for correlator
2. `scripts/load-test-correlation-rule.ts` - Script to load test rules

### Modified Files
1. `infra/stacks/opx-control-plane-stack.ts` - Added correlator Lambda and EventBridge rule
2. `src/correlation/correlation-rule-store.ts` - Fixed boolean→string conversion for GSI

**Key Fix:** DynamoDB GSI doesn't support BOOLEAN keys, so `enabled` field is stored as STRING ('true'/'false') and converted back to boolean when reading.

---

## Verification Steps Completed

1. ✅ Lambda deployed successfully
2. ✅ Lambda status: Active
3. ✅ EventBridge rule created
4. ✅ EventBridge rule enabled
5. ✅ Test correlation rule loaded
6. ✅ Candidate processor rule enabled
7. ✅ IAM permissions verified (least privilege)
8. ✅ DLQ attached

---

## Next Steps (Phase 2.3 Step 8)

### End-to-End Smoke Test
1. Ingest test signal via SNS
2. Verify signal stored in opx-signals
3. Verify correlator triggered
4. Verify candidate created in opx-candidates
5. Verify processor triggered
6. Verify incident created in opx-incidents
7. **GATING:** Replay same signal → verify NO duplicate incident

### Monitoring
- Watch CloudWatch Logs:
  - `/aws/lambda/opx-signal-ingestor`
  - `/aws/lambda/opx-correlator`
  - `/aws/lambda/opx-candidate-processor`
- Monitor DLQs for failures
- Check DynamoDB tables for data flow

---

## Kill Switch (ARMED)

If duplicate incidents are observed:
1. **DISABLE EventBridge rules immediately:**
   ```bash
   aws events disable-rule --event-bus-name opx-audit-events --name opx-signal-ingested-to-correlator
   aws events disable-rule --event-bus-name opx-audit-events --name opx-candidate-created-to-processor
   ```
2. STOP all testing
3. Do NOT patch in prod
4. Investigate offline
5. No exceptions

---

## Deployment Timeline

- **10:15 PM:** CDK deployment started
- **10:16 PM:** Correlator Lambda created
- **10:16 PM:** EventBridge rule created (disabled)
- **10:16 PM:** Deployment complete (UPDATE_COMPLETE)
- **10:17 PM:** Test correlation rule loaded
- **10:17 PM:** EventBridge rules enabled
- **10:17 PM:** Pipeline LIVE

---

## Technical Notes

### Correlation Handler Design
- **Fail-fast discipline:** Any error throws immediately
- **Lambda retry:** Only retry mechanism (no internal retries)
- **Singleton pattern:** Clients/stores initialized once per container
- **Placeholder data providers:** Detection/evidence/normalization stores not yet implemented (Phase 2.4+)

### Signal Query Implementation
- Queries by service or severity using GSI
- Falls back to empty array if neither specified (avoids expensive scan)
- Production rules should always specify service or severity

### Data Provider Placeholders
- `getDetections()` - Returns empty array (TODO: Phase 2.4+)
- `getGraphs()` - Returns empty array (TODO: Phase 2.4+)
- `getNormalizedSignals()` - Returns empty array (TODO: Phase 2.4+)

Candidates will be created with empty detection/graph/signal arrays until Phase 2.4+ implements these stores.

---

## Status: READY FOR PHASE 2.3 STEP 8

The Phase 2.2 correlator is deployed and the complete pipeline is live. Ready to proceed with end-to-end s