import { describe, it, expect } from 'vitest';
import {
  DocumentSchema,
  DocumentInputSchema,
  DocumentTypeSchema,
  DocumentStatusSchema,
  canonicalizeDocument,
  computeDocumentId,
  generateS3Key,
  createDocument,
  validateMetadataUpdate,
} from '../../src/knowledge/document.schema.js';

describe('Document Schema', () => {
  describe('DocumentTypeSchema', () => {
    it('should accept valid document types', () => {
      expect(DocumentTypeSchema.parse('RUNBOOK')).toBe('RUNBOOK');
      expect(DocumentTypeSchema.parse('POSTMORTEM')).toBe('POSTMORTEM');
      expect(DocumentTypeSchema.parse('ARCHITECTURE')).toBe('ARCHITECTURE');
      expect(DocumentTypeSchema.parse('PLAYBOOK')).toBe('PLAYBOOK');
    });

    it('should reject invalid document types', () => {
      expect(() => DocumentTypeSchema.parse('INVALID')).toThrow();
      expect(() => DocumentTypeSchema.parse('runbook')).toThrow();
    });
  });

  describe('DocumentStatusSchema', () => {
    it('should accept valid statuses', () => {
      expect(DocumentStatusSchema.parse('ACTIVE')).toBe('ACTIVE');
      expect(DocumentStatusSchema.parse('DEPRECATED')).toBe('DEPRECATED');
      expect(DocumentStatusSchema.parse('ARCHIVED')).toBe('ARCHIVED');
    });

    it('should reject invalid statuses', () => {
      expect(() => DocumentStatusSchema.parse('INVALID')).toThrow();
    });
  });

  describe('canonicalizeDocument', () => {
    it('should normalize CRLF line endings to LF', () => {
      const content = 'Line 1\r\nLine 2\r\nLine 3';
      const result = canonicalizeDocument('Title', '1.0.0', content);
      expect(result).toContain('Line 1\nLine 2\nLine 3');
    });

    it('should normalize CR line endings to LF', () => {
      const content = 'Line 1\rLine 2\rLine 3';
      const result = canonicalizeDocument('Title', '1.0.0', content);
      expect(result).toContain('Line 1\nLine 2\nLine 3');
    });

    it('should trim trailing whitespace on each line', () => {
      const content = 'Line 1   \nLine 2\t\nLine 3  ';
      const result = canonicalizeDocument('Title', '1.0.0', content);
      expect(result).toContain('Line 1\nLine 2\nLine 3');
    });

    it('should remove trailing newlines at EOF', () => {
      const content = 'Line 1\nLine 2\n\n\n';
      const result = canonicalizeDocument('Title', '1.0.0', content);
      expect(result).not.toMatch(/\n$/);
    });

    it('should concatenate with delimiter', () => {
      const result = canonicalizeDocument('Title', '1.0.0', 'Content');
      expect(result).toBe('Title||1.0.0||Content');
    });

    it('should produce same output for same input (determinism)', () => {
      const content = 'Line 1\r\nLine 2  \nLine 3\n\n';
      const result1 = canonicalizeDocument('Title', '1.0.0', content);
      const result2 = canonicalizeDocument('Title', '1.0.0', content);
      expect(result1).toBe(result2);
    });

    it('should produce same output across platforms (Windows/Linux)', () => {
      const windowsContent = 'Line 1\r\nLine 2\r\nLine 3';
      const linuxContent = 'Line 1\nLine 2\nLine 3';
      const result1 = canonicalizeDocument('Title', '1.0.0', windowsContent);
      const result2 = canonicalizeDocument('Title', '1.0.0', linuxContent);
      expect(result1).toBe(result2);
    });
  });

  describe('computeDocumentId', () => {
    it('should generate 64-character hex string (SHA256)', () => {
      const id = computeDocumentId('Title', '1.0.0', 'Content');
      expect(id).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce same ID for same input (determinism)', () => {
      const id1 = computeDocumentId('Title', '1.0.0', 'Content');
      const id2 = computeDocumentId('Title', '1.0.0', 'Content');
      expect(id1).toBe(id2);
    });

    it('should produce different IDs for different titles', () => {
      const id1 = computeDocumentId('Title 1', '1.0.0', 'Content');
      const id2 = computeDocumentId('Title 2', '1.0.0', 'Content');
      expect(id1).not.toBe(id2);
    });

    it('should produce different IDs for different versions', () => {
      const id1 = computeDocumentId('Title', '1.0.0', 'Content');
      const id2 = computeDocumentId('Title', '2.0.0', 'Content');
      expect(id1).not.toBe(id2);
    });

    it('should produce different IDs for different content', () => {
      const id1 = computeDocumentId('Title', '1.0.0', 'Content 1');
      const id2 = computeDocumentId('Title', '1.0.0', 'Content 2');
      expect(id1).not.toBe(id2);
    });

    it('should produce same ID regardless of line endings', () => {
      const id1 = computeDocumentId('Title', '1.0.0', 'Line 1\r\nLine 2');
      const id2 = computeDocumentId('Title', '1.0.0', 'Line 1\nLine 2');
      expect(id1).toBe(id2);
    });
  });

  describe('generateS3Key', () => {
    it('should generate correct S3 key format', () => {
      const key = generateS3Key('RUNBOOK', 'abc123');
      expect(key).toBe('documents/runbook/abc123.json');
    });

    it('should lowercase document type', () => {
      const key = generateS3Key('POSTMORTEM', 'abc123');
      expect(key).toBe('documents/postmortem/abc123.json');
    });
  });

  describe('createDocument', () => {
    const validInput = {
      title: 'Test Runbook',
      type: 'RUNBOOK' as const,
      version: '1.0.0',
      author: 'test-user',
      tags: ['test', 'runbook'],
      content: 'This is a test runbook with enough content to pass validation. It needs to be at least 100 characters long to meet the minimum content requirement.',
    };

    it('should create valid document from input', () => {
      const document = createDocument(validInput);
      
      expect(document.title).toBe(validInput.title);
      expect(document.type).toBe(validInput.type);
      expect(document.version).toBe(validInput.version);
      expect(document.author).toBe(validInput.author);
      expect(document.tags).toEqual(validInput.tags);
      expect(document.content).toBe(validInput.content);
      expect(document.status).toBe('ACTIVE');
    });

    it('should generate documentId', () => {
      const document = createDocument(validInput);
      expect(document.documentId).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate s3Key', () => {
      const document = createDocument(validInput);
      expect(document.s3Key).toMatch(/^documents\/runbook\/[a-f0-9]{64}\.json$/);
    });

    it('should generate timestamps', () => {
      const document = createDocument(validInput);
      expect(document.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(document.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should set status to ACTIVE', () => {
      const document = createDocument(validInput);
      expect(document.status).toBe('ACTIVE');
    });

    it('should reject invalid title (too short)', () => {
      const invalid = { ...validInput, title: '' };
      expect(() => createDocument(invalid)).toThrow();
    });

    it('should reject invalid title (too long)', () => {
      const invalid = { ...validInput, title: 'a'.repeat(201) };
      expect(() => createDocument(invalid)).toThrow();
    });

    it('should reject invalid version format', () => {
      const invalid = { ...validInput, version: '1.0' };
      expect(() => createDocument(invalid)).toThrow();
    });

    it('should reject invalid content (too short)', () => {
      const invalid = { ...validInput, content: 'Too short' };
      expect(() => createDocument(invalid)).toThrow();
    });

    it('should reject invalid content (too long)', () => {
      const invalid = { ...validInput, content: 'a'.repeat(50001) };
      expect(() => createDocument(invalid)).toThrow();
    });

    it('should reject too many tags', () => {
      const invalid = { ...validInput, tags: Array(11).fill('tag') };
      expect(() => createDocument(invalid)).toThrow();
    });
  });

  describe('validateMetadataUpdate', () => {
    it('should accept valid status update', () => {
      const update = { status: 'DEPRECATED' as const };
      const validated = validateMetadataUpdate(update);
      expect(validated.status).toBe('DEPRECATED');
    });

    it('should accept valid tags update', () => {
      const update = { tags: ['tag1', 'tag2'] };
      const validated = validateMetadataUpdate(update);
      expect(validated.tags).toEqual(['tag1', 'tag2']);
    });

    it('should accept both status and tags', () => {
      const update = { status: 'ARCHIVED' as const, tags: ['archived'] };
      const validated = validateMetadataUpdate(update);
      expect(validated.status).toBe('ARCHIVED');
      expect(validated.tags).toEqual(['archived']);
    });

    it('should reject invalid status', () => {
      const update = { status: 'INVALID' as any };
      expect(() => validateMetadataUpdate(update)).toThrow();
    });

    it('should reject too many tags', () => {
      const update = { tags: Array(11).fill('tag') };
      expect(() => validateMetadataUpdate(update)).toThrow();
    });
  });

  describe('Immutability Guarantee', () => {
    it('should produce same documentId for same content', () => {
      const input = {
        title: 'Test Document',
        type: 'RUNBOOK' as const,
        version: '1.0.0',
        author: 'test-user',
        tags: ['test'],
        content: 'This is test content that is long enough to pass validation requirements. It needs to be at least 100 characters.',
      };

      const doc1 = createDocument(input);
      const doc2 = createDocument(input);

      expect(doc1.documentId).toBe(doc2.documentId);
    });

    it('should produce different documentId for different versions', () => {
      const input1 = {
        title: 'Test Document',
        type: 'RUNBOOK' as const,
        version: '1.0.0',
        author: 'test-user',
        tags: ['test'],
        content: 'This is test content that is long enough to pass validation requirements. It needs to be at least 100 characters.',
      };

      const input2 = { ...input1, version: '2.0.0' };

      const doc1 = createDocument(input1);
      const doc2 = createDocument(input2);

      expect(doc1.documentId).not.toBe(doc2.documentId);
    });
  });
});
