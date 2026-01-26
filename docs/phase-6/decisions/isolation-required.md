# Phase 6 Isolation - NOW REQUIRED

**Date:** January 26, 2026  
**Status:** 🚨 CRITICAL - Legacy Stack Blocking Deployment

---

## Problem Confirmed

Deployment of `OpxControlPlaneStack` failed with:

```
UPDATE_FAILED | AWS::DynamoDB::Table | PromotionDecisionsTable
Resource handler returned message: "Cannot perform more than one GSI creation 
or deletion in a single update"
```

**Root Cause:** Phase 1-5 legacy DynamoDB table has GSI configuration issues.

**Impact:** Phase 6 Bedrock Agents cannot deploy because they're in the same stack as broken Phase 1-5 resources.

---

## Solution: Deploy Phase 6 as Separate Stack

We MUST isolate Phase 6 to deploy it independently.

---

## Quick Fix: Deploy Phase 6 Only

### Option 1: Use Existing Phase 6 App (Fastest)

```bash
# Deploy Phase 6 stack only (isolated)
cdk --app "npx tsx infra/phase6/app.ts" deploy OpxPhase6Stack
```

This deploys ONLY:
- 6 Bedrock Agents
- 9 Lambda action groups
- 1 IAM execution role
- 6 agent aliases

**No dependency on broken Phase 1-5 DynamoDB table.**

### Option 2: Fix Legacy Stack First (Slower)

Fix the DynamoDB GSI issue in Phase 1-5, then deploy everything together.

**Recommendation:** Use Option 1 (Phase 6 isolation) to unblock Week 4 immediately.

---

## Verification

Check if `infra/phase6/` directory exists:

```bash
ls -la infra/phase6/
```

Expected files:
- `app.ts`
- `tsconfig.json`
- `constructs/bedrock-agent-iam-roles.ts`
- `constructs/bedrock-action-groups.ts`
- `constructs/bedrock-agents.ts`
- `stacks/opx-phase6-stack.ts`

If missing, we need to complete the isolation setup.

---

## Next Steps

1. **Complete Phase 6 isolation** (if not done)
2. **Deploy Phase 6 independently:** `cdk --app "npx tsx infra/phase6/app.ts" deploy`
3. **Verify in AWS Console:** Bedrock → Agents
4. **Proceed to Week 4:** LangGraph integration

---

**Status:** Phase 6 isolation is now REQUIRED, not optional.
