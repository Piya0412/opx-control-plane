# Phase 7.1: Knowledge Corpus Definition & Versioning

**Parent:** [Phase 7: Knowledge Base / RAG](./phase-7.md)  
**Duration:** 2-3 days  
**Risk:** LOW

---

## Objective

Define **what knowledge exists** and **how it is frozen** to ensure deterministic retrieval forever.

---

## Scope

### 1. Allowed Document Types

**APPROVED Document Types:**
- **Runbooks** - Step-by-step operational procedures
- **Postmortems** - Incident retrospectives with root cause and resolution
- **Architecture Docs** - System design and component relationships
- **Playbooks** - Response strategies for specific incident types

**PROHIBITED Document Types:**
- ❌ Live logs (too dynamic)
- ❌ Real-time metrics (too volatile)
- ❌ User-generated content (unvetted)
- ❌ External web pages (uncontrolled)

### 2. Document Identity

Each document must have:
- **Document ID:** SHA256 hash of (title + content + version)
- **Title:** Human-readable name
- **Type:** One of [RUNBOOK, POSTMORTEM, ARCHITECTURE, PLAYBOOK]
- **Version:** Semantic version (e.g., "1.0.0")
- **Created At:** ISO-8601 timestamp
- **Last Updated:** ISO-8601 timestamp
- **Author:** Human identifier (e.g., "sre-team")
- **Tags:** Array of strings (e.g., ["lambda", "timeout", "sev2"])

#### Canonicalization Rules (REQUIRED)

Before computing `documentId`, the following canonicalization **MUST** be applied:

1. **UTF-8 encoding only** - All text must be UTF-8 encoded
2. **Normalize line endings to `\n`** - Convert CRLF (`\r\n`) and CR (`\r`) to LF (`\n`)
3. **Trim trailing whitespace on each line** - Remove spaces/tabs at end of lines
4. **Remove trailing newline at end of file** - Ensure consistent file termination
5. **Use raw Markdown source** - No rendering, no HTML conversion
6. **Concatenate as:** `${title}||${version}||${content}`

**Example Canonicalization:**
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

**Example:**
```json
{
  "documentId": "a1b2c3d4e5f6g7h8...",
  "title": "Lambda Timeout Runbook",
  "type": "RUNBOOK",
  "version": "1.0.0",
  "createdAt": "2026-01-15T10:00:00Z",
  "lastUpdated": "2026-01-15T10:00:00Z",
  "author": "sre-team",
  "tags": ["lambda", "timeout", "sev2"],
  "content": "# Lambda Timeout Runbook\n\n..."
}
```

### 3. Versioning Rules

**Immutability Guarantee:**
- Once a document version is ingested, it **NEVER changes**
- Updates create a **new version** with a new document ID
- Old versions remain queryable (for replay)

**Version Lifecycle:**
1. **Draft** → Human creates document
2. **Review** → Human reviews and approves
3. **Published** → Document ingested into Knowledge Base
4. **Deprecated** → Marked as outdated (but still queryable)
5. **Archived** → Removed from active retrieval (but preserved for replay)

**Version Comparison:**
- Agents always query **active versions only**
- Replay uses **version at time of incident** (deterministic)

#### Metadata Mutability Rules

The following fields are **IMMUTABLE** after ingestion:
- `documentId` - Never changes (content-addressable)
- `title` - Never changes (part of document ID)
- `type` - Never changes (structural property)
- `version` - Never changes (part of document ID)
- `content` - Never changes (part of document ID)
- `createdAt` - Never changes (audit trail)
- `author` - Never changes (attribution)

The following fields **MAY change**:
- `status` - Can transition: `ACTIVE` → `DEPRECATED` → `ARCHIVED`
- `tags` - Can be added (additive only, no removals)
- `lastUpdated` - Updated when metadata changes

**Metadata Change Constraints:**
- Metadata changes **MUST NOT affect:**
  - `documentId` (remains stable)
  - Chunking (chunks are tied to document version)
  - Embeddings (embeddings are tied to chunks)
  - Replay determinism (same incident → same knowledge)

**Example Metadata Change:**
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

### 4. Document Storage

**Primary Store:** S3 bucket (versioned, immutable)
- Bucket: `opx-knowledge-corpus`
- Path: `documents/{type}/{documentId}.json`
- Versioning: Enabled
- Encryption: AWS managed (SSE-S3)
- Lifecycle: Retain forever (no deletion)

