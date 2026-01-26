#!/usr/bin/env node

/**
 * Document Ingestion Script
 * 
 * Manually ingest a document into the knowledge corpus.
 * 
 * Usage:
 *   npm run ingest-document -- --file runbook.md --type RUNBOOK --version 1.0.0
 * 
 * Options:
 *   --file <path>       Path to Markdown file (required)
 *   --type <type>       Document type: RUNBOOK, POSTMORTEM, ARCHITECTURE, PLAYBOOK (required)
 *   --version <version> Semantic version (e.g., 1.0.0) (required)
 *   --author <author>   Author identifier (default: current user)
 *   --tags <tags>       Comma-separated tags (optional)
 *   --dry-run           Validate only, do not ingest
 */

import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';
import {
  DocumentInput,
  DocumentType,
  DocumentTypeSchema,
  createDocument,
  computeDocumentId,
} from '../src/knowledge/document.schema.js';
import { DocumentStore } from '../src/knowledge/document-store.js';

// Parse command-line arguments
const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    type: { type: 'string' },
    version: { type: 'string' },
    author: { type: 'string' },
    tags: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

// Validate required arguments
if (!values.file || !values.type || !values.version) {
  console.error('Error: Missing required arguments');
  console.error('');
  console.error('Usage:');
  console.error('  npm run ingest-document -- --file <path> --type <type> --version <version>');
  console.error('');
  console.error('Options:');
  console.error('  --file <path>       Path to Markdown file (required)');
  console.error('  --type <type>       Document type: RUNBOOK, POSTMORTEM, ARCHITECTURE, PLAYBOOK (required)');
  console.error('  --version <version> Semantic version (e.g., 1.0.0) (required)');
  console.error('  --author <author>   Author identifier (default: current user)');
  console.error('  --tags <tags>       Comma-separated tags (optional)');
  console.error('  --dry-run           Validate only, do not ingest');
  process.exit(1);
}

// Validate file exists
const filePath = path.resolve(values.file);
if (!fs.existsSync(filePath)) {
  console.error(`Error: File not found: ${filePath}`);
  process.exit(1);
}

// Validate document type
const typeResult = DocumentTypeSchema.safeParse(values.type);
if (!typeResult.success) {
  console.error(`Error: Invalid document type: ${values.type}`);
  console.error('Valid types: RUNBOOK, POSTMORTEM, ARCHITECTURE, PLAYBOOK');
  process.exit(1);
}
const documentType = typeResult.data as DocumentType;

// Read file content
const content = fs.readFileSync(filePath, 'utf-8');

// Extract title from first H1 heading
const titleMatch = content.match(/^#\s+(.+)$/m);
if (!titleMatch) {
  console.error('Error: Document must have a title (# Heading)');
  process.exit(1);
}
const title = titleMatch[1].trim();

// Parse tags
const tags = values.tags
  ? values.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
  : [];

// Get author (default to current user)
const author = values.author || process.env.USER || 'unknown';

// Create document input
const input: DocumentInput = {
  title,
  type: documentType,
  version: values.version,
  author,
  tags,
  content,
};

// Validate and create document
let document;
try {
  document = createDocument(input);
} catch (error) {
  console.error('Error: Document validation failed');
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exit(1);
}

// Display document info
console.log('');
console.log('📄 Document Information');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Title:       ${document.title}`);
console.log(`Type:        ${document.type}`);
console.log(`Version:     ${document.version}`);
console.log(`Author:      ${document.author}`);
console.log(`Tags:        ${document.tags.join(', ') || '(none)'}`);
console.log(`Document ID: ${document.documentId}`);
console.log(`S3 Key:      ${document.s3Key}`);
console.log(`Content:     ${document.content.length} characters`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

// Dry run - exit here
if (values['dry-run']) {
  console.log('✅ Validation successful (dry-run mode)');
  console.log('');
  console.log('To ingest this document, run without --dry-run flag');
  process.exit(0);
}

// Ingest document
console.log('📤 Ingesting document...');
console.log('');

// Get environment variables
const tableName = process.env.KNOWLEDGE_DOCUMENTS_TABLE || 'opx-knowledge-documents';
const bucketName = process.env.KNOWLEDGE_CORPUS_BUCKET || 'opx-knowledge-corpus';

// Create document store
const store = new DocumentStore({
  tableName,
  bucketName,
});

// Store document
try {
  const stored = await store.storeDocument(input);
  
  console.log('✅ Document ingested successfully!');
  console.log('');
  console.log('Document Details:');
  console.log(`  ID:      ${stored.documentId}`);
  console.log(`  S3 Key:  ${stored.s3Key}`);
  console.log(`  Status:  ${stored.status}`);
  console.log(`  Created: ${stored.createdAt}`);
  console.log('');
  console.log('Next Steps:');
  console.log('  1. Verify document in DynamoDB table:', tableName);
  console.log('  2. Verify document in S3 bucket:', bucketName);
  console.log('  3. Trigger Knowledge Base sync (Phase 7.3)');
  console.log('');
} catch (error) {
  console.error('❌ Ingestion failed');
  console.error('');
  if (error instanceof Error) {
    console.error('Error:', error.message);
  }
  process.exit(1);
}
