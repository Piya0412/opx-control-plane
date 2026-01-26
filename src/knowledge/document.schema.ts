import { z } from 'zod';
import crypto from 'crypto';

/**
 * Document types allowed in the knowledge corpus.
 */
export const DocumentTypeSchema = z.enum([
  'RUNBOOK',
  'POSTMORTEM',
  'ARCHITECTURE',
  'PLAYBOOK',
]);

export type DocumentType = z.infer<typeof DocumentTypeSchema>;

/**
 * Document status lifecycle.
 */
export const DocumentStatusSchema = z.enum([
  'ACTIVE',      // Currently in use
  'DEPRECATED',  // Outdated but still queryable
  'ARCHIVED',    // Removed from active retrieval
]);

export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

/**
 * Document schema with validation rules.
 */
export const DocumentSchema = z.object({
  documentId: z.string().length(64), // SHA256 hex
  title: z.string().min(1).max(200),
  type: DocumentTypeSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semantic (e.g., 1.0.0)'),
  createdAt: z.string().datetime(),
  lastUpdated: z.string().datetime(),
  author: z.string().min(1).max(100),
  tags: z.array(z.string().min(1).max(50)).max(10),
  content: z.string().min(100).max(50000),
  s3Key: z.string(),
  status: DocumentStatusSchema,
});

export type Document = z.infer<typeof DocumentSchema>;

/**
 * Document input schema (before ID generation).
 */
export const DocumentInputSchema = DocumentSchema.omit({
  documentId: true,
  s3Key: true,
  createdAt: true,
  lastUpdated: true,
  status: true,
});

export type DocumentInput = z.infer<typeof DocumentInputSchema>;

/**
 * Canonicalize document content for deterministic hashing.
 * 
 * Rules:
 * 1. UTF-8 encoding only
 * 2. Normalize line endings to \n (CRLF/CR → LF)
 * 3. Trim trailing whitespace on each line
 * 4. Remove trailing newline at end of file
 * 5. Use raw Markdown source (no rendering)
 * 6. Concatenate as: ${title}||${version}||${content}
 * 
 * This guarantees the same document always produces the same documentId
 * across environments (Windows, Linux, macOS).
 */
export function canonicalizeDocument(
  title: string,
  version: string,
  content: string
): string {
  // Normalize line endings: CRLF → LF, CR → LF
  const normalizedContent = content
    .replace(/\r\n/g, '\n')  // Windows CRLF → LF
    .replace(/\r/g, '\n')    // Old Mac CR → LF
    .split('\n')
    .map(line => line.trimEnd())  // Trim trailing whitespace per line
    .join('\n')
    .replace(/\n+$/, '');  // Remove trailing newlines at EOF

  // Concatenate with delimiter
  return `${title}||${version}||${normalizedContent}`;
}

/**
 * Compute deterministic document ID from title, version, and content.
 * 
 * Uses SHA256 hash of canonicalized content to ensure:
 * - Same document → same ID (always)
 * - Cross-platform consistency (Windows/Linux/macOS)
 * - Collision resistance (SHA256)
 * 
 * @param title Document title
 * @param version Semantic version (e.g., "1.0.0")
 * @param content Markdown content
 * @returns 64-character hex string (SHA256 hash)
 */
export function computeDocumentId(
  title: string,
  version: string,
  content: string
): string {
  const canonical = canonicalizeDocument(title, version, content);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Generate S3 key for document storage.
 * 
 * Format: documents/{type}/{documentId}.json
 * 
 * @param type Document type
 * @param documentId Document ID (SHA256 hash)
 * @returns S3 key path
 */
export function generateS3Key(type: DocumentType, documentId: string): string {
  return `documents/${type.toLowerCase()}/${documentId}.json`;
}

/**
 * Validate document input and generate full document with computed fields.
 * 
 * @param input Document input (without computed fields)
 * @returns Complete document with documentId, s3Key, timestamps, and status
 */
export function createDocument(input: DocumentInput): Document {
  // Validate input
  const validated = DocumentInputSchema.parse(input);

  // Compute document ID
  const documentId = computeDocumentId(
    validated.title,
    validated.version,
    validated.content
  );

  // Generate S3 key
  const s3Key = generateS3Key(validated.type, documentId);

  // Generate timestamps
  const now = new Date().toISOString();

  // Create complete document
  const document: Document = {
    ...validated,
    documentId,
    s3Key,
    createdAt: now,
    lastUpdated: now,
    status: 'ACTIVE',
  };

  // Validate complete document
  return DocumentSchema.parse(document);
}

/**
 * Metadata update schema (only mutable fields).
 */
export const DocumentMetadataUpdateSchema = z.object({
  status: DocumentStatusSchema.optional(),
  tags: z.array(z.string().min(1).max(50)).max(10).optional(),
});

export type DocumentMetadataUpdate = z.infer<typeof DocumentMetadataUpdateSchema>;

/**
 * Validate metadata update.
 * 
 * Ensures only mutable fields (status, tags) can be updated.
 * Immutable fields (documentId, title, type, version, content, createdAt, author)
 * cannot be changed.
 */
export function validateMetadataUpdate(update: DocumentMetadataUpdate): DocumentMetadataUpdate {
  return DocumentMetadataUpdateSchema.parse(update);
}
