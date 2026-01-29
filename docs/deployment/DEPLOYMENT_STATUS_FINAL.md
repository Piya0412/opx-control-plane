# Deployment Status - Final

**Date:** January 29, 2026  
**Time:** 11:54 AM

## Summary

Successfully resolved the stack architecture conflict and deployed Phase 6. Phase 7 has a DataSource conflict that needs resolution.

## What Was Fixed

### 1. Stack Architecture Conflict ✅

**Problem:** OpxControlPlaneStack tried to create resources that already existed in OpxPhase6Stack and OpxPhase7Stack.

**Root Cause:** CloudFormation ownership is permanent. Resources created by Phase 6/7 stacks cannot be claimed by OpxControlPlaneStack.

**Solution:**
- Updated `cdk.json` to point to Phase 6 as default: `"app": "npx tsx infra/phase6/app.ts"`
- Deprecated `infra/app.ts` with clear warnings
- Documented the correct architecture in `STACK_ARCHITECTURE_RESOLUTION.md`

### 2. Lambda Size Issue ✅

**Problem:** Phase 6 executor Lambda exceeded AWS's 250MB unzipped size limit.

**Root Cause:** Bundling included test dependencies (pytest, moto, mypy) and full langchain package.

**Solution:**
- Created `infra/phase6/lambda/requirements-prod.txt` with production-only dependencies
- Optimized bundling command to:
  - Use `langchain-core` instead of full `langchain`
  - Exclude test files and `__pycache__`
  - Remove boto3/botocore (already in Lambda runtime)
  - Use `--no-cache-dir` flag

### 3. Phase 6 Deployment ✅

**Status:** UPDATE_COMPLETE

**Deployed Resources:**
- LangGraph checkpoint table (opx-langgraph-checkpoints-dev)
- Phase 6 executor Lambda (optimized size)
- 6 Bedrock Agents with aliases
- 10 Action Group Lambdas
- Bedrock Guardrail (ID: xeoztij22wed)
- Guardrail violations table (opx-guardrail-violations)
- CloudWatch alarms for guardrails

## Current Blocker

### Phase 7 DataSource Conflict ❌

**Error:**
```
Resource handler returned message: "DataSource with name opx-knowledge-base-s3-source 
already exists. (Service: BedrockAgent, Status Code: 409, Request ID: f863e762-871c-4754-9b52-19ff7f030ee6)"
```

**Root Cause:** The Bedrock DataSource `opx-knowledge-base-s3-source` already exists from a previous deployment, but CloudFormation is trying to create it again.

**Possible Solutions:**

1. **Import Existing DataSource (Recommended)**
   - Use CloudFormation import to bring existing DataSource under stack management
   - Requires DataSource ID from existing resource

2. **Delete and Recreate**
   - Manually delete the existing DataSource via AWS CLI
   - Redeploy Phase 7 stack
   - Risk: Loses any ingestion history

3. **Change DataSource Name**
   - Update the construct to use a different name
   - Leaves orphaned resource in AWS

## Stack Ownership Matrix

| Layer | Stack | Status | Resources |
|-------|-------|--------|-----------|
| **Runtime Plane** | OpxPhase6Stack | ✅ DEPLOYED | DynamoDB, Lambdas, Agents, Guardrails |
| **Knowledge Plane** | OpxPhase7Stack | ❌ BLOCKED | OpenSearch, Knowledge Base, DataSource |
| **Control Plane** | OpxControlPlaneStack | ❌ DEPRECATED | None (reference only) |

## Deployment Commands

### Correct Commands ✅
```bash
# Deploy runtime plane
cdk deploy --app "npx tsx infra/phase6/app.ts"

# Deploy knowledge plane
cdk deploy --app "npx tsx infra/phase7/app.ts"
```

### Deprecated Commands ❌
```bash
# DO NOT RUN - Will fail with resource conflicts
cdk deploy OpxControlPlaneStack
```

## Next Steps

### Option A: Import DataSource (Safest)

1. Get existing DataSource ID:
```bash
aws bedrock-agent list-data-sources \
  --knowledge-base-id <KB_ID> \
  --query "dataSourceSummaries[?name=='opx-knowledge-base-s3-source'].dataSourceId" \
  --output text
```

2. Create CloudFormation import file
3. Import DataSource into Phase 7 stack
4. Continue deployment

### Option B: Delete and Recreate (Fastest)

1. Delete existing DataSource:
```bash
aws bedrock-agent delete-data-source \
  --knowledge-base-id <KB_ID> \
  --data-source-id <DS_ID>
```

2. Redeploy Phase 7:
```bash
cdk deploy --app "npx tsx infra/phase7/app.ts"
```

### Option C: Change Name (Not Recommended)

1. Update `infra/constructs/bedrock-knowledge-base.ts`
2. Change DataSource name to `opx-knowledge-base-s3-source-v2`
3. Redeploy Phase 7
4. Manually clean up old DataSource later

## Files Modified

### Infrastructure
- `cdk.json` - Changed default app to Phase 6
- `infra/app.ts` - Added deprecation warnings
- `infra/phase6/lambda/requirements-prod.txt` - Created production dependencies
- `infra/phase6/constructs/phase6-executor-lambda.ts` - Optimized bundling

### Documentation
- `STACK_ARCHITECTURE_RESOLUTION.md` - Comprehensive architecture documentation
- `DEPLOYMENT_STATUS_FINAL.md` - This file

## Verification

### Phase 6 Verification ✅
```bash
# Check stack status
aws cloudformation describe-stacks \
  --stack-name OpxPhase6Stack \
  --query "Stacks[0].StackStatus"
# Output: UPDATE_COMPLETE

# Check guardrail
aws bedrock get-guardrail --guardrail-identifier xeoztij22wed
# Status: READY

# Check violations table
aws dynamodb describe-table --table-name opx-guardrail-violations
# Status: ACTIVE

# Check Lambda
aws lambda get-function \
  --function-name OpxPhase6Stack-Phase6ExecutorLambdaFunction82D7505-*
# State: Active
```

### Phase 7 Verification ⏳
```bash
# Check stack status
aws cloudformation describe-stacks \
  --stack-name OpxPhase7Stack \
  --query "Stacks[0].StackStatus"
# Output: UPDATE_ROLLBACK_COMPLETE (needs fix)
```

## Cost Impact

**Phase 6 (Deployed):**
- Bedrock Guardrails: ~$1.80/month
- Lambda: Pay per invocation
- DynamoDB: Pay per request
- CloudWatch: Included in free tier

**Phase 7 (Pending):**
- OpenSearch Serverless: ~$700/month (2 OCUs)
- Bedrock Knowledge Base: ~$0.10 per 1000 queries
- S3: Negligible

## Lessons Learned

1. **CloudFormation Ownership is Permanent**
   - First stack to create a resource owns it forever
   - Plan stack boundaries before first deployment
   - Use phase-based architecture from the start

2. **Lambda Size Limits are Real**
   - 250MB unzipped limit is strict
   - Separate prod and dev dependencies
   - Exclude test files from deployment
   - Use Lambda layers for large dependencies

3. **Bedrock Resources Have Unique Names**
   - DataSources must have unique names per Knowledge Base
   - Cannot recreate with same name without deletion
   - Consider using CloudFormation import for existing resources

4. **Two-Phase Deployment Strategy**
   - Phase 7 uses two-phase deployment (collection first, then KB)
   - This pattern works well for resources with dependencies
   - Document the deployment order clearly

---

**Current State:** Phase 6 deployed successfully. Phase 7 blocked on DataSource conflict. Recommend Option B (delete and recreate) for fastest resolution.
