# Phase 7: Knowledge Base & RAG

**Status:** ✅ COMPLETE (7.1-7.4), ⏸️ DEFERRED (7.5)  
**Completion Date:** 2026-01-27  
**Version:** 1.0.0

---

## Overview

Phase 7 implements a Bedrock Knowledge Base with deterministic chunking, semantic search, and RAG integration for runbook and postmortem retrieval - providing institutional memory to Phase 6 agents.

## Sub-Phases

### Phase 7.1: Knowledge Corpus Foundation ✅

**Objective:** Define document schema and storage

**Deliverables:**
- Document schema with deterministic IDs
- S3 bucket (`opx-knowledge-corpus`)
- DynamoDB metadata table (`opx-knowledge-documents`)
- 5 curated documents (3 runbooks, 2 postmortems)

**Document Types:**
- **Runbooks** - Operational procedures for common issues
- **Postmortems** - Incident analyses and lessons learned

**Document Schema:**
```typescript
interface KnowledgeDocument {
  documentId: string;           // Deterministic hash
  title: string;
  category: 'runbook' | 'postmortem';
  tags: string[];
  s3Location: string;
  metadata: {
    author: string;
    version: string;
    lastUpdated: string;
  };
  createdAt: string;
}
```

**Document ID Generation:**
```typescript
documentId = hash(title, category, content)
```

### Phase 7.2: Deterministic Chunking ✅

**Objective:** Transform documents into searchable chunks

**Deliverables:**
- Chunk schema (NO timestamps, NO git SHA)
- LangChain 0.3.7 chunking adapter
- 12 chunks generated (500 tokens, 10% overlap)

**Chunking Strategy:**
- Fixed token size: 500 tokens
- Overlap: 10% (50 tokens)
- Deterministic: Same document → same chunks
- Metadata preserved per chunk

**Chunk Schema:**
```typescript
interface DocumentChunk {
  chunkId: string;              // Deterministic hash
  documentId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata: {
    documentTitle: string;
    category: string;
    tags: string[];
  };
}
```

**Chunk Storage:**
- S3: `chunks/` prefix
- Format: JSONL (one chunk per line)
- Naming: `{documentId}.jsonl`

**Chunking Algorithm:**
```python
def chunk_document(document: str, chunk_size: int = 500, overlap: int = 50):
    """Deterministic chunking with fixed size and overlap"""
    tokens = tokenize(document)
    chunks = []
    
    for i in range(0, len(tokens), chunk_size - overlap):
        chunk_tokens = tokens[i:i + chunk_size]
        chunk_text = detokenize(chunk_tokens)
        chunk_id = hash(document_id, i, chunk_text)
        
        chunks.append({
            'chunkId': chunk_id,
            'chunkIndex': i // (chunk_size - overlap),
            'content': chunk_text,
            'tokenCount': len(chunk_tokens)
        })
    
    return chunks
```

### Phase 7.3: Bedrock Knowledge Base ✅

**Objective:** Deploy searchable knowledge base

**Deliverables:**
- OpenSearch Serverless collection
- Bedrock Knowledge Base (ID: HJPLE9IOEU)
- SEMANTIC search (vector-only)
- 5 documents indexed

**Configuration:**
- **Embedding model:** Titan Embeddings G1
- **Vector dimensions:** 1536
- **Search type:** SEMANTIC (vector similarity)
- **Max results:** 5
- **Minimum relevance:** 0.7

**OpenSearch:**
- Collection: `opx-knowledge-base`
- Index: Auto-managed by Bedrock
- Encryption: AWS-managed keys
- Backup: Automated snapshots

**Ingestion:**
- Manual ingestion only (no auto-sync)
- Chunks uploaded to S3
- Bedrock syncs from S3
- Metadata preserved

### Phase 7.4: RAG Integration ✅

**Objective:** Integrate knowledge base with agents

**Deliverables:**
- Action group Lambda (`knowledge_retrieval.py`)
- Read-only IAM permissions
- Citation formatting
- Graceful degradation

**Action Group Functions:**

1. **search_runbooks**
   ```python
   def search_runbooks(query: str, max_results: int = 5) -> List[Document]:
       """Search runbook knowledge base"""
       results = bedrock_kb.retrieve(
           knowledgeBaseId=KB_ID,
           retrievalQuery={'text': query},
           retrievalConfiguration={
               'vectorSearchConfiguration': {
                   'numberOfResults': max_results,
                   'filter': {'equals': {'key': 'category', 'value': 'runbook'}}
               }
           }
       )
       return format_results(results)
   ```

