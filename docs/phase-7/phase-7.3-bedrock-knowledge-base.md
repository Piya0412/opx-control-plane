# Phase 7.3: Bedrock Knowledge Base Deployment

**Phase:** 7.3 (Knowledge Base - Bedrock Deployment)  
**Authority:** Principal Architect  
**Depends On:** Phase 7.2 (Deterministic Chunking)

---

## Objective

Deploy and configure **AWS Bedrock Knowledge Base** to enable semantic search over chunked knowledge documents with:
1. Vector embeddings for semantic retrieval
2. S3-backed document storage
3. OpenSearch Serverless for vector search
4. IAM read-only access for agents
5. Citation metadata preservation

---

## Architecture

```
Knowledge Corpus (Git)
  ↓ (manual ingestion)
Chunking Pipeline (Phase 7.2)
  ↓ (JSONL output)
S3 Bucket (opx-knowledge-corpus)
  ↓ (sync trigger)
Bedrock Knowledge Base (opx-knowledge-base)
  ↓ (embedding)
Titan Embeddings Model
  ↓ (vector storage)
OpenSearch Serverless Collection
  ↓ (semantic search)
Knowledge RAG Agent (Phase 6)
  ↓ (citations)
Advisory Recommendations
```

---

## Components

### 1. S3 Bucket (Document Storage)

**Purpose:** Store chunked documents in JSONL format

**Structure:**
```
s3://opx-knowledge-corpus/
├── chunks/
│   ├── runbooks/
│   │   ├── rds-failover.jsonl
│   │   ├── ec2-recovery.jsonl
│   │   └── ...
│   └── postmortems/
│       ├── 2024-01-incident.jsonl
│       └── ...
└── metadata/
    └── ingestion-manifest.json
```

**Naming Rationale:**
- S3 bucket: `opx-knowledge-corpus` (raw truth, source of record)
- Knowledge Base: `opx-knowledge-base` (embedded view, search index)
- This prevents operational confusion in logs, metrics, and IAM policies

**Configuration:**
- Versioning: Enabled (for rollback)
- Encryption: SSE-S3 (AWS managed)
- Lifecycle: No expiration (knowledge is permanent)
- Access: Private (IAM only)

### 2. Bedrock Knowledge Base

**Purpose:** Manage embeddings and semantic search

**Configuration:**
```typescript
{
  name: "opx-knowledge-base",
  description: "Runbooks and postmortems for incident resolution",
  roleArn: "arn:aws:iam::ACCOUNT:role/BedrockKnowledgeBaseRuntimeRole",
  knowledgeBaseConfiguration: {
    type: "VECTOR",
    vectorKnowledgeBaseConfiguration: {
      embeddingModelArn: "arn:aws:bedrock:REGION::foundation-model/amazon.titan-embed-text-v1"
    }
  },
  storageConfiguration: {
    type: "OPENSEARCH_SERVERLESS",
    opensearchServerlessConfiguration: {
      collectionArn: "arn:aws:aoss:REGION:ACCOUNT:collection/opx-knowledge",
      vectorIndexName: "opx-knowledge-index",
      fieldMapping: {
        vectorField: "embedding",
        textField: "content",
        metadataField: "metadata"
      }
    }
  }
}
```

**Role Usage:**
- Knowledge Base uses `BedrockKnowledgeBaseRuntimeRole` for retrieval (read-only)
- Data Source uses `BedrockKnowledgeBaseIngestionRole` for ingestion (write access)

### 3. OpenSearch Serverless Collection

**Purpose:** Vector storage and similarity search

**Configuration:**
```typescript
{
  name: "opx-knowledge",
  type: "VECTORSEARCH",
  standbyReplicas: "DISABLED",  // Cost optimization
  encryptionPolicy: {
    type: "AWS_OWNED_KEY"
  },
  networkPolicy: {
    type: "VPC",
    vpcEndpoints: ["vpce-..."]  // Private access only
  }
}
```

**Data Access Policies (Fail-Closed):**

**Ingestion Role (Write Access):**
```json
{
  "principals": [
    "arn:aws:iam::ACCOUNT:role/BedrockKnowledgeBaseIngestionRole"
  ],
  "permissions": ["aoss:APIAccessAll"]
}
```

