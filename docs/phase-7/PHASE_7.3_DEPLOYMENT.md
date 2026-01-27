# Phase 7.3 Deployment Guide

**Phase:** 7.3 (Bedrock Knowledge Base Deployment)  
**Status:** Ready for Deployment  
**Date:** January 27, 2026

---

## Prerequisites

### 1. Phase 7.2 Complete
- [x] Chunks generated (`npm run chunk-corpus`)
- [x] Chunks validated (determinism, semantic boundaries)
- [x] Metadata files created for all documents

### 2. AWS Credentials
```bash
# Configure AWS credentials
aws configure

# Verify credentials
aws sts get-caller-identity
```

### 3. CDK Bootstrap
```bash
# Bootstrap CDK (if not already done)
npm run bootstrap
```

---

## Deployment Steps

### Step 1: Deploy Infrastructure

```bash
# Build TypeScript
npm run build

# Deploy CDK stack
npm run deploy
```

**Expected Resources:**
- S3 Bucket: `opx-knowledge-corpus`
- OpenSearch Serverless Collection: `opx-knowledge`
- Bedrock Knowledge Base: `opx-knowledge-base`
- IAM Roles: `BedrockKnowledgeBaseIngestionRole`, `BedrockKnowledgeBaseRuntimeRole`
- Data Source: `opx-knowledge-base-s3-source`

**Deployment Time:** ~10-15 minutes (OpenSearch Serverless takes time to provision)

### Step 2: Initialize OpenSearch Index

After deployment, get the collection endpoint from CDK outputs:

```bash
# Get collection endpoint
COLLECTION_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name OpxControlPlaneStack \
  --query 'Stacks[0].Outputs[?OutputKey==`OpenSearchCollectionEndpoint`].OutputValue' \
  --output text)

echo "Collection Endpoint: $COLLECTION_ENDPOINT"

# Initialize index
./scripts/init-opensearch-index.sh \
  "$COLLECTION_ENDPOINT" \
  opx-knowledge-index
```

**Expected Output:**
```
✓ Index created successfully
```

### Step 3: Upload Chunks to S3

```bash
# Upload chunks
aws s3 sync chunks/ s3://opx-knowledge-corpus/chunks/ \
  --delete \
  --metadata ingestion_date=$(date -u +%Y-%m-%dT%H:%M:%SZ)
```

**Expected Output:**
```
upload: chunks/runbooks/lambda-timeout.jsonl to s3://opx-knowledge-corpus/chunks/runbooks/lambda-timeout.jsonl
upload: chunks/runbooks/rds-failover.jsonl to s3://opx-knowledge-corpus/chunks/runbooks/rds-failover.jsonl
...
```

### Step 4: Trigger Ingestion Job

```bash
# Get Knowledge Base ID and Data Source ID from CDK outputs
export KNOWLEDGE_BASE_ID=$(aws cloudformation describe-stacks \
  --stack-name OpxControlPlaneStack \
  --query 'Stacks[0].Outputs[?OutputKey==`KnowledgeBaseId`].OutputValue' \
  --output text)

export DATA_SOURCE_ID=$(aws cloudformation describe-stacks \
  --stack-name OpxControlPlaneStack \
  --query 'Stacks[0].Outputs[?OutputKey==`KnowledgeBaseDataSourceId`].OutputValue' \
  --output text)

echo "Knowledge Base ID: $KNOWLEDGE_BASE_ID"
echo "Data Source ID: $DATA_SOURCE_ID"

# Run ingestion script
./scripts/ingest-knowledge-base.sh
```

**Expected Output:**
```
Step 1: Uploading chunks to S3...
✓ Chunks uploaded successfully

Step 2: Triggering ingestion job...
✓ Ingestion job started
Job ID: <job-id>

Step 3: Monitoring ingestion job...
Status: IN_PROGRESS
Status: IN_PROGRESS
Status: COMPLETE

✓ Ingestion completed successfully

Statistics:
{
  "numberOfDocumentsScanned": 12,
  "numberOfNewDocumentsIndexed": 12,
  "numberOfModifiedDocumentsIndexed": 0,
  "numberOfDocumentsDeleted": 0,
  "numberOfDocumentsFailed": 0
}
```

**Ingestion Time:** ~5-10 minutes (depends on number of chunks)

### Step 5: Validate Retrieval

```bash
# Test retrieval
./scripts/test-knowledge-retrieval.sh \
  "$KNOWLEDGE_BASE_ID" \
  "How to diagnose RDS high latency?"
```

**Expected Output:**
```
✓ Retrieved 5 results

Results:
========================================

Score: 0.87
Source: runbooks/rds-failover.md
Lines: 5-10
Section: Diagnosis
Content:
## Diagnosis
Check CloudWatch metrics:
- DatabaseConnections
- ReplicaLag
- CPUUtilization
----------------------------------------

...
```

---

## Validation Checklist

### Infrastructure
- [ ] S3 bucket created (`opx-knowledge-corpus`)
- [ ] OpenSearch collection created (`opx-knowledge`)
- [ ] Bedrock Knowledge Base created (`opx-knowledge-base`)
- [ ] IAM roles created (ingestion + runtime)
- [ ] Data source created

