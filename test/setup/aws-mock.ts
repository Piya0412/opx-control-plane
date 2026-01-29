/**
 * Global AWS SDK Mock Setup
 * 
 * This file provides a single, global mocking layer for all AWS SDK v3 clients.
 * It ensures that:
 * 1. No real AWS SDK clients are ever instantiated during tests
 * 2. All AWS service interactions are mocked
 * 3. Tests run successfully in completely clean CI environments
 * 4. No AWS credentials or region configuration is required
 * 
 * Architecture:
 * - Mocks are initialized before any test code runs
 * - Mocks are reset between tests to avoid cross-test pollution
 * - All AWS SDK clients use mock implementations
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { SNSClient } from '@aws-sdk/client-sns';
import { STSClient } from '@aws-sdk/client-sts';
import { beforeEach, afterEach } from 'vitest';

/**
 * Global mock instances
 * These are created once and reused across all tests
 */
export const dynamoMock = mockClient(DynamoDBClient);
export const dynamoDocMock = mockClient(DynamoDBDocumentClient);
export const cloudwatchMock = mockClient(CloudWatchClient);
export const eventBridgeMock = mockClient(EventBridgeClient);
export const lambdaMock = mockClient(LambdaClient);
export const snsMock = mockClient(SNSClient);
export const stsMock = mockClient(STSClient);

/**
 * Mock AWS environment variables
 * These are set globally to ensure no code path tries to resolve real AWS config
 */
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';

/**
 * Global test lifecycle hooks
 * Reset all mocks before each test to ensure test isolation
 */
beforeEach(() => {
  // Reset all AWS SDK mocks
  dynamoMock.reset();
  dynamoDocMock.reset();
  cloudwatchMock.reset();
  eventBridgeMock.reset();
  lambdaMock.reset();
  snsMock.reset();
  stsMock.reset();
});

afterEach(() => {
  // Additional cleanup if needed
  // Mocks are already reset in beforeEach, but this hook is available
  // for test-specific cleanup
});

/**
 * Helper function to create mock AWS credentials
 * Use this in tests that explicitly need to pass credentials to constructors
 */
export function getMockCredentials() {
  return {
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
  };
}

/**
 * Helper function to get mock AWS region
 * Use this in tests that explicitly need to pass region to constructors
 */
export function getMockRegion() {
  return 'us-east-1';
}

/**
 * Helper function to create a mock DynamoDB in-memory store
 * This provides a simple key-value store for tests that need stateful mocking
 */
export function createMockDynamoStore() {
  return new Map<string, any>();
}
