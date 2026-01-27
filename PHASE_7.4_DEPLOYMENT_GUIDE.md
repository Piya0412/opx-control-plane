# Phase 7.4 Deployment Guide

**Phase:** 7.4 - Knowledge RAG Agent Integration  
**Date:** January 27, 2026  
**Status:** Ready for Deployment

---

## Prerequisites

✅ Phase 7.3 deployed (Bedrock Knowledge Base exists)  
✅ Knowledge corpus ingested into S3  
✅ OpenSearch index created and populated  
✅ Phase 6 Bedrock Agents deployed

---

## Deployment Steps

### Step 1: Verify Knowledge Base Exists

```bash
# Get Knowledge Base ID from main stack outputs
aws cloudformation describe-stacks \
  --stack-name OpxControlPlaneStack \
  --query 'Stacks[0].Outputs[?OutputKey==`KnowledgeBaseId`].OutputValue' \
  --output text
```

**Expected Output:** `HJPLE9IOEU` (or similar)

If empty, deploy Phase 7.3 first:
```bash
cd infra
npm run build
cdk deploy OpxControlPlaneStack
```

---

### Step 2: Build Phase 6 Infrastructure

```bash
cd infra/phase6
npm install
npm run build
```

**Expected:** TypeScript compilation succeeds (ignore pre-existing errors in other files)

---

### Step 3: Deploy Phase 6 Stack

```bash
cdk deploy OpxPhase6Stack
```

**Expected Resources Created:**
- ✅ 1 new Lambda: `opx-knowledge-rag-tool-retrieve-knowledge`
- ✅ Updated Bedrock Agent: `opx-knowledge-rag` (with retrieve-knowledge action group)
- ✅ IAM permissions: `bedrock:Retrieve` granted, ingestion denied

**Deployment Time:** ~5-10 minutes

---

### Step 4: Verify Deployment

#### Check Lambda Function
```bash
aws lambda get-function \
  --function-name opx-knowledge-rag-tool-retrieve-knowledge \
  --query 'Configuration.[FunctionName,Runtime,Handler,Environment]' \
  --output json
```

**Expected:**
```json
[
  "opx-knowledge-rag-tool-retrieve-knowledge",
  "python3.12",
  "index.lambda_handler",
  {
    "Variables": {
      "KNOWLEDGE_BASE_ID": "HJPLE9IOEU",
      "ACTION_NAME": "retrieve-knowledge",
      "AGENT_ID": "knowledge-rag"
    }
  }
]
```

#### Check IAM Permissions
```bash
aws lambda get-policy \
  --function-name opx-knowledge-rag-tool-retrieve-knowledge \
  --query 'Policy' \
  --output json | jq
```

**Verify:**
- ✅ Bedrock service principal can invoke Lambda
- ✅ Lambda role has `bedrock:Retrieve` permission
- ✅ Lambda role has explicit DENY on ingestion operations

#### Check Bedrock Agent
```bash
# Get agent ID
AGENT_ID=$(aws cloudformation describe-stacks \
  --stack-name OpxPhase6Stack \
  --query 'Stacks[0].Outputs[?OutputKey==`knowledge-rag-agent-id`].OutputValue' \
  --output text)

# List action groups
aws bedrock-agent list-agent-action-groups \
  --agent-id $AGENT_ID \
  --agent-version DRAFT \
  --query 'actionGroupSummaries[?actionGroupName==`retrieve-knowledge`]' \
  --output json
```

**Expected:**
```json
[
  {
    "actionGroupId": "...",
    "actionGroupName": "retrieve-knowledge",
    "actionGroupState": "ENABLED",
    "description": "Retrieve knowledge from Knowledge Base"
  }
]
```

---

### Step 5: Test Knowledge Retrieval

#### Test Lambda Directly
```bash
aws lambda invoke \
  --function-name opx-knowledge-rag-tool-retrieve-knowledge \
  --payload '{
    "actionGroup": "retrieve-knowledge",
    "apiPath": "/retrieve",
    "parameters": [
      {"name": "query", "value": "How to handle RDS failover?"},
      {"name": "max_results", "value": "5"}
    ]
  }' \
  response.json

cat response.json | jq
```

**Expected Response:**
```json
{
  "messageVersion": "1.0",
  "response": {
    "actionGroup": "retrieve-knowledge",
    "apiPath": "/retrieve",
    "httpMethod": "POST",
    "httpStatusCode": 200,
    "responseBody": {
      "application/json": {
        "body": "{\"results\": [...]}"
      }
    }
  }
}
```

#### Test via Bedrock Agent
```bash
# Get agent and alias IDs
AGENT_ID=$(aws cloudformation describe-stacks \
  --stack-name OpxPhase6Stack \
  --query 'Stacks[0].Outputs[?OutputKey==`knowledge-rag-agent-id`].OutputValue' \
  --output text)

ALIAS_ID=$(aws cloudformation describe-stacks \
  --stack-name OpxPhase6Stack \
  --query 'Stacks[0].Outputs[?OutputKey==`knowledge-rag-alias-id`].OutputValue' \
  --output text)

# Invoke agent
aws bedrock-agent-runtime invoke-agent \
  --agent-id $AGENT_ID \
  --agent-alias-id $ALIAS_ID \
  --session-id test-session-$(date +%s) \
  --input-text "How to handle RDS failover?" \
  agent-response.txt

cat agent-response.txt
```

