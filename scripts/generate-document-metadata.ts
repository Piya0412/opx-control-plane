#!/usr/bin/env node
/**
 * Generate Document Metadata Files
 * 
 * Creates .meta.json files for existing knowledge documents.
 * These metadata files are required for Phase 7.2 chunking.
 * 
 * Usage:
 *   npm run generate-metadata
 *   npm run generate-metadata -- --dry-run
 */

import fs from 'fs';
import path from 'path';
import { computeDocumentId } from '../src/knowledge/document.schema.js';

interface DocumentMetadata {
  documentId: string;
  title: string;
  type: string;
  version: string;
  author: string;
  tags: string[];
}

function extractTitle(content: string): string {
  // Extract first H1 heading
  const match = content.match(/^#\s+(.+)$/m);
  if (!match) {
    throw new Error('No H1 heading found in document');
  }
  return match[1].trim();
}

function generateMetadata(filePath: string, type: string): DocumentMetadata {
  // Read document content
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Extract title
  const title = extractTitle(content);
  
  // Compute document ID
  const version = '1.0.0'; // Default version for existing documents
  const documentId = computeDocumentId(title, version, content);
  
  // Generate metadata
  const metadata: DocumentMetadata = {
    documentId,
    title,
    type,
    version,
    author: 'sre-team',
    tags: [],
  };
  
  // Add type-specific tags
  if (type === 'RUNBOOK') {
    metadata.tags.push('runbook');
  } else if (type === 'POSTMORTEM') {
    metadata.tags.push('postmortem');
  }
  
  return metadata;
}

function processDirectory(dirPath: string, type: string, dryRun: boolean): number {
  let count = 0;
  
  // Find all markdown files
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    if (!file.endsWith('.md')) {
      continue;
    }
    
    const filePath = path.join(dirPath, file);
    const metaPath = filePath + '.meta.json';
    
    // Skip if metadata already exists
    if (fs.existsSync(metaPath)) {
      console.log(`⏭️  Skipping ${file} (metadata exists)`);
      continue;
    }
    
    try {
      // Generate metadata
      const metadata = generateMetadata(filePath, type);
      
      if (dryRun) {
        console.log(`✓ Would create ${file}.meta.json`);
        console.log(`  Document ID: ${metadata.documentId}`);
        console.log(`  Title: ${metadata.title}`);
      } else {
        // Write metadata file
        fs.writeFileSync(
          metaPath,
          JSON.stringify(metadata, null, 2) + '\n',
          'utf-8'
        );
        console.log(`✓ Created ${file}.meta.json`);
      }
      
      count++;
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }
  
  return count;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  
  console.log('Generating document metadata files...');
  console.log();
  
  if (dryRun) {
    console.log('DRY RUN - No files will be written');
    console.log();
  }
  
  let totalCount = 0;
  
  // Process runbooks
  const runbooksDir = path.join(process.cwd(), 'knowledge', 'runbooks');
  if (fs.existsSync(runbooksDir)) {
    console.log('Processing runbooks...');
    const count = processDirectory(runbooksDir, 'RUNBOOK', dryRun);
    totalCount += count;
    console.log();
  }
  
  // Process postmortems
  const postmortemsDir = path.join(process.cwd(), 'knowledge', 'postmortems');
  if (fs.existsSync(postmortemsDir)) {
    console.log('Processing postmortems...');
    const count = processDirectory(postmortemsDir, 'POSTMORTEM', dryRun);
    totalCount += count;
    console.log();
  }
  
  // Summary
  console.log('='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total metadata files ${dryRun ? 'to create' : 'created'}: ${totalCount}`);
  
  if (dryRun) {
    console.log();
    console.log('Run without --dry-run to create files');
  }
}

main();