2. **search_postmortems**
   ```python
   def search_postmortems(query: str, max_results: int = 5) -> List[Document]:
       """Search postmortem knowledge base"""
       # Similar to search_runbooks with category='postmortem'
   ```

3. **get_document_details**
   ```python
   def get_document_details(document_id: str) -> Document:
       """Retrieve full document by ID"""
       # Query DynamoDB for metadata
       # Retrieve from S3 if needed
   ```

**Citation Formatting:**
```python
def format_citation(result: dict) -> str:
    """Format knowledge base result as citation"""
    return f"""
    Source: {result['metadata']['title']}
    Category: {result['metadata']['category']}
    Relevance: {result['score']:.2f}
    
    {result['content']}
    
    [Document ID: {result['documentId']}]
    """
```

**Graceful Degradation:**
- Knowledge base unavailable → Return empty results
- Low relevance scores → Filter out results < 0.7
- Timeout → Return partial results
- Error → Log and continue without KB results

### Phase 7.5: Operational Queries ⏸️ DEFERRED

**Status:** Deferred to future phase

**Planned Features:**
- CloudWatch Logs Insights queries
- Metric correlation queries
- Trace analysis queries

**Rationale:** Focus on core RAG functionality first

## Architecture

```
Knowledge Documents (S3)
    ↓
Deterministic Chunking
    ↓
Chunks (S3 JSONL)
    ↓
Bedrock Knowledge Base
    ↓
OpenSearch Serverless
    ↓
Vector Search
    ↓
RAG Agent (Phase 6)
```

## Data Flow

1. **Ingestion:**
   - Human uploads document to S3
   - Chunking script processes document
   - Chunks uploaded to S3
   - Bedrock syncs chunks to OpenSearch
   - Metadata stored in DynamoDB

2. **Retrieval:**
   - Agent queries knowledge base
   - Bedrock performs vector search
   - Results ranked by relevance
   - Citations formatted
   - Results returned to agent

## Tables

### opx-knowledge-documents
- Partition key: `documentId`
- GSI: `category-lastUpdated-index`
- GSI: `tags-index`
- TTL: None

## Storage

### S3 Bucket: opx-knowledge-corpus

**Structure:**
```
opx-knowledge-corpus/
├── documents/
│   ├── runbooks/
│   │   ├── api-gateway-5xx.md
│   │   ├── rds-failover.md
│   │   └── lambda-timeout.md
│   └── postmortems/
│       ├── 2024-01-rds-incident.md
│       └── 2024-02-lambda-cold-start.md
└── chunks/
    ├── {documentId1}.jsonl
    ├── {documentId2}.jsonl
    └── ...
```

## Observability

### Metrics
- Knowledge base query rate
- Query latency
- Relevance scores
- Cache hit rate

### Alarms
- High query latency (>2s)
- Low relevance scores (<0.5 avg)
- Knowledge base unavailable

### Dashboards
- Knowledge Base Performance
- Query Analytics
- Document Coverage

## Testing

### Unit Tests
- Document chunking: 15 tests
- Citation formatting: 10 tests
- Query construction: 12 tests

### Integration Tests
- End-to-end retrieval: 10 tests
- Knowledge base sync: 5 tests
- Graceful degradation: 8 tests

## Deployment

**Stack:** OpxPhase7Stack  
**Region:** us-east-1  
**Status:** DEPLOYED

**Resources:**
- 1 S3 bucket
- 1 DynamoDB table
- 1 OpenSearch Serverless collection
- 1 Bedrock Knowledge Base
- 1 Lambda function (action group)
- IAM roles and policies

## Cost

**Monthly:** ~$50-80
- OpenSearch Serverless: $30-50
- Bedrock KB: $10-20
- S3: $2-5
- DynamoDB: $3-5
- Lambda: $2-3

## Security

- S3 bucket encryption
- OpenSearch encryption at rest
- IAM-only access
- No public access
- VPC endpoints (optional)

## Limitations

- **Manual ingestion only** - No auto-sync from external sources
- **No versioning** - Document updates create new documents
- **No deletion** - Documents are permanent
- **Read-only** - Agents cannot modify knowledge base

## Future Enhancements (Deferred)

- Automatic document versioning
- Document expiration policies
- Multi-language support
- Advanced query operators
- Hybrid search (vector + keyword)

---

**Last Updated:** 2026-01-31
