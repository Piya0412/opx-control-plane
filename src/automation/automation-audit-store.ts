/**
 * Phase 5 - Step 1: Automation Audit Store
 * 
 * Append-only store for automation audit records.
 * 
 * RULES:
 * - Append-only (no delete methods)
 * - Idempotent writes (conditional PutItem)
 * - Status updates allowed (RUNNING → SUCCESS/FAILED)
 * - Full auditability
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  AutomationAudit,
  OperationType,
  OperationStatus,
  OperationResults,
} from './automation-audit.schema';

/**
 * Query Options
 */
export interface QueryOptions {
  operationType?: OperationType;
  status?: OperationStatus;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

/**
 * Automation Audit Store
 * 
 * Append-only store for automation audit records.
 */
export class AutomationAuditStore {
  private readonly docClient: DynamoDBDocumentClient;
  
  constructor(
    dynamoClient: DynamoDBClient,
    private readonly tableName: string
  ) {
    this.docClient = DynamoDBDocumentClient.from(dynamoClient);
  }
  
  /**
   * Record audit entry
   * 
   * Idempotent: Returns false if audit already exists.
   * 
   * @param audit - Audit record to store
   * @returns true if created, false if already exists
   */
  async recordAudit(audit: AutomationAudit): Promise<boolean> {
    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: `AUDIT#${audit.auditId}`,
            SK: 'METADATA',
            ...audit,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );
      return true; // Created
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        return false; // Already exists
      }
      throw error;
    }
  }
  
  /**
   * Get audit by ID
   * 
   * @param auditId - Audit ID to retrieve
   * @returns Audit record or null if not found
   */
  async getAudit(auditId: string): Promise<AutomationAudit | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `AUDIT#${auditId}`,
          SK: 'METADATA',
        },
      })
    );
    
    if (!result.Item) {
      return null;
    }
    
    const { PK, SK, ...audit } = result.Item;
    return audit as AutomationAudit;
  }
  
  /**
   * List audits by operation type
   * 
   * Uses OperationTypeIndex GSI.
   * 
   * @param operationType - Type of operation to filter by
   * @param options - Query options
   * @returns Array of audit records
   */
  async listAuditsByType(
    operationType: OperationType,
    options: { startDate?: string; endDate?: string; limit?: number } = {}
  ): Promise<AutomationAudit[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'OperationTypeIndex',
        KeyConditionExpression: 'operationType = :type',
        ExpressionAttributeValues: {
          ':type': operationType,
        },
        Limit: options.limit || 100,
        ScanIndexForward: false, // Most recent first
      })
    );
    
    return (result.Items || []).map(item => {
      const { PK, SK, ...audit } = item;
      return audit as AutomationAudit;
    });
  }
  
  /**
   * List audits by status
   * 
   * Uses StatusIndex GSI.
   * 
   * @param status - Status to filter by
   * @param options - Query options
   * @returns Array of audit records
   */
  async listAuditsByStatus(
    status: OperationStatus,
    options: { limit?: number } = {}
  ): Promise<AutomationAudit[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': status,
        },
        Limit: options.limit || 100,
        ScanIndexForward: false, // Most recent first
      })
    );
    
    return (result.Items || []).map(item => {
      const { PK, SK, ...audit } = item;
      return audit as AutomationAudit;
    });
  }
  
  /**
   * Update audit status
   * 
   * Used to mark RUNNING → SUCCESS/FAILED.
   * 
   * @param auditId - Audit ID to update
   * @param status - New status
   * @param endTime - End time (ISO-8601)
   * @param results - Operation results (optional)
   * @param errorMessage - Error message (optional)
   * @param errorStack - Error stack trace (optional)
   */
  async updateAuditStatus(
    auditId: string,
    status: OperationStatus,
    endTime: string,
    results?: OperationResults,
    errorMessage?: string,
    errorStack?: string
  ): Promise<void> {
    const updateExpression: string[] = [
      '#status = :status',
      'endTime = :endTime',
    ];
    
    const expressionAttributeNames: Record<string, string> = {
      '#status': 'status',
    };
    
    const expressionAttributeValues: Record<string, any> = {
      ':status': status,
      ':endTime': endTime,
    };
    
    if (results) {
      updateExpression.push('results = :results');
      expressionAttributeValues[':results'] = results;
    }
    
    if (errorMessage) {
      updateExpression.push('errorMessage = :errorMessage');
      expressionAttributeValues[':errorMessage'] = errorMessage;
    }
    
    if (errorStack) {
      updateExpression.push('errorStack = :errorStack');
      expressionAttributeValues[':errorStack'] = errorStack;
    }
    
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: `AUDIT#${auditId}`,
          SK: 'METADATA',
        },
        UpdateExpression: 'SET ' + updateExpression.join(', '),
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    );
  }
}
