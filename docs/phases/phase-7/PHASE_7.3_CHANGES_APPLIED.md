# Phase 7.3 Changes Applied ✅

**Date:** January 27, 2026  
**Status:** CHANGES APPLIED - READY FOR APPROVAL  
**Authority:** Principal Architect

---

## Summary

All three required architectural corrections have been applied to Phase 7.3 (Bedrock Knowledge Base Deployment). The design now preserves determinism, security boundaries, and cost discipline.

---

## Required Changes (ALL APPLIED ✅)

### 1. OpenSearch Data Access Policy Split ✅

**Problem:** Over-permissive data access policy violated fail-closed principles
- Single role had both read and write permissions
- Runtime retrieval had unnecessary write access

**Solution Applied:**

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

**Security Boundaries:**
- Ingestion role: Write access ONLY during ingestion jobs
- Runtime role: Read-only access during retrieval
- Agent role: Can only retrieve, cannot ingest or mutate
- No role has both read and write permissions

**Files Updated:**
- `docs/phase-7/phase-7.3-bedrock-knowledge-base.md` (OpenSearch configuration)
- `docs/phase-7/phase-7.3-bedrock-knowledge-base.md` (IAM roles section)

---

### 2. S3 Bucket Renamed to Prevent Collision ✅

**Problem:** Naming collision between S3 bucket and Knowledge Base
- S3 bucket: `opx-knowledge-base`
- Knowledge Base: `opx-knowledge-base`
- Caused operational confusion in logs, metrics, and IAM policies

**Solution Applied:**

**Before:**
- S3 bucket: `opx-knowledge-base`
- Knowledge Base: `opx-knowledge-base`

**After:**
- S3 bucket: `opx-knowledge-corpus` (raw truth, source of record)
- Knowledge Base: `opx-knowledge-base` (embedded view, search index)

**Semantic Clarity:**
- Corpus = raw truth (chunked documents)
- Knowledge Base = embedded view (vector search index)

**Files Updated:**
- `docs/phase-7/phase-7.3-bedrock-knowledge-base.md` (S3 bucket structure)
- `docs/phase-7/phase-7.3-bedrock-knowledge-base.md` (Architecture diagram)
- `docs/phase-7/phase-7.3-bedrock-knowledge-base.md` (Data source configuration)
- `docs/phase-7/phase-7.3-bedrock-knowledge-base.md` (Ingestion process)
- `docs/phase-7/phase-7.3-bedrock-knowledge-base.md` (IAM roles)
- `docs/phase-7/phase-7.3-bedrock-knowledge-base.md` (Response format example)
- `docs/phase-7/phase-7.3-bedrock-knowledge-base.md` (Deliverables)

---

### 3. Search Type Changed from HYBRID to VECTOR ✅

**Problem:** Hybrid search introduces keyword scoring variance
- Keyword scoring can change across OpenSearch versions
- Violates determinism requirements
- No justification provided for why vector-only is insufficient

**Solution Applied:**

**Before:**
```typescript
{
  retrievalConfiguration: {
    vectorSearchConfiguration: {
      numberOfResults: 5,
      overrideSearchType: "HYBRID"  // Vector + keyword search
    }
  }
}
```

**After:**
```typescript
{
  retrievalConfiguration: {
    vectorSearchConfiguration: {
      numberOfResults: 5,
      overrideSearchType: "VECTOR"  // Vector-only search (deterministic)
    }
  }
}
```

**Rationale:**
- VECTOR-only search chosen for determinism
- Hybrid search introduces keyword scoring variance across versions
- Vector embeddings provide sufficient semantic matching
- If retrieval quality is insufficient, we can re-evaluate with explicit justification

**Files Updated:**
- `docs/phase-7/phase-7.3-bedrock-knowledge-base.md` (Retrieval configuration)

---

## What Was Already Correct (No Changes)

✅ **Architecture**
- Clean separation: Corpus → Chunking → KB → Agent
- Correct use of Bedrock Knowledge Base
- Correct choice of Titan embeddings
- Chunking strategy correctly set to NONE
- Manual ingestion enforced
- Agent is read-only (no mutation authority)

✅ **Determinism**
- Pre-chunked JSONL
- Stable chunk IDs
- No runtime chunking
- Replay safety preserved

✅ **IAM Intent**
- Explicit DENY for ingestion on agent role
- No execution authority leaks
- Human-triggered ingestion only

