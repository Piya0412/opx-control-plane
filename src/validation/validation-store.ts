import { DynamoDB } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from './logger';
import { ValidationAttempt, ValidationError } from './validation.schema';

export class ValidationStore {
  private dynamodb = new DynamoDB.DocumentClient();
  private logger = new Logger('ValidationStore');
  private tableName: string;

  constructor(tableName?: string) {
    this.tableName = tableName || process.env.VALIDATION_ERRORS_TABLE || 'opx-validation-errors';
  }

  /**
   * Store validation error (non-blocking)
   */
  async storeValidationError(params: {
    agentId: string;
    sessionId: string;
    attempt: number;
    validationLayer: 'schema' | 'business' | 'semantic';
    error: ValidationError;
    rawOutput?: string;
  }): Promise<void> {
    const errorId = uuidv4();
    const timestamp = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60); // 90 days

    const item: ValidationAttempt = {
      errorId,
      timestamp,
      ttl,
      agentId: params.agentId,
      sessionId: params.sessionId,
      attempt: params.attempt,
      validationLayer: params.validationLayer,
      errorMessage: params.error.message,
      errorDetails: params.error.details,
      rawOutput: params.rawOutput,
    };

    try {
      await this.dynamodb.put({
        TableName: this.tableName,
        Item: item,
      }).promise();

      this.logger.debug('Validation error stored', {
        errorId,
        agentId: params.agentId,
        layer: params.validationLayer,
      });
    } catch (error) {
      // Never block on storage failure
      this.logger.warn('Failed to store validation error', {
        error: error instanceof Error ? error.message : String(error),
        agentId: params.agentId,
      });
    }
  }

  /**
   * Query validation errors by agent
   */
  async queryByAgent(params: {
    agentId: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
  }): Promise<ValidationAttempt[]> {
    try {
      const result = await this.dynamodb.query({
        TableName: this.tableName,
        IndexName: 'agent-timestamp-index',
        KeyConditionExpression: 'agentId = :agentId',
        ExpressionAttributeValues: {
          ':agentId': params.agentId,
        },
        Limit: params.limit || 100,
        ScanIndexForward: false, // Most recent first
      }).promise();

      return (result.Items || []) as ValidationAttempt[];
    } catch (error) {
      this.logger.error('Failed to query validation errors', {
        error: error instanceof Error ? error.message : String(error),
        agentId: params.agentId,
      });
      return [];
    }
  }

  /**
   * Query validation errors by layer
   */
  async queryByLayer(params: {
    validationLayer: 'schema' | 'business' | 'semantic';
    limit?: number;
  }): Promise<ValidationAttempt[]> {
    try {
      const result = await this.dynamodb.query({
        TableName: this.tableName,
        IndexName: 'layer-timestamp-index',
        KeyConditionExpression: 'validationLayer = :layer',
        ExpressionAttributeValues: {
          ':layer': params.validationLayer,
        },
        Limit: params.limit || 100,
        ScanIndexForward: false,
      }).promise();

      return (result.Items || []) as ValidationAttempt[];
    } catch (error) {
      this.logger.error('Failed to query validation errors by layer', {
        error: error instanceof Error ? error.message : String(error),
        layer: params.validationLayer,
      });
      return [];
    }
  }
}
