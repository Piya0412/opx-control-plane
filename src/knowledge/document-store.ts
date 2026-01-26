import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import {
  Document,
  DocumentInput,
  DocumentStatus,
  DocumentType,
  DocumentMetadataUpdate,
  createDocument,
  validateMetadataUpdate,
} from './document.schema.js';

export interface DocumentStoreConfig {
  tableName: string;
  bucketName: string;
  dynamoClient?: DynamoDBClient;
  s3Client?: S3Client;
}

/**
 * Document store for knowledge corpus.
 * 
 * Responsibilities:
 * - Store documents in S3 (immutable content)
 * - Store metadata in DynamoDB (with mutable status/tags)
 * - Enforce immutability (content never changes)
 * - Support versioning (updates create new versions)
 * - Enable replay (query by status at point in time)
 */
export class DocumentStore {
  private readonly tableName: string;
  private readonly bucketName: string;
  private readonly dynamoClient: DynamoDBClient;
  private readonly s3Client: S3Client;

  constructor(config: DocumentStoreConfig) {
    this.tableName = config.tableName;
    this.bucketName = config.bucketName;
    this.dynamoClient = config.dynamoClient || new DynamoDBClient({});
    this.s3Client = config.s3Client || new S3Client({});
  }

  /**
   * Store a new document.
   * 
   * Steps:
   * 1. Validate input and generate document ID
   * 2. Check if document already exists (idempotent)
   * 3. Upload content to S3
   * 4. Store metadata in DynamoDB
   * 
   * @param input Document input
   * @returns Stored document with generated fields
   */
  async storeDocument(input: DocumentInput): Promise<Document> {
    // Create document with computed fields
    const document = createDocument(input);

    // Check if document already exists (idempotent)
    const existing = await this.getDocument(document.documentId);
    if (existing) {
      // Document already exists - return existing
      return existing;
    }

    // Upload content to S3
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: document.s3Key,
        Body: JSON.stringify(document, null, 2),
        ContentType: 'application/json',
        Metadata: {
          documentId: document.documentId,
          type: document.type,
          version: document.version,
        },
      })
    );

    // Store metadata in DynamoDB
    await this.dynamoClient.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(document, { removeUndefinedValues: true }),
        ConditionExpression: 'attribute_not_exists(documentId)',
      })
    );

    return document;
  }

  /**
   * Get document by ID.
   * 
   * @param documentId Document ID (SHA256 hash)
   * @returns Document or null if not found
   */
  async getDocument(documentId: string): Promise<Document | null> {
    const result = await this.dynamoClient.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({ documentId }),
      })
    );

    if (!result.Item) {
      return null;
    }

    return unmarshall(result.Item) as Document;
  }

  /**
   * Update document metadata (status and/or tags).
   * 
   * Only mutable fields can be updated:
   * - status: ACTIVE → DEPRECATED → ARCHIVED
   * - tags: additive only (no removals)
   * 
   * Immutable fields cannot be changed:
   * - documentId, title, type, version, content, createdAt, author
   * 
   * @param documentId Document ID
   * @param update Metadata update (status and/or tags)
   * @returns Updated document
   */
  async updateMetadata(
    documentId: string,
    update: DocumentMetadataUpdate
  ): Promise<Document> {
    // Validate update (only mutable fields)
    const validated = validateMetadataUpdate(update);

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (validated.status) {
      updateExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = validated.status;
    }

    if (validated.tags) {
      updateExpressions.push('#tags = :tags');
      expressionAttributeNames['#tags'] = 'tags';
      expressionAttributeValues[':tags'] = validated.tags;
    }

    // Always update lastUpdated
    updateExpressions.push('#lastUpdated = :lastUpdated');
    expressionAttributeNames['#lastUpdated'] = 'lastUpdated';
    expressionAttributeValues[':lastUpdated'] = new Date().toISOString();

    // Execute update
    const result = await this.dynamoClient.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({ documentId }),
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: marshall(expressionAttributeValues),
        ReturnValues: 'ALL_NEW',
      })
    );

    if (!result.Attributes) {
      throw new Error(`Document not found: ${documentId}`);
    }

    return unmarshall(result.Attributes) as Document;
  }

  /**
   * Update document status.
   * 
   * Allowed transitions:
   * - ACTIVE → DEPRECATED
   * - ACTIVE → ARCHIVED
   * - DEPRECATED → ARCHIVED
   * 
   * @param documentId Document ID
   * @param status New status
   * @returns Updated document
   */
  async updateStatus(documentId: string, status: DocumentStatus): Promise<Document> {
    return this.updateMetadata(documentId, { status });
  }

  /**
   * Add tags to document (additive only).
   * 
   * Tags are merged with existing tags (no duplicates).
   * Tags cannot be removed (audit trail preservation).
   * 
   * @param documentId Document ID
   * @param newTags Tags to add
   * @returns Updated document
   */
  async addTags(documentId: string, newTags: string[]): Promise<Document> {
    // Get current document
    const document = await this.getDocument(documentId);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    // Merge tags (no duplicates)
    const mergedTags = Array.from(new Set([...document.tags, ...newTags]));

    // Validate tag count
    if (mergedTags.length > 10) {
      throw new Error(`Tag limit exceeded: ${mergedTags.length} > 10`);
    }

    return this.updateMetadata(documentId, { tags: mergedTags });
  }

  /**
   * List documents by type.
   * 
   * @param type Document type
   * @param status Filter by status (optional)
   * @returns Array of documents
   */
  async listByType(type: DocumentType, status?: DocumentStatus): Promise<Document[]> {
    const params: any = {
      TableName: this.tableName,
      IndexName: 'type-createdAt-index',
      KeyConditionExpression: '#type = :type',
      ExpressionAttributeNames: {
        '#type': 'type',
      },
      ExpressionAttributeValues: marshall({
        ':type': type,
      }),
    };

    // Add status filter if provided
    if (status) {
      params.FilterExpression = '#status = :status';
      params.ExpressionAttributeNames['#status'] = 'status';
      params.ExpressionAttributeValues = marshall({
        ':type': type,
        ':status': status,
      });
    }

    const result = await this.dynamoClient.send(new QueryCommand(params));

    if (!result.Items) {
      return [];
    }

    return result.Items.map(item => unmarshall(item) as Document);
  }

  /**
   * List documents by status.
   * 
   * @param status Document status
   * @returns Array of documents
   */
  async listByStatus(status: DocumentStatus): Promise<Document[]> {
    const result = await this.dynamoClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'status-index',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: marshall({
          ':status': status,
        }),
      })
    );

    if (!result.Items) {
      return [];
    }

    return result.Items.map(item => unmarshall(item) as Document);
  }

  /**
   * List all active documents.
   * 
   * @returns Array of active documents
   */
  async listActive(): Promise<Document[]> {
    return this.listByStatus('ACTIVE');
  }

  /**
   * Get document content from S3.
   * 
   * @param s3Key S3 key
   * @returns Document content as JSON
   */
  async getDocumentContent(s3Key: string): Promise<Document> {
    const result = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      })
    );

    if (!result.Body) {
      throw new Error(`Document not found in S3: ${s3Key}`);
    }

    const content = await result.Body.transformToString();
    return JSON.parse(content) as Document;
  }
}