---

## Updated Architecture

```
Knowledge Corpus (Git)
  ↓ (manual ingestion)
Chunking Pipeline (Phase 7.2)
  ↓ (JSONL output)
S3 Bucket (opx-knowledge-corpus)  ← RENAMED
  ↓ (sync trigger)
Bedrock Knowledge Base (opx-knowledge-base)
  ↓ (embedding)
Titan Embeddings Model
  ↓ (vector storage)
OpenSearch Serverless Collection
  ↓ (semantic search - VECTOR ONLY)  ← CHANGED
Knowledge RAG Agent (Phase 6)
  ↓ (citations)
Advisory Recommendations
```

---

## IAM Roles Summary

| Role | Purpose | OpenSearch Access | S3 Access | Usage |
|------|---------|-------------------|-----------|-------|
| BedrockKnowledgeBaseIngestionRole | Ingestion | Write (aoss:APIAccessAll) | Read | Ingestion jobs only |
| BedrockKnowledgeBaseRuntimeRole | Retrieval | Read (aoss:ReadDocument) | None | Runtime queries |
| KnowledgeRAGAgentRole | Agent queries | None (via Bedrock API) | None | Agent retrieval |

**Security Boundaries:**
- No role has both read and write permissions to OpenSearch
- Ingestion role used ONLY during ingestion jobs
- Runtime role used ONLY during retrieval
- Agent role cannot trigger ingestion or mutate data

---

## Deliverables Updated

1. **CDK construct** (`infra/constructs/bedrock-knowledge-base.ts`)
2. **S3 bucket** (`opx-knowledge-corpus`) ← RENAMED
3. **OpenSearch collection** (`opx-knowledge`)
4. **Bedrock Knowledge Base** (`opx-knowledge-base`)
5. **IAM roles** (BedrockKnowledgeBaseIngestionRole, BedrockKnowledgeBaseRuntimeRole, KnowledgeRAGAgentRole) ← SPLIT
6. **Ingestion script** (`scripts/ingest-knowledge-base.sh`)
7. **Validation tests** (retrieval quality, citation accuracy)

---

## Validation Checklist

### Security ✅
- [x] Ingestion role has write access (aoss:APIAccessAll)
- [x] Runtime role has read-only access (aoss:ReadDocument)
- [x] No role has both read and write permissions
- [x] Agent role cannot trigger ingestion

### Naming ✅
- [x] S3 bucket renamed to `opx-knowledge-corpus`
- [x] Knowledge Base remains `opx-knowledge-base`
- [x] No naming collisions in logs, metrics, or IAM policies

### Determinism ✅
- [x] Search type set to VECTOR (no keyword scoring variance)
- [x] Rationale documented for vector-only search
- [x] Hybrid search disabled

---

## Cost Impact

**No change to cost estimate:**
- OpenSearch Serverless: $350/month (2 OCU)
- S3: $0.02/month (1 GB)
- Embeddings: $0.05 one-time
- Retrieval: $0.000005 per query

**Total:** ~$350/month

---

## Next Steps

### Immediate
1. ✅ Submit Phase 7.3 for approval (changes applied)
2. ⏸️ Await Principal Architect approval
3. ⏸️ Proceed with implementation once approved

### Implementation (After Approval)
1. Create CDK construct for Bedrock Knowledge Base
2. Deploy S3 bucket (`opx-knowledge-corpus`)
3. Deploy OpenSearch Serverless collection
4. Create IAM roles (ingestion + runtime)
5. Configure Bedrock Knowledge Base
6. Test ingestion pipeline
7. Validate retrieval quality

---

## Approval Status

**Before:** ❌ CHANGES REQUIRED (MINOR, BUT MANDATORY)  
**After:** ✅ CHANGES APPLIED - READY FOR APPROVAL

**Blockers Resolved:**
1. ✅ OpenSearch data access policy split (fail-closed)
2. ✅ S3 bucket renamed (no naming collision)
3. ✅ Search type changed to VECTOR (deterministic)

---

**Status:** ✅ CHANGES APPLIED  
**Implementation:** BLOCKED UNTIL APPROVED  
**Next Action:** Await Principal Architect approval

---

**Created:** January 27, 2026  
**Authority:** Principal Architect  
**Next Phase:** Phase 7.3 Implementation (after approval)

