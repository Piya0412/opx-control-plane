# Phase 6 - Deployment Guide

**Date:** January 26, 2026  
**Stack:** OpxPhase6Stack (Isolated)

---

## Prerequisites

1. **AWS Credentials Configured**
   ```bash
   aws configure
   # Or use environment variables:
   export AWS_ACCESS_KEY_ID=...
   export AWS_SECRET_ACCESS_KEY=...
   export AWS_DEFAULT_REGION=us-east-1
   ```

2. **CDK Bootstrap** (if not already done)
   ```bash
   cdk bootstrap aws://ACCOUNT-ID/REGION
   ```

3. **Node.js 20+** (already installed)
   ```bash
   node --version  # v20.19.6
   ```

---

## Deployment Steps

### Step 1: Synthesize CloudFormation Template
```bash
# From project root
cdk synth -a "npx tsx infra/phase6/app.ts" OpxPhase6Stack

# Verify template generated
ls -lh cdk.out/OpxPhase6Stack.template.json
```

**Expected Output:**
- Template file created (~150-200KB)
- Warnings about missing prompts (expected - uses placeholders)
- No TypeScript errors

### Step 2: Review Changes (Dry Run)
```bash
cdk diff -a "npx tsx infra/phase6/app.ts" OpxPhase6Stack
```

**Expected Changes:**
- 6 Bedrock Agents (CREATE)
- 6 Agent Aliases (CREATE)
- 9 Lambda Functions (CREATE)
- 1 IAM Role (CREATE)
- 27 CloudFormation Outputs (CREATE)

### Step 3: Deploy to AWS
```bash
cdk deploy -a "npx tsx infra/phase6/app.ts" OpxPhase6Stack
```

**Deployment Time:** ~5-10 minutes

**What Happens:**
1. CloudFormation stack created
2. IAM role provisioned
3. Lambda functions deployed
4. Bedrock Agents created
5. Agents prepared (mandatory step)
6. Aliases created
7. Outputs exported

### Step 4: Verify Deployment

#### A. Check CloudFormation Stack
```bash
aws cloudformation describe-stacks \
  --stack-name OpxPhase6Stack \
  --query 'Stacks[0].StackStatus'
```

**Expected:** `"CREATE_COMPLETE"`

#### B. List Bedrock Agents
```bash
aws bedrock-agent list-agents \
  --query 'agentSummaries[?starts_with(agentName, `opx-`)].{Name:agentName,Status:agentStatus,ID:agentId}'
```

**Expected:** 6 agents with status "PREPARED"

#### C. Get CloudFormation Outputs
```bash
aws cloudformation describe-stacks \
  --stack-name OpxPhase6Stack \
  --query 'Stacks[0].Outputs' \
  --output table
```

**Expected:** 27 outputs (agent IDs, alias IDs, ARNs)

### Step 5: Run Smoke Tests
```bash
python3 scripts/smoke-test-agents.py
```

**Expected:**
- All 6 agents respond
- HTTP 200 status codes
- Mock data returned (stub implementations)

---

## Troubleshooting

### Issue: CDK Bootstrap Required
```
Error: This stack uses assets, so the toolkit stack must be deployed
```

**Solution:**
```bash
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/us-east-1
```

### Issue: Insufficient Permissions
```
Error: User is not authorized to perform: bedrock:CreateAgent
```

**Solution:** Ensure your AWS user/role has these permissions:
- `bedrock:*`
- `iam:CreateRole`, `iam:AttachRolePolicy`
- `lambda:CreateFunction`
- `cloudformation:*`

### Issue: Agent Preparation Fails
```
Error: Agent failed to prepare
```

**Solution:**
1. Check IAM role has `bedrock:InvokeModel` permission
2. Verify foundation model is available in your region
3. Check CloudWatch Logs: `/aws/bedrock/agents/*`

### Issue: Prompt Loading Warnings
```
Warning: Could not load prompt for signal-intelligence
```

**Status:** ✅ Expected - agents use placeholder prompts  
**Impact:** None - agents still deploy successfully  
**Fix (Optional):** Ensure `prompts/{agent-id}/v1.0.0.md` files exist

---

## Post-Deployment

### Export Agent IDs for LangGraph
```bash
# Get all agent IDs
aws cloudformation describe-stacks \
  --stack-name OpxPhase6Stack \
  --query 'Stacks[0].Outputs[?contains(OutputKey, `agent-id`)].{Agent:OutputKey,ID:OutputValue}' \
  --output table

# Save to .env file
cat > .env.phase6 << EOF
SIGNAL_INTELLIGENCE_AGENT_ID=$(aws cloudformation describe-stacks --stack-name OpxPhase6Stack --query 'Stacks[0].Outputs[?OutputKey==`signal-intelligence-agent-id`].OutputValue' --output text)
SIGNAL_INTELLIGENCE_ALIAS_ID=$(aws cloudformation describe-stacks --stack-name OpxPhase6Stack --query 'Stacks[0].Outputs[?OutputKey==`signal-intelligence-alias-id`].OutputValue' --output text)
# ... repeat for other agents
EOF
```

### Test Agent Invocation
```bash
# Test signal-intelligence agent
aws bedrock-agent-runtime invoke-agent \
  --agent-id <AGENT_ID> \
  --agent-alias-id <ALIAS_ID> \
  --session-id test-session-1 \
  --input-text "Analyze CPU metrics for the last hour" \
  --output-file response.json

# View response
cat response.json
```

---

## Rollback

If deployment fails or you need to rollback:

```bash
# Delete the stack
cdk destroy -a "npx tsx infra/phase6/app.ts" OpxPhase6Stack

# Or use CloudFormation directly
aws cloudformation delete-stack --stack-name OpxPhase6Stack

# Wait for deletion
aws cloudformation wait stack-delete-complete --stack-name OpxPhase6Stack
```

**Safety:** Phase 1-5 infrastructure is unaffected by Phase 6 rollback.

---

## Cost Estimate

**Monthly Cost (Development):**
- Bedrock Agents: $0 (no invocations)
- Lambda Functions: $0 (free tier)
- CloudWatch Logs: ~$1-5
- **Total: ~$1-5/month**

**Monthly Cost (Production):**
- Bedrock Agent Invocations: $0.002 per 1K input tokens
- Lambda Invocations: $0.20 per 1M requests
- CloudWatch Logs: ~$5-20
- **Total: Variable based on usage**

---

## Next Steps

After successful deployment:

1. ✅ Verify all 6 agents in AWS Console
2. ✅ Run smoke tests
3. ✅ Export agent IDs/aliases
4. ➡️ **Proceed to Week 4:** LangGraph ↔ Bedrock Integration
   - Wire agent IDs into `src/langgraph/graph.py`
   - Test end-to-end orchestration
   - Validate deterministic replay

---

## Support

**Documentation:**
- [AWS Bedrock Agents](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [CDK TypeScript](https://docs.aws.amazon.com/cdk/v2/guide/work-with-cdk-typescript.html)

**Logs:**
- CloudFormation Events: AWS Console → CloudFormation → OpxPhase6Stack → Events
- Bedrock Agent Logs: CloudWatch Logs → `/aws/bedrock/agents/*`
- Lambda Logs: CloudWatch Logs → `/aws/lambda/opx-*-tool-*`
