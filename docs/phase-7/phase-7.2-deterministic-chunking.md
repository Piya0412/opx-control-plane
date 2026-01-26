# Phase 7.2: Deterministic Chunking Strategy

**Phase:** 7.2 (Knowledge Base - Deterministic Chunking)  
**Authority:** Principal Architect  
**Depends On:** Phase 7.1 (Knowledge Corpus)

---

## Objective

Implement a **deterministic, reproducible chunking strategy** for knowledge documents that enables:
1. Consistent chunk boundaries across re-ingestion
2. Semantic coherence within chunks
3. Citation traceability to source documents
4. Version-controlled chunk definitions

---

## Problem Statement

### Why Chunking Matters

Bedrock Knowledge Base uses vector embeddings for semantic search. The quality of search results depends critically on:
- **Chunk size** - Too large: poor retrieval precision. Too small: loss of context.
- **Chunk boundaries** - Random splits break semantic units (paragraphs, sections, code blocks).
- **Overlap** - Prevents context loss at boundaries but increases storage/cost.

### Why Determinism Matters

**Non-deterministic chunking breaks:**
- Reproducibility (same doc → different chunks on re-ingestion)
- Citation accuracy (chunk IDs change, breaking references)
- Version control (can't diff chunk changes)
- Debugging (can't reproduce retrieval issues)

**Deterministic chunking enables:**
- Stable chunk IDs (hash of content + position)
- Reproducible ingestion (same input → same chunks)
- Auditable changes (git diff shows chunk modifications)
- Reliable citations (chunk IDs never change for same content)

---

## Design Principles

### 1. Semantic Boundaries ✅
- Respect markdown structure (headers, paragraphs, code blocks)
- Never split mid-sentence
- Never split code blocks
- Preserve list items together

### 2. Deterministic Output ✅
- Same input document → same chunks (always)
- Chunk IDs are content-addressable (hash-based)
- No randomness, no timestamps in chunk generation
- Version-controlled chunking rules

### 3. Citation Traceability ✅
- Every chunk links to source document + line range
- Chunk metadata includes: `source_file`, `start_line`, `end_line`, `chunk_hash`
- Agents can cite: "According to [Runbook X, lines 45-67]..."

### 4. Configurable Strategy ✅
- Chunk size: 500-1000 tokens (configurable)
- Overlap: 50-100 tokens (configurable)
- Strategy: Markdown-aware (respects structure)

---

## Chunking Strategy

### Markdown-Aware Hierarchical Chunking

```
Document
  ↓
Parse Markdown AST (headers, paragraphs, code blocks, lists)
  ↓
Group by semantic units (sections under headers)
  ↓
Split large sections (if > max_chunk_size)
  ↓
Add overlap (last N tokens of previous chunk)
  ↓
Generate chunk metadata (hash, source, line range)
  ↓
Output chunks with stable IDs
```

### Chunk Metadata Schema

```typescript
interface Chunk {
  chunk_id: string;           // SHA256(source_file + start_line + content)
  source_file: string;        // e.g., "runbooks/rds-failover.md"
  source_version: string;     // Git commit SHA
  start_line: number;         // Line number in source
  end_line: number;           // Line number in source
  content: string;            // Chunk text
  tokens: number;             // Token count (for cost tracking)
  section_header: string;     // Parent markdown header
  chunk_type: 'header' | 'paragraph' | 'code' | 'list';
  overlap_with_previous: boolean;
  created_at: string;         // ISO timestamp (for audit only)
}
```

### Chunking Rules

1. **Headers** - Always start a new chunk
2. **Paragraphs** - Keep together if < max_chunk_size
3. **Code blocks** - Never split (even if > max_chunk_size)
4. **Lists** - Keep together if < max_chunk_size
5. **Tables** - Keep together if < max_chunk_size
6. **Overlap** - Last 50-100 tokens of previous chunk prepended

### Example

**Input Document:**
```markdown
# RDS Failover Runbook

## Symptoms
- High latency on primary
- Connection timeouts
- Replication lag > 60s

## Diagnosis
Check CloudWatch metrics:
- `DatabaseConnections`
- `ReplicaLag`
- `CPUUtilization`

## Resolution
1. Verify replica health
2. Initiate failover
3. Update DNS records
```

**Output Chunks:**

**Chunk 1:**
```json
{
  "chunk_id": "a3f5e8...",
  "source_file": "runbooks/rds-failover.md",
  "start_line": 1,
  "end_line": 5,
  "content": "# RDS Failover Runbook\n\n## Symptoms\n- High latency...",
  "section_header": "RDS Failover Runbook",
  "chunk_type": "header"
}
```

**Chunk 2:**
```json
{
  "chunk_id": "b7c2d1...",
  "source_file": "runbooks/rds-failover.md",
  "start_line": 5,
  "end_line": 10,
  "content": "## Diagnosis\nCheck CloudWatch metrics...",
  "section_header": "Diagnosis",
  "chunk_type": "header",
  "overlap_with_previous": true
}
```

---

## Implementation Approach

### Phase 7.2.1: Chunking Library
- Use existing library: `langchain` text splitters (markdown-aware)
- Wrap with deterministic configuration
- Add chunk ID generation (content-addressable)
- Add metadata extraction

### Phase 7.2.2: Ingestion Pipeline
- Read markdown files from `knowledge-corpus/`
- Parse with markdown-aware splitter
- Generate chunk metadata
- Output JSONL format for Bedrock ingestion

### Phase 7.2.3: Validation
- Verify determinism (same input → same chunks)
- Verify semantic boundaries (no mid-sentence splits)
- Verify citation traceability (chunk ID → source line range)

---

## Technology Choices

### Chunking Library
**Option 1: LangChain MarkdownTextSplitter** ✅ RECOMMENDED
- Markdown-aware (respects headers, code blocks)
- Configurable chunk size and overlap
- Well-tested, widely used
- Python (matches Phase 6 LangGraph)

**Option 2: Custom Markdown Parser**
- Full control over chunking logic
- More complex to implement
- Maintenance burden

**Decision:** Use LangChain MarkdownTextSplitter with deterministic configuration.

### Chunk ID Generation
**SHA256(source_file + start_line + content)**
- Content-addressable (same content → same ID)
- Collision-resistant
- Reproducible

---

## Ingestion Format

### JSONL Output (for Bedrock Knowledge Base)

```jsonl
{"chunk_id":"a3f5e8...","source_file":"runbooks/rds-failover.md","start_line":1,"end_line":5,"content":"# RDS Failover Runbook\n\n## Symptoms...","section_header":"RDS Failover Runbook","chunk_type":"header","tokens":87}
{"chunk_id":"b7c2d1...","source_file":"runbooks/rds-failover.md","start_line":5,"end_line":10,"content":"## Diagnosis\nCheck CloudWatch metrics...","section_header":"Diagnosis","chunk_type":"header","tokens":92,"overlap_with_previous":true}
```

### S3 Structure

```
s3://opx-knowledge-base/
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

---

## Validation Criteria

### Determinism Test
```python
def test_deterministic_chunking():
    doc = load_document("runbooks/rds-failover.md")
    
    chunks1 = chunk_document(doc)
    chunks2 = chunk_document(doc)
    
    assert chunks1 == chunks2  # Same input → same output
    assert [c.chunk_id for c in chunks1] == [c.chunk_id for c in chunks2]
```

### Semantic Boundary Test
```python
def test_no_mid_sentence_splits():
    doc = load_document("runbooks/rds-failover.md")
    chunks = chunk_document(doc)
    
    for chunk in chunks:
        # Chunk should end with sentence boundary
        assert chunk.content.rstrip().endswith(('.', '!', '?', '```', '\n'))
```

### Citation Traceability Test
```python
def test_citation_traceability():
    doc = load_document("runbooks/rds-failover.md")
    chunks = chunk_document(doc)
    
    for chunk in chunks:
        # Can reconstruct source location
        source_lines = doc.split('\n')[chunk.start_line:chunk.end_line]
        assert chunk.content in '\n'.join(source_lines)
```

---

## Configuration

### Chunking Parameters

```python
CHUNKING_CONFIG = {
    "chunk_size": 800,           # Target tokens per chunk
    "chunk_overlap": 100,        # Overlap tokens
    "length_function": tiktoken_len,  # Token counter
    "separators": [
        "\n## ",                 # H2 headers (highest priority)
        "\n### ",                # H3 headers
        "\n\n",                  # Paragraph breaks
        "\n",                    # Line breaks
        " ",                     # Word breaks (last resort)
    ],
    "keep_separator": True,      # Preserve markdown structure
}
```

---

## Risks & Mitigations

### Risk 1: Large Code Blocks
**Problem:** Code blocks > max_chunk_size can't be split  
**Mitigation:** Allow oversized chunks for code blocks (with warning)

### Risk 2: Chunk Size vs. Retrieval Quality
**Problem:** Optimal chunk size depends on query type  
**Mitigation:** Start with 800 tokens (industry standard), tune based on retrieval metrics

### Risk 3: Overlap Increases Cost
**Problem:** 100-token overlap = 12.5% storage increase  
**Mitigation:** Acceptable trade-off for context preservation

---

## Success Metrics

| Metric | Target | Validation |
|--------|--------|------------|
| Determinism | 100% | Same doc → same chunks (always) |
| Semantic boundaries | 100% | No mid-sentence splits |
| Citation accuracy | 100% | Chunk ID → correct source line range |
| Chunk size | 500-1000 tokens | 95% of chunks in range |
| Overlap | 50-100 tokens | Configurable, validated |

---

## Dependencies

### Upstream (Must Complete First)
- ✅ Phase 7.1: Knowledge corpus curated and version-controlled

### Downstream (Blocked Until This Completes)
- ⏸️ Phase 7.3: Bedrock Knowledge Base deployment
- ⏸️ Phase 7.4: Agent integration

---

## Deliverables

1. **Chunking script** (`scripts/chunk-knowledge-corpus.py`)
2. **Chunk metadata schema** (TypeScript + Python)
3. **JSONL output** (ready for Bedrock ingestion)
4. **Validation tests** (determinism, boundaries, traceability)
5. **Configuration file** (`knowledge-base-config.json`)

---

## Non-Goals (Explicit Exclusions)

❌ **Dynamic chunking** - No runtime chunk size adjustment  
❌ **LLM-based chunking** - No prompt-based boundary detection  
❌ **Semantic similarity chunking** - No vector-based grouping  
❌ **Multi-document chunking** - Each document chunked independently  
❌ **Chunk deduplication** - Duplicate content preserved (for citation accuracy)

---

## Approval Gates

### Design Review
- [ ] Chunking strategy approved by Principal Architect
- [ ] Metadata schema approved
- [ ] Configuration parameters approved

### Implementation Review
- [ ] Determinism tests passing
- [ ] Semantic boundary tests passing
- [ ] Citation traceability tests passing
- [ ] JSONL output validated

---

**STATUS:** AWAITING APPROVAL  
**IMPLEMENTATION:** BLOCKED UNTIL APPROVED

---

**Created:** January 26, 2026  
**Authority:** Principal Architect  
**Next Phase:** Phase 7.3 (Bedrock Knowledge Base Deployment)
