# Phase 7: Knowledge Base & RAG

**Status:** ✅ COMPLETE (7.1-7.4), ⏸️ DEFERRED (7.5)  
**Completion Date:** 2026-01-27  
**Version:** 1.0.0

---

## Overview

Phase 7 implements a Bedrock Knowledge Base with deterministic chunking, semantic search, and RAG integration for runbook and postmortem retrieval.

## Sub-Phases

### Phase 7.1: Knowledge Corpus Foundation ✅

**Deliverables:**
- Document schema with deterministic IDs
- S3 bucket (`opx-knowledge-corpus`)
- DynamoDB metadata table (`opx-knowledge-documents`)
- 5 curated documents (3 runbooks, 2 postmortems)

**Document Types:**
- Runbooks (operational procedures)
- Postmortems (incident analyses)

**Schema:**
- Document ID (deterministic hash)
- Title, category, tags
- S3 location
- Metadata (author, version, last updated)

### Phase 7.2: Deterministic Chunking ✅

**Deliverables:**
- Chunk schema (NO timestamps, NO git SHA)
- LangChain 0.3.7 chunking adapter
- 12 chunks generated (500 tokens, 10% overlap)

**Chunking Strategy:**
- Fixed token size: 500 tokens
- Overlap: 10% (50 tokens)
- Deterministic: Same document → same chunks
- Metadata preserved per chunk

**Chunk Storage:**
- S3: `chunks/` prefix
- Format: JSONL (one chunk per line)

### Phase 7.3: Bedrock Knowledge Base ✅

**Deliverables:**
- OpenSearch Serverless collection
- Bedrock Knowledge Base (ID: HJPLE9IOEU)
- SEMANTIC search (vector-only)
- 5 documents indexed

**Configuration:**
- Embedding model: Titan Embeddings G1
- Vector dimensions: 1536
- Search type: SEMANTIC (vector similarity)
- Max results: 5

**OpenSearch:**
- Collection: `opx-knowledge-base`
- Index: Auto-managed by Bedrock
- Encryption: AWS-managed keys

### Phase 7.4: RAG Integration ✅

**Deliverables:**
- Action group Lambda (`knowledge_retrieval.py`)
- Read-only IAM permissions
- Citation formatting
- Graceful degradation

**Features:**
- Query knowledge base
- Format citations
- Handle failures gracefully
- Return empty results on error

**Integration:**
- Called by Knowledge RAG Agent
- Returns top 5 relevant chunks
- Includes source document metadata
- Preserves citation chain

### Phase 7.5: KB Monitoring ⏸️ DEFERRED

**Status:** Design approved, implementation deferred

**Planned Features:**
- Retrieval quality metrics
- Query latency tracking
- Cache hit rates
- Document freshness alerts

**Reason for Deferral:** Core functionality complete, monitoring is enhancement

**Estimated Effort:** 2-3 days when needed

## Architecture

### Data Flow

```
Documents → S3 → Chunking → S3 (chunks) → Bedrock KB → OpenSearch
                                                ↓
                                          RAG Agent
```

### Storage

**S3 Bucket:** `opx-knowledge-corpus`
- `documents/` - Original documents
- `chunks/` - Chunked documents (JSONL)
- `chunks-bedrock/` - Bedrock-formatted chunks

**DynamoDB:** `opx-knowledge-documents`
- Document metadata
- Chunk count
- Last updated timestamp

**OpenSearch Serverless:**
- Vector embeddings
- Semantic search index
- Managed by Bedrock

## Implementation

### Document Ingestion

1. Upload document to S3 (`documents/`)
2. Generate deterministic document ID
3. Store metadata in DynamoDB
4. Trigger chunking process

### Chunking Process

1. Load document from S3
2. Split into 500-token chunks (10% overlap)
3. Generate chunk IDs (deterministic)
4. Write chunks to S3 (`chunks/`)
5. Format for Bedrock (`chunks-bedrock/`)

### Knowledge Base Sync

1. Bedrock monitors S3 bucket
2. Auto-ingests new chunks
3. Generates embeddings (Titan)
4. Indexes in OpenSearch
5. Available for search

### RAG Query

1. Agent calls `knowledge_retrieval` action
2. Lambda queries Bedrock KB
3. Bedrock searches OpenSearch
4. Returns top 5 chunks with citations
5. Agent formats response

## Design Principles

1. **Deterministic** - Same document → same chunks
2. **Immutable** - No timestamps in chunk content
3. **Semantic search** - Vector similarity only
4. **Graceful degradation** - Failures don't block agents
5. **Citation chain** - Full traceability

## Validation

**Test Coverage:** 61 tests passing

**Key Tests:**
- Document schema validation
- Chunk determinism
- Knowledge base queries
- Citation formatting
- Error handling

## Deployment

**Stack:** OpxPhase6Stack

**Resources:**
- S3 bucket
- DynamoDB table
- OpenSearch Serverless collection
- Bedrock Knowledge Base
- Action group Lambda

## Cost Analysis

**Monthly Costs:**
- OpenSearch Serverless: ~$350/month (fixed)
- S3 storage: ~$1/month
- DynamoDB: ~$1/month
- Bedrock KB queries: Variable (~$0.01 per query)

**Total Fixed:** ~$352/month

## References

- Phase 7.1: `phase-7.1-knowledge-corpus.md` (consolidated)
- Phase 7.2: `phase-7.2-deterministic-chunking.md` (consolidated)
- Phase 7.3: `phase-7.3-bedrock-knowledge-base.md` (consolidated)
- Phase 7.4: `phase-7.4-agent-integration.md` (consolidated)
- Phase 7.5: `PHASE_7.5_DESIGN_PLAN.md` (deferred)
- Deployment: `PHASE_7.3_DEPLOYMENT.md` (consolidated)
- Queries: `PHASE_7.5_LOGS_INSIGHTS_QUERIES.md`

---

**Last Updated:** 2026-01-29  
**Status:** Production-ready (7.1-7.4), monitoring deferred (7.5)