### Ingestion
- [ ] Chunks uploaded to S3
- [ ] Ingestion job completed successfully
- [ ] All chunks indexed (no failures)
- [ ] Embeddings generated

### Retrieval
- [ ] Query returns relevant results
- [ ] Citation metadata present (source_file, start_line, end_line)
- [ ] Retrieval latency < 2 seconds
- [ ] Top-K results ranked by relevance

### Security
- [ ] Ingestion role has write access to OpenSearch
- [ ] Runtime role has read-only access to OpenSearch
- [ ] Agent role can retrieve from Knowledge Base
- [ ] Agent role CANNOT trigger ingestion

---

## Troubleshooting

### Issue: OpenSearch Index Creation Fails

**Symptoms:**
```
curl: (7) Failed to connect to <endpoint>
```

**Solution:**
- Wait 5-10 minutes for OpenSearch collection to be fully provisioned
- Check collection status:
  ```bash
  aws opensearchserverless get-collection \
    --id <collection-id> \
    --query 'collectionDetail.status'
  ```
- Collection must be in `ACTIVE` state

### Issue: Ingestion Job Fails

**Symptoms:**
```
Status: FAILED
Failure reasons: [...]
```

**Solution:**
- Check chunk format (must be valid JSONL)
- Verify S3 bucket permissions
- Check ingestion role has access to S3 and OpenSearch
- Review CloudWatch logs for detailed error messages

### Issue: No Results Returned

**Symptoms:**
```
❌ No results returned
```

**Solution:**
- Verify ingestion completed successfully
- Check embeddings were generated:
  ```bash
  aws bedrock-agent get-ingestion-job \
    --knowledge-base-id $KNOWLEDGE_BASE_ID \
    --data-source-id $DATA_SOURCE_ID \
    --ingestion-job-id <job-id>
  ```
- Try different query (may be too specific)
- Check OpenSearch index has documents:
  ```bash
  curl -X GET "$COLLECTION_ENDPOINT/opx-knowledge-index/_count" \
    --aws-sigv4 "aws:amz:us-east-1:aoss"
  ```

### Issue: Retrieval Latency > 2 seconds

**Symptoms:**
- Slow query responses
- Timeout errors

**Solution:**
- Check OpenSearch collection health
- Verify OCU allocation (minimum 2 OCU)
- Consider increasing OCU if query volume is high
- Review query complexity (number of results, filters)

---

## Cost Monitoring

### Monthly Costs

**OpenSearch Serverless:**
- 2 OCU × $0.24/OCU-hour × 730 hours = $350/month

**S3 Storage:**
- 1 GB × $0.023/GB = $0.02/month

**Embeddings (One-Time):**
- 12 chunks × 500 tokens/chunk × $0.0001/1000 tokens = $0.0006

**Retrieval (Per Query):**
- 50 tokens × $0.0001/1000 tokens = $0.000005

**Total:** ~$350/month

### Cost Optimization

1. **Reduce OCU** (if query volume is low)
   - Minimum: 2 OCU
   - Can scale down after initial testing

2. **Monitor Query Volume**
   - Track queries per day
   - Optimize query patterns
   - Cache frequent queries (future enhancement)

3. **Lifecycle Policies**
   - S3 versioning enabled (for rollback)
   - Old versions archived to Glacier after 90 days

---

## Next Steps

### Phase 7.4: Agent Integration
- Update Knowledge RAG Agent to use Knowledge Base
- Implement citation formatting
- Test end-to-end retrieval
- Measure retrieval quality

### Future Enhancements
- Query caching (reduce costs)
- Retrieval quality metrics
- A/B testing (vector vs hybrid search)
- Custom embeddings (if Titan is insufficient)

---

## Rollback Procedure

If deployment fails or issues are discovered:

```bash
# 1. Disable ingestion (prevent new data)
aws bedrock-agent update-data-source \
  --knowledge-base-id $KNOWLEDGE_BASE_ID \
  --data-source-id $DATA_SOURCE_ID \
  --data-source-configuration '{"type":"S3","s3Configuration":{"bucketArn":"arn:aws:s3:::opx-knowledge-corpus","inclusionPrefixes":[]}}' \
  --status DISABLED

# 2. Delete Knowledge Base (if needed)
aws bedrock-agent delete-knowledge-base \
  --knowledge-base-id $KNOWLEDGE_BASE_ID

# 3. Delete OpenSearch collection (if needed)
aws opensearchserverless delete-collection \
  --id <collection-id>

# 4. Destroy CDK stack (if needed)
npm run destroy
```

**Note:** S3 bucket and DynamoDB tables have `RETAIN` policy and will NOT be deleted.

---

## Support

For issues or questions:
1. Check CloudWatch logs
2. Review AWS Bedrock documentation
3. Contact SRE team lead

---

**Status:** Ready for Deployment  
**Approval:** Principal Architect  
**Date:** January 27, 2026

