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

**STATUS:** 📋 AWAITING APPROVAL  
**IMPLEMENTATION:** ❌ BLOCKED UNTIL APPROVED  
**APPROVER:** Principal Architect  
**NEXT ACTION:** Review and approve this design before implementation
