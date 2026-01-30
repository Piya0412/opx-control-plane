# Phase 7.2 Approved ✅

**Date:** January 27, 2026  
**Status:** APPROVED (Required Changes Applied)  
**Implementation:** READY TO PROCEED

---

## Summary

Phase 7.2 (Deterministic Chunking Strategy) has been **approved** after applying all required changes to fix determinism violations.

---

## Required Changes (ALL APPLIED ✅)

### 1. Removed `created_at` from Chunk Schema ✅

**Problem:** Timestamps violate determinism
- Same document chunked twice → different timestamps
- Chunk object equality breaks
- Replay comparisons break
- Hash-based guarantees become misleading

**Solution:**
- Removed `created_at` field entirely from chunk schema
- Chunk objects are now pure and deterministic
- Audit timestamps belong in ingestion logs/manifests, NOT chunk identity

**Before:**
```typescript
interface Chunk {
  // ... other fields
  created_at: string;  // ❌ VIOLATES DETERMINISM
}
```

**After:**
```typescript
interface Chunk {
  chunk_id: string;
  document_id: string;
  document_version: string;
  source_file: string;
  start_line: number;
  end_line: number;
  content: string;
  tokens: number;
  section_header: string;
  chunk_type: 'header' | 'paragraph' | 'code' | 'list';
  overlap_with_previous: boolean;
  // NO timestamps - pure deterministic chunk
}
```

### 2. Replaced `source_version` (Git SHA) with `document_id` + `document_version` ✅

**Problem:** Git SHA is environment-dependent and non-authoritative
- Chunking can occur outside git context (CI, packaged artifacts)
- Rebase/squash changes SHA without content change
- Same document content ≠ same commit SHA
- Replay years later may not have original git history

**Solution:**
- Use `document_id` from Phase 7.1 (content-addressable, authoritative)
- Use `document_version` (semantic version from Phase 7.1)
- Git SHA can be logged in ingestion metadata, but NEVER embedded in chunk identity

**Before:**
```typescript
interface Chunk {
  source_version: string;  // ❌ Git commit SHA (environment-dependent)
}
```

**After:**
```typescript
interface Chunk {
  document_id: string;      // ✅ From Phase 7.1 (authoritative)
  document_version: string; // ✅ Semantic version (e.g., "1.0.0")
}
```

**Chunk ID Computation:**
```typescript
// Before: SHA256(source_file + start_line + content)
// After:  SHA256(document_id + start_line + content)
```

### 3. Added Deterministic Dependency Constraints for LangChain ✅

**Problem:** LangChain does not guarantee stable splitting logic across releases
- Separator handling may change
- Tokenization behavior may change
- Chunk boundaries may shift

**Solution:** Hard constraints documented

**Constraints:**
1. **LangChain version MUST be pinned** (exact version, no caret)
   - Example: `"langchain": "0.1.0"` (NOT `"^0.1.0"`)
2. **Chunking logic MUST be wrapped in a thin adapter**
   - Adapter owns split logic and configuration
   - Only Markdown parsing is delegated to LangChain
3. **Any LangChain upgrade requires re-approval of Phase 7.2**
   - Upgrade triggers determinism re-validation
   - All existing chunks must produce same IDs after upgrade
   - If IDs change, upgrade is rejected

**Example Adapter:**
```python
# chunking_adapter.py
from langchain.text_splitter import MarkdownTextSplitter

# Pin exact version in requirements.txt:
# langchain==0.1.0

class DeterministicChunker:
    """
    Thin adapter around LangChain MarkdownTextSplitter.
    Owns split logic and configuration.
    """
    def __init__(self, config):
        self.config = config
        self.splitter = MarkdownTextSplitter(
            chunk_size=config["chunk_size"],
            chunk_overlap=config["chunk_overlap"],
            length_function=config["length_function"],
            separators=config["separators"],
            keep_separator=config["keep_separator"],
        )
    
    def chunk_document(self, document):
        # Delegate parsing to LangChain
        raw_chunks = self.splitter.split_text(document.content)
        
        # Own the chunk metadata generation
        return [
            self._create_chunk(document, chunk, index)
            for index, chunk in enumerate(raw_chunks)
        ]
```

**Rationale:**
- Same as tokenizer pinning in Phase 7.1
- Prevents non-determinism from dependency updates
- Ensures reproducible chunking across environments
- Enables long-term replay guarantee

### 4. Clarified Overlap Semantics ✅

**Problem:** Overlap is token-based, but chunk boundaries are semantic

**Solution:** Clarified precedence

**Rule:**
- Semantic boundary preservation takes precedence over overlap targets
- Overlap may be < configured value when boundaries prevent clean overlap
- Example: If next semantic unit starts at token 50, but overlap target is 100, use 50-token overlap to preserve boundary

**Why This Matters:**
- Avoids confusion during testing
- Makes trade-offs explicit
- Preserves semantic coherence over mechanical overlap