**Runtime Role (Read-Only):**
```json
{
  "principals": [
    "arn:aws:iam::ACCOUNT:role/BedrockKnowledgeBaseRuntimeRole"
  ],
  "permissions": ["aoss:ReadDocument"]
}
```

**Security Rationale:**
- Ingestion role has write access ONLY during ingestion jobs
- Runtime role (used by agents) has read-only access
- No role has both read and write permissions
- Prevents unintended mutations during retrieval

**Index Mapping:**
```json
{
  "settings": {
    "index.knn": true
  },
  "mappings": {
    "properties": {
      "embedding": {
        "type": "knn_vector",
        "dimension": 1536,
        "method": {
          "name": "hnsw",
          "engine": "faiss",
          "parameters": {
            "ef_construction": 512,
            "m": 16
          }
        }
      },
      "content": {
        "type": "text"
      },
      "metadata": {
        "type": "object",
        "properties": {
          "chunk_id": { "type": "keyword" },
          "source_file": { "type": "keyword" },
          "start_line": { "type": "integer" },
          "end_line": { "type": "integer" },
          "section_header": { "type": "text" },
          "chunk_type": { "type": "keyword" }
        }
      }
    }
  }
}
```

### 4. Titan Embeddings Model

**Model:** `amazon.titan-embed-text-v1`

**Specifications:**
- Dimension: 1536
- Max input: 8192 tokens
- Cost: $0.0001 per 1000 tokens
- Latency: ~100ms per embedding

**Why Titan:**
- Native Bedrock integration
- Cost-effective ($0.10 per 1M tokens)
- Good retrieval quality
- No external API dependencies

### 5. Data Source (S3 Sync)

**Purpose:** Sync S3 bucket to Knowledge Base

**Configuration:**
```typescript
{
  knowledgeBaseId: "KB_ID",
  name: "opx-knowledge-s3-source",
  dataSourceConfiguration: {
    type: "S3",
    s3Configuration: {
      bucketArn: "arn:aws:s3:::opx-knowledge-corpus",
      inclusionPrefixes: ["chunks/"]
    }
  },
  vectorIngestionConfiguration: {
    chunkingConfiguration: {
      chunkingStrategy: "NONE"  // Already chunked in Phase 7.2
    }
  }
}
```

**Sync Strategy:**
- Manual trigger (no automatic sync)
- Human-initiated via AWS Console or CLI
- Validates chunk format before ingestion
- Idempotent (same chunk → same embedding)

---

## IAM Roles & Permissions

### Bedrock Knowledge Base Ingestion Role

**Purpose:** Allow Bedrock to read S3 and write to OpenSearch during ingestion

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::opx-knowledge-corpus",
        "arn:aws:s3:::opx-knowledge-corpus/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "aoss:APIAccessAll"
      ],
      "Resource": "arn:aws:aoss:REGION:ACCOUNT:collection/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": "arn:aws:bedrock:REGION::foundation-model/amazon.titan-embed-text-v1"
    }
  ]
}
```

### Bedrock Knowledge Base Runtime Role

**Purpose:** Allow Bedrock to read from OpenSearch during retrieval (read-only)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "aoss:ReadDocument"
      ],
      "Resource": "arn:aws:aoss:REGION:ACCOUNT:collection/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": "arn:aws:bedrock:REGION::foundation-model/amazon.titan-embed-text-v1"
    }
  ]
}
```

### Knowledge RAG Agent Role

**Purpose:** Allow agent to query Knowledge Base (read-only)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:Retrieve"
      ],
      "Resource": "arn:aws:bedrock:REGION:ACCOUNT:knowledge-base/KB_ID"
    },
    {
      "Effect": "Deny",
      "Action": [
        "bedrock:CreateDataSource",
        "bedrock:UpdateDataSource",
        "bedrock:DeleteDataSource",
        "bedrock:StartIngestionJob"
      ],
      "Resource": "*"
    }
  ]
}
```

**Security Boundaries:**
- Ingestion role: Write access to OpenSearch (used only during ingestion jobs)
- Runtime role: Read-only access to OpenSearch (used during retrieval)
- Agent role: Can only retrieve, cannot ingest or mutate
- No role has both read and write permissions to OpenSearch

---

## Ingestion Process

### Step 1: Prepare Chunks (Phase 7.2)
```bash
python scripts/chunk-knowledge-corpus.py \
  --input knowledge-corpus/ \
  --output chunks/ \
  --config knowledge-base-config.json
