# Phase 7.1 Approved ✅

**Date:** January 27, 2026  
**Status:** APPROVED (Conditions Met)  
**Implementation:** READY TO PROCEED

---

## Approval Summary

Phase 7.1 (Knowledge Corpus Definition & Versioning) has been **approved with conditions** - both required conditions have been met and the design is now locked for implementation.

---

## Required Changes (COMPLETED)

### Change 1: Explicit Hash Canonicalization ✅

**Problem:** Document ID computation was ambiguous - different environments could produce different hashes due to line ending differences, whitespace variations, or encoding issues.

**Solution Added:**

#### Canonicalization Rules (REQUIRED)
Before computing `documentId`, the following canonicalization **MUST** be applied:

1. **UTF-8 encoding only** - All text must be UTF-8 encoded
2. **Normalize line endings to `\n`** - Convert CRLF (`\r\n`) and CR (`\r`) to LF (`\n`)
3. **Trim trailing whitespace on each line** - Remove spaces/tabs at end of lines
4. **Remove trailing newline at end of file** - Ensure consistent file termination
5. **Use raw Markdown source** - No rendering, no HTML conversion
6. **Concatenate as:** `${title}||${version}||${content}`

**Implementation Example:**
```typescript
function canonicalizeDocument(title: string, version: string, content: string): string {
  // Normalize line endings
  const normalizedContent = content
    .replace(/\r\n/g, '\n')  // CRLF → LF
    .replace(/\r/g, '\n')    // CR → LF
    .split('\n')
    .map(line => line.trimEnd())  // Trim trailing whitespace
    .join('\n')
    .replace(/\n+$/, '');  // Remove trailing newlines
  
  // Concatenate with delimiter
  return `${title}||${version}||${normalizedContent}`;
}

function computeDocumentId(title: string, version: string, content: string): string {
  const canonical = canonicalizeDocument(title, version, content);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}
```

**Why This Matters:**
- Guarantees the same document always produces the same `documentId` across environments
- Prevents hash mismatches due to OS differences (Windows vs Linux line endings)
- Ensures deterministic replay (same document → same ID → same chunks → same embeddings)
- Enables cross-machine verification (CI/CD, local dev, production)

### Change 2: Metadata Mutability Clarification ✅

**Problem:** Document metadata includes fields like `status` and `tags` that can change, but it wasn't clear which fields are immutable vs mutable, and how changes affect determinism.

**Solution Added:**

#### Metadata Mutability Rules

**IMMUTABLE fields** (never change after ingestion):
- `documentId` - Never changes (content-addressable)
- `title` - Never changes (part of document ID)
- `type` - Never changes (structural property)
- `version` - Never changes (part of document ID)
- `content` - Never changes (part of document ID)
- `createdAt` - Never changes (audit trail)
- `author` - Never changes (attribution)

**MUTABLE fields** (can change):
- `status` - Can transition: `ACTIVE` → `DEPRECATED` → `ARCHIVED`
- `tags` - Can be added (additive only, no removals)
- `lastUpdated` - Updated when metadata changes

**Constraints:**
Metadata changes **MUST NOT affect:**
- `documentId` (remains stable)
- Chunking (chunks are tied to document version)
- Embeddings (embeddings are tied to chunks)
- Replay determinism (same incident → same knowledge)

**Example Operations:**
```typescript
// ALLOWED: Status transition
await documentStore.updateStatus(documentId, 'DEPRECATED');

// ALLOWED: Add tag
await documentStore.addTag(documentId, 'legacy');

// FORBIDDEN: Change content (creates new version instead)
// await documentStore.updateContent(documentId, newContent); // ❌ NOT ALLOWED

// FORBIDDEN: Remove tag (breaks audit trail)
// await documentStore.removeTag(documentId, 'sev2'); // ❌ NOT ALLOWED
```

**Why This Matters:**
- Prevents accidental content changes that break determinism
- Ensures replay uses exact same knowledge as original incident
- Maintains audit trail (who created what, when)
- Allows operational metadata updates (status, tags) without breaking replay