**Expected:**
- ✅ Agent responds with guidance
- ✅ Citations included in response
- ✅ No error messages in output

---

### Step 6: Verify VECTOR Search (Not HYBRID)

```bash
# Check Lambda logs for search type
aws logs tail /aws/lambda/opx-knowledge-rag-tool-retrieve-knowledge \
  --follow \
  --filter-pattern "overrideSearchType"
```

**Expected Log Entry:**
```
'overrideSearchType': 'VECTOR'
```

**Critical:** Should NEVER see `'overrideSearchType': 'HYBRID'`

---

### Step 7: Monitor Initial Performance

```bash
# Check Lambda metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=opx-knowledge-rag-tool-retrieve-knowledge \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum \
  --output table
```

**Target:** Average < 2000ms (2 seconds)

---

## Validation Checklist

- [ ] Knowledge Base ID exported from main stack
- [ ] Phase 6 stack deployed successfully
- [ ] Lambda function created with correct environment variables
- [ ] IAM permissions granted (bedrock:Retrieve)
- [ ] IAM permissions denied (ingestion operations)
- [ ] Bedrock Agent has retrieve-knowledge action group
- [ ] Lambda test returns results with citations
- [ ] Agent test returns guidance with citations
- [ ] CloudWatch logs show VECTOR search (not HYBRID)
- [ ] No error strings in agent responses
- [ ] Latency < 2 seconds (P95)

---

## Troubleshooting

### Issue: Lambda returns empty results

**Possible Causes:**
1. Knowledge Base not ingested
2. OpenSearch index empty
3. Query doesn't match any documents

**Solution:**
```bash
# Check Knowledge Base status
aws bedrock-agent get-data-source \
  --knowledge-base-id $KB_ID \
  --data-source-id $DS_ID

# Check ingestion job status
aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id $KB_ID \
  --data-source-id $DS_ID
```

### Issue: Lambda timeout

**Possible Causes:**
1. OpenSearch collection cold start
2. Large result set
3. Network latency

**Solution:**
```bash
# Increase Lambda timeout
aws lambda update-function-configuration \
  --function-name opx-knowledge-rag-tool-retrieve-knowledge \
  --timeout 30
```

### Issue: Permission denied

**Possible Causes:**
1. Lambda role missing bedrock:Retrieve permission
2. Knowledge Base ARN incorrect

**Solution:**
```bash
# Check Lambda role
ROLE_NAME=$(aws lambda get-function \
  --function-name opx-knowledge-rag-tool-retrieve-knowledge \
  --query 'Configuration.Role' \
  --output text | cut -d'/' -f2)

aws iam get-role-policy \
  --role-name $ROLE_NAME \
  --policy-name inline-policy
```

### Issue: HYBRID search detected in logs

**This is a CRITICAL violation!**

**Solution:**
1. Verify `knowledge_retrieval.py` has `'overrideSearchType': 'VECTOR'`
2. Redeploy Lambda
3. Clear any cached code

```bash
# Force Lambda update
aws lambda update-function-code \
  --function-name opx-knowledge-rag-tool-retrieve-knowledge \
  --zip-file fileb://function.zip
```

---

## Rollback Procedure

If deployment fails or causes issues:

```bash
# Rollback Phase 6 stack
cdk destroy OpxPhase6Stack

# Redeploy previous version
git checkout <previous-commit>
cd infra/phase6
cdk deploy OpxPhase6Stack
```

**Note:** Rollback does NOT affect Phase 7.3 (Knowledge Base remains intact)

---

## Post-Deployment

### Enable Monitoring

1. Set up CloudWatch dashboard for Knowledge Base metrics
2. Configure alarms for latency and errors
3. Enable X-Ray tracing for end-to-end visibility

### Performance Tuning

1. Monitor retrieval latency (target < 2s P95)
2. Adjust max_results if needed (default: 5)
3. Tune embedding model if relevance is poor

### Human Evaluation

1. Sample 20 agent responses
2. Verify citation accuracy (target: 100%)
3. Assess relevance quality (target: >80%)

---

## Success Criteria

✅ All validation checklist items complete  
✅ Latency < 2 seconds (P95)  
✅ Citation accuracy = 100%  
✅ No error leakage in agent responses  
✅ VECTOR search confirmed in logs  
✅ Zero ingestion permission violations

---

## Next Steps

After successful deployment:

1. **Phase 7.5:** Knowledge Base monitoring dashboard (optional)
2. **Phase 8:** Human review UI with citation display
3. **Phase 9:** Automation with approval based on cited guidance

---

**Deployment Guide Version:** 1.0  
**Last Updated:** January 27, 2026  
**Contact:** OPX Control Plane Team