```

### Step 2: Upload to S3
```bash
aws s3 sync chunks/ s3://opx-knowledge-corpus/chunks/ \
  --delete \
  --metadata ingestion_date=$(date -u +%Y-%m-%dT%H:%M:%SZ)
```

### Step 3: Trigger Ingestion Job
```bash
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id KB_ID \
  --data-source-id DS_ID
```

### Step 4: Monitor Ingestion
```bash
aws bedrock-agent get-ingestion-job \
  --knowledge-base-id KB_ID \
  --data-source-id DS_ID \
  --ingestion-job-id JOB_ID
```

### Step 5: Validate Embeddings
```bash
aws bedrock-agent-runtime retrieve \
  --knowledge-base-id KB_ID \
  --retrieval-query "How to handle RDS failover?" \
  --retrieval-configuration '{"vectorSearchConfiguration":{"numberOfResults":5}}'
```

---

## Retrieval Configuration

### Query Parameters

```typescript
{
  knowledgeBaseId: "KB_ID",
  retrievalQuery: "How to diagnose high RDS latency?",
  retrievalConfiguration: {
    vectorSearchConfiguration: {
      numberOfResults: 5,              // Top-K results
      overrideSearchType: "VECTOR"     // Vector-only search (deterministic)
    }
  }
}
```

**Search Type Rationale:**
- **VECTOR-only** search chosen for determinism
- Hybrid search introduces keyword scoring variance across versions
- Vector embeddings provide sufficient semantic matching
- If retrieval quality is insufficient, we can re-evaluate with explicit justification
```

### Response Format

```json
{
  "retrievalResults": [
    {
      "content": {
        "text": "## Diagnosis\nCheck CloudWatch metrics:\n- DatabaseConnections\n- ReplicaLag\n- CPUUtilization"
      },
      "location": {
        "type": "S3",
        "s3Location": {
          "uri": "s3://opx-knowledge-corpus/chunks/runbooks/rds-failover.jsonl"
        }
      },
      "score": 0.87,
      "metadata": {
        "chunk_id": "b7c2d1...",
        "source_file": "runbooks/rds-failover.md",
        "start_line": 5,
        "end_line": 10,
        "section_header": "Diagnosis"
      }
    }
  ]
}
```

---

## Cost Estimation

### Embeddings (One-Time)
- 100 documents × 10 chunks/doc × 500 tokens/chunk = 500K tokens
- Cost: 500K × $0.0001 / 1000 = $0.05

### Storage (Monthly)
- OpenSearch Serverless: $0.24/OCU-hour × 2 OCU × 730 hours = $350/month
- S3: 1 GB × $0.023/GB = $0.02/month
- **Total:** ~$350/month

### Retrieval (Per Query)
- Embedding query: 50 tokens × $0.0001 / 1000 = $0.000005
- OpenSearch query: Included in OCU cost
- **Cost per query:** ~$0.000005 (negligible)

### Monthly (1000 incidents)
- Retrieval: 1000 incidents × 5 queries/incident × $0.000005 = $0.025
- Storage: $350
- **Total:** ~$350/month

---

## Monitoring & Observability

### CloudWatch Metrics
- `IngestionJobStatus` - Success/failure rate
- `RetrievalLatency` - Query response time
- `RetrievalResultCount` - Number of results returned
- `EmbeddingTokens` - Token usage for embeddings

### CloudWatch Alarms
- Ingestion job failures > 1%
- Retrieval latency > 2 seconds
- OpenSearch cluster health != GREEN

### X-Ray Tracing
- End-to-end trace: Agent query → Bedrock Retrieve → OpenSearch → Response

---

## Validation Criteria