---

## Architectural Quality Assessment

### What Was Done Right ✅

1. **Clear separation** between intelligence enhancement vs authority
2. **Explicit "PROHIBITED" section** (critical for audits)
3. **Manual ingestion only** (no auto-ingestion, human-triggered)
4. **Immutability guarantee** (once ingested, never changes)
5. **Version lifecycle** clearly defined
6. **Document schema** with Zod validation
7. **Success criteria** measurable and testable

### Why This Design Is Strong

This document reads like something that could be shown to:
- A Staff+ engineer
- A security reviewer
- A hiring panel

The design demonstrates:
- **Determinism by design** - Same input → same output (always)
- **Replay safety** - Historical incidents use historical knowledge
- **Audit trail** - Who created what, when, and why
- **Operational flexibility** - Can deprecate/archive without breaking replay
- **Cross-machine consistency** - Works the same on Windows, Linux, macOS

---

## Implementation Readiness

### Status: 🟢 READY TO PROCEED

Phase 7.1 is now **approved and locked** for implementation. No further design changes required.

### Next Steps

1. **Implement document schema** (`src/knowledge/document.schema.ts`)
2. **Implement document store** (`src/knowledge/document-store.ts`)
3. **Implement ingestion script** (`scripts/ingest-document.ts`)
4. **Create S3 bucket construct** (`infra/constructs/knowledge-corpus-bucket.ts`)
5. **Create DynamoDB table construct** (`infra/constructs/knowledge-documents-table.ts`)
6. **Create sample documents** (`knowledge/runbooks/`, `knowledge/postmortems/`)
7. **Write tests** (canonicalization, metadata mutability, ingestion)

### Success Criteria (From Design)

- [ ] Document schema defined and validated
- [ ] Document store implemented (S3 + DynamoDB)
- [ ] Ingestion script works (manual only)
- [ ] Sample documents ingested (3 runbooks, 2 postmortems)
- [ ] Document IDs are deterministic (same content → same ID)
- [ ] Versioning works (updates create new versions)
- [ ] No auto-ingestion (human-triggered only)
- [ ] Canonicalization tests pass (cross-platform)
- [ ] Metadata mutability tests pass (immutable fields enforced)

---

## Commit Details

**Commit:** `577a247` - "docs(phase7.1): Add canonicalization and metadata mutability rules - APPROVED"

**Changes:**
- 1 file changed
- +93 insertions
- -3 deletions

**Pushed to:** `origin/main`

---

## Related Documentation

- [Phase 7 Overview](docs/phase-7/phase-7.md) - ✅ APPROVED
- [Phase 7.1: Knowledge Corpus](docs/phase-7/phase-7.1-knowledge-corpus.md) - ✅ APPROVED (Conditions Met)
- [Phase 7.2: Deterministic Chunking](docs/phase-7/phase-7.2-deterministic-chunking.md) - 📋 AWAITING APPROVAL
- [Phase 7.3: Bedrock Knowledge Base](docs/phase-7/phase-7.3-bedrock-knowledge-base.md) - 📋 AWAITING APPROVAL
- [Phase 7.4: Agent Integration](docs/phase-7/phase-7.4-agent-integration.md) - 📋 AWAITING APPROVAL

---

## Approval Record

**Approver:** Principal Architect  
**Approval Date:** January 27, 2026  
**Approval Type:** Approved with Conditions (Conditions Met)  
**Conditions:**
1. ✅ Add explicit hash canonicalization rules
2. ✅ Clarify metadata mutability rules

**Rationale:**
Architecturally correct and safe. The two small clarifications lock determinism and auditability, making the design production-ready.

---

**Status:** ✅ APPROVED (Conditions Met)  
**Implementation:** 🟢 READY TO PROCEED  
**Next Phase:** Phase 7.2 (Deterministic Chunking) - Awaiting Approval