**Metadata Store:** DynamoDB table
- Table: `opx-knowledge-documents`
- PK: `documentId`
- SK: `version`
- Attributes: title, type, createdAt, lastUpdated, author, tags, s3Key, status
- GSI: `type-createdAt-index` (for listing by type)
- GSI: `status-index` (for filtering active/deprecated)

### 5. Ingestion Process

**Manual Ingestion Only (No Auto-Ingestion):**
1. Human creates document (Markdown format)
2. Human runs ingestion script: `npm run ingest-document -- --file runbook.md --type RUNBOOK`
3. Script validates schema
4. Script computes document ID (SHA256)
5. Script uploads to S3
6. Script writes metadata to DynamoDB
7. Script triggers Knowledge Base sync (Phase 7.3)

**Validation Rules:**
- Title: Required, 1-200 characters
- Type: Required, one of allowed types
- Version: Required, semantic version format
- Content: Required, 100-50,000 characters
- Tags: Optional, max 10 tags, each 1-50 characters

### 6. Document Schema (Zod)

```typescript
export const DocumentTypeSchema = z.enum([
  'RUNBOOK',
  'POSTMORTEM',
  'ARCHITECTURE',
  'PLAYBOOK',
]);

export const DocumentSchema = z.object({
  documentId: z.string().length(64), // SHA256 hex
  title: z.string().min(1).max(200),
  type: DocumentTypeSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/), // Semantic version
  createdAt: z.string().datetime(),
  lastUpdated: z.string().datetime(),
  author: z.string().min(1).max(100),
  tags: z.array(z.string().min(1).max(50)).max(10),
  content: z.string().min(100).max(50000),
  s3Key: z.string(),
  status: z.enum(['ACTIVE', 'DEPRECATED', 'ARCHIVED']),
});

export type Document = z.infer<typeof DocumentSchema>;
```

---

## Deliverables

1. **Document schema** (`src/knowledge/document.schema.ts`)
2. **Document store** (`src/knowledge/document-store.ts`)
3. **Ingestion script** (`scripts/ingest-document.ts`)
4. **S3 bucket construct** (`infra/constructs/knowledge-corpus-bucket.ts`)
5. **DynamoDB table construct** (`infra/constructs/knowledge-documents-table.ts`)
6. **Sample documents** (`knowledge/runbooks/`, `knowledge/postmortems/`)

---

## Success Criteria

- [ ] Document schema defined and validated
- [ ] Document store implemented (S3 + DynamoDB)
- [ ] Ingestion script works (manual only)
- [ ] Sample documents ingested (3 runbooks, 2 postmortems)
- [ ] Document IDs are deterministic (same content → same ID)
- [ ] Versioning works (updates create new versions)
- [ ] No auto-ingestion (human-triggered only)

---

## Risks & Mitigations

### Risk 1: Document ID Collisions
**Impact:** LOW  
**Mitigation:** SHA256 hash includes title + content + version (collision probability negligible)

### Risk 2: Unvetted Content
**Impact:** MEDIUM  
**Mitigation:** Manual ingestion only, human review required

### Risk 3: Storage Costs
**Impact:** LOW  
**Mitigation:** S3 lifecycle policies (Glacier after 90 days for archived docs)

---

## Open Questions

1. Should we support document deletion? (Recommendation: NO, mark as ARCHIVED instead)
2. Should we support document updates? (Recommendation: NO, create new version instead)
3. Should we support bulk ingestion? (Recommendation: YES, but still human-triggered)
4. What is the approval process for new documents? (Recommendation: PR review + manual ingestion)

---

## Related Documentation

- [Phase 7 Overview](./phase-7.md)
- [Phase 7.2: Deterministic Chunking](./phase-7.2-deterministic-chunking.md)

---

**STATUS:** ✅ APPROVED (Conditions Met)  
**IMPLEMENTATION:** 🟢 READY TO PROCEED  
**APPROVER:** Principal Architect  
**APPROVAL DATE:** January 27, 2026  
**CONDITIONS MET:**
- ✅ Canonicalization rules added (deterministic document IDs)
- ✅ Metadata mutability rules clarified (immutable vs mutable fields)
- ✅ Cross-machine determinism guaranteed
- ✅ Replay determinism preserved

**NEXT ACTION:** Proceed with implementation