### Ingestion Validation
- [ ] All chunks uploaded to S3
- [ ] Ingestion job completes successfully
- [ ] Embeddings generated for all chunks
- [ ] Metadata preserved in OpenSearch

### Retrieval Validation
- [ ] Query returns relevant results
- [ ] Citation metadata present in response
- [ ] Retrieval latency < 2 seconds
- [ ] Top-K results ranked by relevance

### Integration Validation
- [ ] Knowledge RAG Agent can query Knowledge Base
- [ ] Agent receives citation metadata
- [ ] Agent formats citations correctly
- [ ] No write access to Knowledge Base

---

## Risks & Mitigations

### Risk 1: OpenSearch Cost
**Problem:** $350/month for 2 OCU (minimum)  
**Mitigation:** Accept cost, optimize later with usage-based scaling

### Risk 2: Ingestion Failures
**Problem:** Invalid chunk format breaks ingestion  
**Mitigation:** Validate JSONL format before upload, use schema validation

### Risk 3: Retrieval Quality
**Problem:** Poor results due to embedding model limitations  
**Mitigation:** Start with Titan, evaluate alternatives (Cohere, OpenAI) if needed

### Risk 4: Stale Knowledge
**Problem:** Knowledge Base not updated with new runbooks  
**Mitigation:** Manual ingestion process with human approval (by design)

---

## Success Metrics

| Metric | Target | Validation |
|--------|--------|------------|
| Ingestion success rate | 100% | All chunks ingested |
| Retrieval latency | < 2s | P95 latency |
| Retrieval relevance | > 80% | Human evaluation |
| Citation accuracy | 100% | Metadata preserved |
| Cost per incident | < $0.01 | CloudWatch billing |

---

## Dependencies

### Upstream (Must Complete First)
- ✅ Phase 7.1: Knowledge corpus curated
- ✅ Phase 7.2: Deterministic chunking implemented

### Downstream (Blocked Until This Completes)
- ⏸️ Phase 7.4: Agent integration

---

## Deliverables

1. **CDK construct** (`infra/constructs/bedrock-knowledge-base.ts`)
2. **S3 bucket** (opx-knowledge-corpus)
3. **OpenSearch collection** (opx-knowledge)
4. **Bedrock Knowledge Base** (opx-knowledge-base)
5. **IAM roles** (BedrockKnowledgeBaseIngestionRole, BedrockKnowledgeBaseRuntimeRole, KnowledgeRAGAgentRole)
6. **Ingestion script** (`scripts/ingest-knowledge-base.sh`)
7. **Validation tests** (retrieval quality, citation accuracy)

---

## Non-Goals (Explicit Exclusions)

❌ **Automatic ingestion** - No S3 event triggers, no Lambda automation  
❌ **Real-time updates** - No live sync, manual ingestion only  
❌ **Multi-region deployment** - Single region (us-east-1)  
❌ **Custom embeddings** - No fine-tuned models, use Titan as-is  
❌ **Feedback loops** - No retrieval quality learning, no auto-tuning  

---

## Approval Gates

### Design Review
- [ ] Architecture approved by Principal Architect
- [ ] Cost estimate approved ($350/month)
- [ ] IAM permissions approved (read-only for agents)
- [ ] Ingestion process approved (manual trigger)

### Implementation Review
- [ ] CDK construct deployed successfully
- [ ] Ingestion job completes successfully
- [ ] Retrieval validation passing
- [ ] Integration tests passing

---

**STATUS:** ✅ CHANGES APPLIED - READY FOR APPROVAL  
**IMPLEMENTATION:** BLOCKED UNTIL APPROVED

**Changes Applied:**
1. ✅ Split OpenSearch data access into ingestion (write) and runtime (read-only) roles
2. ✅ Renamed S3 bucket from `opx-knowledge-base` to `opx-knowledge-corpus` (prevents naming collision)
3. ✅ Changed search type from HYBRID to VECTOR (deterministic, no keyword scoring variance)

---

**Created:** January 26, 2026  
**Updated:** January 27, 2026  
**Authority:** Principal Architect  
**Next Phase:** Phase 7.4 (Agent Integration)
