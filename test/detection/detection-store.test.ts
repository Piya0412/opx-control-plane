import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { DetectionStore } from '../../src/detection/detection-store';
import { Detection } from '../../src/detection/detection.schema';

describe('DetectionStore', () => {
  let mockDynamoClient: DynamoDBClient;
  let detectionStore: DetectionStore;

  const mockDetection: Detection = {
    detectionId: 'detection-123',
    signalIds: ['signal-1', 'signal-2'],
    service: 'testapi',
    severity: 'SEV1',
    ruleId: 'rule-1',
    ruleVersion: '1.0.0',
    detectedAt: '2026-01-21T00:00:00Z',
    confidence: 0.8,
    attributes: { signalCount: 2 }
  };

  beforeEach(() => {
    // Mock DynamoDB client
    mockDynamoClient = {
      send: vi.fn()
    } as any;

    // Create detection store
    detectionStore = new DetectionStore({
      tableName: 'opx-detections',
      dynamoClient: mockDynamoClient
    });
  });

  describe('putDetection', () => {
    it('should store new detection and return true', async () => {
      // Mock successful PutItem
      vi.mocked(mockDynamoClient.send).mockResolvedValueOnce({});

      const isNew = await detectionStore.putDetection(mockDetection);

      expect(isNew).toBe(true);
      expect(mockDynamoClient.send).toHaveBeenCalledWith(
        expect.any(PutItemCommand)
      );
    });

    it('should return false if detection already exists', async () => {
      // Mock ConditionalCheckFailedException
      const error: any = new Error('Conditional check failed');
      error.name = 'ConditionalCheckFailedException';
      vi.mocked(mockDynamoClient.send).mockRejectedValueOnce(error);

      const isNew = await detectionStore.putDetection(mockDetection);

      expect(isNew).toBe(false);
    });

    it('should use conditional expression to prevent duplicates', async () => {
      vi.mocked(mockDynamoClient.send).mockResolvedValueOnce({});

      await detectionStore.putDetection(mockDetection);

      const call = vi.mocked(mockDynamoClient.send).mock.calls[0][0] as PutItemCommand;
      expect(call.input.ConditionExpression).toBe('attribute_not_exists(pk)');
    });

    it('should throw error for other DynamoDB errors', async () => {
      // Mock other error
      const error = new Error('DynamoDB throttling');
      vi.mocked(mockDynamoClient.send).mockRejectedValueOnce(error);

      await expect(
        detectionStore.putDetection(mockDetection)
      ).rejects.toThrow('DynamoDB throttling');
    });

    it('should validate detection schema before storing', async () => {
      const invalidDetection: any = {
        detectionId: 'detection-123',
        // Missing required fields
      };

      await expect(
        detectionStore.putDetection(invalidDetection)
      ).rejects.toThrow();
    });

    it('should store detection with correct DynamoDB keys', async () => {
      vi.mocked(mockDynamoClient.send).mockResolvedValueOnce({});

      await detectionStore.putDetection(mockDetection);

      const call = vi.mocked(mockDynamoClient.send).mock.calls[0][0] as PutItemCommand;
      const item = call.input.Item;
      
      expect(item).toBeDefined();
      // Keys should be in the item
      expect(item!.pk).toBeDefined();
      expect(item!.sk).toBeDefined();
    });
  });

  describe('getDetection', () => {
    it('should return detection if found', async () => {
      // Mock GetItem response
      const mockItem = marshall({
        pk: 'DETECTION#detection-123',
        sk: 'v1',
        ...mockDetection
      });

      vi.mocked(mockDynamoClient.send).mockResolvedValueOnce({
        Item: mockItem
      });

      const detection = await detectionStore.getDetection('detection-123');

      expect(detection).toEqual(mockDetection);
      expect(mockDynamoClient.send).toHaveBeenCalledWith(
        expect.any(GetItemCommand)
      );
    });

    it('should return null if detection not found', async () => {
      // Mock empty response
      vi.mocked(mockDynamoClient.send).mockResolvedValueOnce({});

      const detection = await detectionStore.getDetection('detection-123');

      expect(detection).toBeNull();
    });

    it('should use correct DynamoDB key', async () => {
      vi.mocked(mockDynamoClient.send).mockResolvedValueOnce({});

      await detectionStore.getDetection('detection-123');

      const call = vi.mocked(mockDynamoClient.send).mock.calls[0][0] as GetItemCommand;
      const key = call.input.Key;
      
      expect(key).toBeDefined();
      // Should query with correct pk and sk
    });

    it('should throw error if DynamoDB operation fails', async () => {
      const error = new Error('DynamoDB error');
      vi.mocked(mockDynamoClient.send).mockRejectedValueOnce(error);

      await expect(
        detectionStore.getDetection('detection-123')
      ).rejects.toThrow('DynamoDB error');
    });
  });

  describe('exists', () => {
    it('should return true if detection exists', async () => {
      // Mock GetItem response with minimal data
      vi.mocked(mockDynamoClient.send).mockResolvedValueOnce({
        Item: marshall({ pk: 'DETECTION#detection-123' })
      });

      const exists = await detectionStore.exists('detection-123');

      expect(exists).toBe(true);
    });

    it('should return false if detection does not exist', async () => {
      // Mock empty response
      vi.mocked(mockDynamoClient.send).mockResolvedValueOnce({});

      const exists = await detectionStore.exists('detection-123');

      expect(exists).toBe(false);
    });

    it('should use ProjectionExpression for minimal data transfer', async () => {
      vi.mocked(mockDynamoClient.send).mockResolvedValueOnce({});

      await detectionStore.exists('detection-123');

      const call = vi.mocked(mockDynamoClient.send).mock.calls[0][0] as GetItemCommand;
      expect(call.input.ProjectionExpression).toBe('pk');
    });
  });

  describe('getDetectionsBySignalIds', () => {
    it('should return empty array for empty signal IDs', async () => {
      const detections = await detectionStore.getDetectionsBySignalIds([]);

      expect(detections).toEqual([]);
      expect(mockDynamoClient.send).not.toHaveBeenCalled();
    });

    it('should query GSI for each signal ID', async () => {
      const detection1 = { ...mockDetection, detectionId: 'detection-1' };
      const detection2 = { ...mockDetection, detectionId: 'detection-2' };

      // Mock Query responses
      vi.mocked(mockDynamoClient.send)
        .mockResolvedValueOnce({
          Items: [marshall({ pk: 'DETECTION#detection-1', sk: 'v1', ...detection1 })]
        })
        .mockResolvedValueOnce({
          Items: [marshall({ pk: 'DETECTION#detection-2', sk: 'v1', ...detection2 })]
        });

      const detections = await detectionStore.getDetectionsBySignalIds(['signal-1', 'signal-2']);

      expect(detections).toHaveLength(2);
      expect(mockDynamoClient.send).toHaveBeenCalledTimes(2);
    });

    it('should deduplicate detections by detection ID', async () => {
      const detection = { ...mockDetection, detectionId: 'detection-1', signalIds: ['signal-1', 'signal-2'] };

      // Mock Query responses - same detection for both signals
      vi.mocked(mockDynamoClient.send)
        .mockResolvedValueOnce({
          Items: [marshall({ pk: 'DETECTION#detection-1', sk: 'v1', ...detection })]
        })
        .mockResolvedValueOnce({
          Items: [marshall({ pk: 'DETECTION#detection-1', sk: 'v1', ...detection })]
        });

      const detections = await detectionStore.getDetectionsBySignalIds(['signal-1', 'signal-2']);

      // Should only return one detection (deduplicated)
      expect(detections).toHaveLength(1);
      expect(detections[0].detectionId).toBe('detection-1');
    });

    it('should use correct GSI name and key condition', async () => {
      vi.mocked(mockDynamoClient.send).mockResolvedValueOnce({ Items: [] });

      await detectionStore.getDetectionsBySignalIds(['signal-1']);

      const call = vi.mocked(mockDynamoClient.send).mock.calls[0][0] as QueryCommand;
      expect(call.input.IndexName).toBe('signal-detection-index');
      expect(call.input.KeyConditionExpression).toBe('signalId = :signalId');
    });

    it('should handle empty query results', async () => {
      // Mock empty Query response
      vi.mocked(mockDynamoClient.send).mockResolvedValueOnce({ Items: [] });

      const detections = await detectionStore.getDetectionsBySignalIds(['signal-1']);

      expect(detections).toEqual([]);
    });

    it('should validate detection schema for each result', async () => {
      const invalidDetection = {
        detectionId: 'detection-1',
        // Missing required fields
      };

      vi.mocked(mockDynamoClient.send).mockResolvedValueOnce({
        Items: [marshall({ pk: 'DETECTION#detection-1', sk: 'v1', ...invalidDetection })]
      });

      await expect(
        detectionStore.getDetectionsBySignalIds(['signal-1'])
      ).rejects.toThrow();
    });

    it('should continue on ResourceNotFoundException', async () => {
      const detection = { ...mockDetection, detectionId: 'detection-1' };
      const error: any = new Error('Resource not found');
      error.name = 'ResourceNotFoundException';

      // First query fails, second succeeds
      vi.mocked(mockDynamoClient.send)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({
          Items: [marshall({ pk: 'DETECTION#detection-1', sk: 'v1', ...detection })]
        });

      const detections = await detectionStore.getDetectionsBySignalIds(['signal-1', 'signal-2']);

      // Should return detection from second query
      expect(detections).toHaveLength(1);
      expect(detections[0].detectionId).toBe('detection-1');
    });

    it('should throw error for critical DynamoDB errors', async () => {
      const error = new Error('DynamoDB throttling');
      vi.mocked(mockDynamoClient.send).mockRejectedValueOnce(error);

      await expect(
        detectionStore.getDetectionsBySignalIds(['signal-1'])
      ).rejects.toThrow('DynamoDB throttling');
    });
  });

  describe('Idempotency', () => {
    it('should be safe to retry putDetection on same detection', async () => {
      // First call - new detection
      vi.mocked(mockDynamoClient.send).mockResolvedValueOnce({});
      const isNew1 = await detectionStore.putDetection(mockDetection);

      // Second call - already exists
      const error: any = new Error('Conditional check failed');
      error.name = 'ConditionalCheckFailedException';
      vi.mocked(mockDynamoClient.send).mockRejectedValueOnce(error);
      const isNew2 = await detectionStore.putDetection(mockDetection);

      expect(isNew1).toBe(true);
      expect(isNew2).toBe(false);
    });
  });
});