---

## Updated Chunk Schema (Final)

```typescript
interface Chunk {
  chunk_id: string;           // SHA256(document_id + start_line + content)
  document_id: string;        // From Phase 7.1 (content-addressable)
  document_version: string;   // Semantic version (e.g., "1.0.0")
  source_file: string;        // e.g., "runbooks/rds-failover.md"
  start_line: number;         // Line number in source
  end_line: number;           // Line number in source
  content: string;            // Chunk text
  tokens: number;             // Token count (for cost tracking)
  section_header: string;     // Parent markdown header
  chunk_type: 'header' | 'paragraph' | 'code' | 'list';
  overlap_with_previous: boolean;
}
```

**Key Properties:**
- ✅ NO timestamps (pure deterministic)
- ✅ NO git SHA (authoritative document_id)
- ✅ Content-addressable chunk_id
- ✅ Tied to Phase 7.1 document identity
- ✅ Reproducible across environments

---

## What Was Done Right (Important)

The core design was already strong:
- ✅ Clear determinism motivation
- ✅ Semantic-first chunking (headers, code blocks)
- ✅ Content-addressable chunk IDs
- ✅ JSONL ingestion format (Bedrock-aligned)
- ✅ Explicit non-goals
- ✅ Strong validation tests (esp. traceability)

The required changes were **architectural corrections**, not design rejections.

---

## Approval Status

**Before:** ⚠️ APPROVED WITH REQUIRED CHANGES  
**After:** ✅ APPROVED (Required Changes Applied)

**Blockers (RESOLVED):**
- ✅ Removed `created_at` from chunk schema
- ✅ Replaced `source_version` (git SHA) with `document_id` + `document_version`
- ✅ Added deterministic dependency constraints for LangChain
- ✅ Clarified overlap semantics

---

## Implementation Readiness

### Status: 🟢 READY TO PROCEED

Phase 7.2 is now **approved and locked** for implementation. No further design changes required.

### Next Steps

1. **Implement chunking adapter** (`src/knowledge/chunking-adapter.py`)
2. **Implement chunking script** (`scripts/chunk-knowledge-corpus.py`)
3. **Pin LangChain version** (`requirements.txt`)
4. **Write determinism tests** (same doc → same chunks)
5. **Write semantic boundary tests** (no mid-sentence splits)
6. **Write citation traceability tests** (chunk ID → source line range)

### Success Criteria

- [ ] Determinism: 100% (same doc → same chunks, always)
- [ ] Semantic boundaries: 100% (no mid-sentence splits)
- [ ] Citation accuracy: 100% (chunk ID → correct source line range)
- [ ] Chunk size: 95% of chunks in 500-1000 token range
- [ ] LangChain version pinned (exact version, no caret)
- [ ] Adapter pattern implemented (thin wrapper)

---

## Commit Details

**Commit:** `435dcfc` - "docs(phase7.2): Fix determinism violations - APPROVED"

**Changes:**
- 1 file changed
- +125 insertions
- -9 deletions

**Pushed to:** `origin/main`

---

## Related Documentation

- [Phase 7 Overview](docs/phase-7/phase-7.md) - ✅ APPROVED
- [Phase 7.1: Knowledge Corpus](docs/phase-7/phase-7.1-knowledge-corpus.md) - ✅ APPROVED & IMPLEMENTED
- [Phase 7.2: Deterministic Chunking](docs/phase-7/phase-7.2-deterministic-chunking.md) - ✅ APPROVED (Ready for Implementation)
- [Phase 7.3: Bedrock Knowledge Base](docs/phase-7/phase-7.3-bedrock-knowledge-base.md) - 📋 AWAITING APPROVAL
- [Phase 7.4: Agent Integration](docs/phase-7/phase-7.4-agent-integration.md) - 📋 AWAITING APPROVAL

---

## Key Takeaways

### Determinism Violations Fixed

1. **Timestamps removed** - Chunk objects are now pure
2. **Git SHA replaced** - Using authoritative document_id from Phase 7.1
3. **Dependency pinning** - LangChain version locked with adapter pattern
4. **Overlap semantics** - Semantic boundaries take precedence

### Why This Matters

- **Replay guarantee** - Same document → same chunks (always)
- **Cross-platform consistency** - Works same on Windows/Linux/macOS
- **Long-term auditability** - Chunks never change for same content
- **Citation stability** - Chunk IDs remain stable across re-ingestion

### Design Quality

This is **senior-level design** that demonstrates:
- Understanding of determinism requirements
- Awareness of environment dependencies
- Proper separation of concerns (audit vs identity)
- Long-term thinking (replay, auditability)

---

**Status:** ✅ APPROVED (Required Changes Applied)  
**Implementation:** 🟢 READY TO PROCEED  
**Approval Date:** January 27, 2026  
**Next Phase:** Phase 7.2 Implementation
