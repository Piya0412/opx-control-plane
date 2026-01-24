import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EvidenceGraphBuilder, EvidenceGraphStore } from '../../src/evidence';
import { Detection } from '../../src/detection/detection.schema';

describe('EvidenceGraphBuilder', () => {
  let mockEvidenceGraphStore: EvidenceGraphStore;
  let evidenceGraphBuilder: EvidenceGraphBuilder;

  const mockDetection1: Detection = {
    detectionId: 'detection-1',
    signalIds: ['signal-1', 'signal-2'],
    service: 'testapi',
    severity: 'SEV1',
    ruleId: 'rule-1',
    ruleVersion: '1.0.0',
    detectedAt: '2026-01-21T00:00:00Z',
    confidence: 0.8,
    attributes: { signalCount: 2 }
  };

  const mockDetection2: Detection = {
    detectionId: 'detection-2',
    signalIds: ['signal-3', 'signal-4'],
    service: 'testapi',
    severity: 'SEV1',
    ruleId: 'rule-1',
    ruleVersion: '1.0.0',
    detectedAt: '2026-01-21T00:01:00Z',
    confidence: 0.9,
    attributes: { signalCount: 2 }
  };

  beforeEach(() => {
    // Mock evidence graph store
    mockEvidenceGraphStore = {
      putGraph: vi.fn().mockResolvedValue(true),
      getGraph: vi.fn(),
      getGraphByCandidateId: vi.fn(),
      exists: vi.fn()
    } as any;

    // Create evidence graph builder
    evidenceGraphBuilder = new EvidenceGraphBuilder({
      evidenceGraphStore: mockEvidenceGraphStore
    });
  });

  describe('Graph ID Computation', () => {
    it('should generate same ID for same candidate and detections', async () => {
      const result1 = await evidenceGraphBuilder.buildGraph(
        'candidate-1',
        [mockDetection1],
        '2026-01-21T00:00:00Z'
      );

      const result2 = await evidenceGraphBuilder.buildGraph(
        'candidate-1',
        [mockDetection1],
        '2026-01-21T00:00:00Z'
      );

      expect(result1.graph.graphId).toBe(result2.graph.graphId);
    });

    it('should generate same ID for different detection order', async () => {
      const result1 = await evidenceGraphBuilder.buildGraph(
        'candidate-1',
        [mockDetection1, mockDetection2],
        '2026-01-21T00:00:00Z'
      );

      const result2 = await evidenceGraphBuilder.buildGraph(
        'candidate-1',
        [mockDetection2, mockDetection1],  // Reversed order
        '2026-01-21T00:00:00Z'
      );

      expect(result1.graph.graphId).toBe(result2.graph.graphId);
    });

    it('should generate different ID for different detections', async () => {
      const result1 = await evidenceGraphBuilder.buildGraph(
        'candidate-1',
        [mockDetection1],
        '2026-01-21T00:00:00Z'
      );

      const result2 = await evidenceGraphBuilder.buildGraph(
        'candidate-1',
        [mockDetection2],
        '2026-01-21T00:00:00Z'
      );

      expect(result1.graph.graphId).not.toBe(result2.graph.graphId);
    });

    it('should generate different ID for different candidate', async () => {
      const result1 = await evidenceGraphBuilder.buildGraph(
        'candidate-1',
        [mockDetection1],
        '2026-01-21T00:00:00Z'
      );

      const result2 = await evidenceGraphBuilder.buildGraph(
        'candidate-2',
        [mockDetection1],
        '2026-01-21T00:00:00Z'
      );

      expect(result1.graph.graphId).not.toBe(result2.graph.graphId);
    });
  });

  describe('Graph Building', () => {
    it('should build graph from candidate and detections', async () => {
      const result = await evidenceGraphBuilder.buildGraph(
        'candidate-1',
        [mockDetection1, mockDetection2],
        '2026-01-21T00:00:00Z'
      );

      expect(result.graph).toMatchObject({
        candidateId: 'candidate-1',
        detectionIds: ['detection-1', 'detection-2'],
        signalIds: ['signal-1', 'signal-2', 'signal-3', 'signal-4'],
        createdAt: '2026-01-21T00:00:00Z'
      });
      expect(result.graph.graphId).toBeTruthy();
    });

    it('should sort detection IDs in graph', async () => {
      const result = await evidenceGraphBuilder.buildGraph(
        'candidate-1',
        [mockDetection2, mockDetection1],  // Reversed order
        '2026-01-21T00:00:00Z'
      );

      expect(result.graph.detectionIds).toEqual(['detection-1', 'detection-2']);
    });

    it('should deduplicate and sort signal IDs', async () => {
      const detectionWithDuplicateSignal: Detection = {
        ...mockDetection2,
        detectionId: 'detection-3',
        signalIds: ['signal-1', 'signal-5']  // signal-1 is duplicate
      };

      const result = await evidenceGraphBuilder.buildGraph(
        'candidate-1',
        [mockDetection1, detectionWithDuplicateSignal],
        '2026-01-21T00:00:00Z'
      );

      // Should have unique, sorted signal IDs
      expect(result.graph.signalIds).toEqual(['signal-1', 'signal-2', 'signal-5']);
    });

    it('should store graph in DynamoDB', async () => {
      await evidenceGraphBuilder.buildGraph(
        'candidate-1',
        [mockDetection1],
        '2026-01-21T00:00:00Z'
      );

      expect(mockEvidenceGraphStore.putGraph).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateId: 'candidate-1',
          detectionIds: ['detection-1']
        })
      );
    });

    it('should return isNew=true for new graph', async () => {
      vi.mocked(mockEvidenceGraphStore.putGraph).mockResolvedValueOnce(true);

      const result = await evidenceGraphBuilder.buildGraph(
        'candidate-1',
        [mockDetection1],
        '2026-01-21T00:00:00Z'
      );

      expect(result.isNew).toBe(true);
    });

    it('should return isNew=false for existing graph', async () => {
      vi.mocked(mockEvidenceGraphStore.putGraph).mockResolvedValueOnce(false);

      const result = await evidenceGraphBuilder.buildGraph(
        'candidate-1',
        [mockDetection1],
        '2026-01-21T00:00:00Z'
      );

      expect(result.isNew).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for empty candidateId', async () => {
      await expect(
        evidenceGraphBuilder.buildGraph('', [mockDetection1], '2026-01-21T00:00:00Z')
      ).rejects.toThrow('Invalid candidateId');
    });

    it('should throw error for whitespace-only candidateId', async () => {
      await expect(
        evidenceGraphBuilder.buildGraph('   ', [mockDetection1], '2026-01-21T00:00:00Z')
      ).rejects.toThrow('Invalid candidateId');
    });

    it('should throw error for empty detections array', async () => {
      await expect(
        evidenceGraphBuilder.buildGraph('candidate-1', [], '2026-01-21T00:00:00Z')
      ).rejects.toThrow('Cannot build graph with zero detections');
    });

    it('should throw error for detection without detectionId', async () => {
      const invalidDetection: any = {
        signalIds: ['signal-1'],
        service: 'testapi',
        severity: 'SEV1'
        // Missing detectionId
      };

      await expect(
        evidenceGraphBuilder.buildGraph('candidate-1', [invalidDetection], '2026-01-21T00:00:00Z')
      ).rejects.toThrow('Invalid detection');
    });

    it('should throw error if storage fails', async () => {
      vi.mocked(mockEvidenceGraphStore.putGraph).mockRejectedValueOnce(
        new Error('DynamoDB error')
      );

      await expect(
        evidenceGraphBuilder.buildGraph('candidate-1', [mockDetection1], '2026-01-21T00:00:00Z')
      ).rejects.toThrow('DynamoDB error');
    });
  });

  describe('Signal ID Extraction', () => {
    it('should extract all signal IDs from multiple detections', async () => {
      const result = await evidenceGraphBuilder.buildGraph(
        'candidate-1',
        [mockDetection1, mockDetection2],
        '2026-01-21T00:00:00Z'
      );

      expect(result.graph.signalIds).toContain('signal-1');
      expect(result.graph.signalIds).toContain('signal-2');
      expect(result.graph.signalIds).toContain('signal-3');
      expect(result.graph.signalIds).toContain('signal-4');
    });

    it('should handle detection with single signal', async () => {
      const singleSignalDetection: Detection = {
        ...mockDetection1,
        signalIds: ['signal-1']
      };

      const result = await evidenceGraphBuilder.buildGraph(
        'candidate-1',
        [singleSignalDetection],
        '2026-01-21T00:00:00Z'
      );

      expect(result.graph.signalIds).toEqual(['signal-1']);
    });

    it('should handle detection with many signals', async () => {
      const manySignalsDetection: Detection = {
        ...mockDetection1,
        signalIds: ['signal-1', 'signal-2', 'signal-3', 'signal-4', 'signal-5']
      };

      const result = await evidenceGraphBuilder.buildGraph(
        'candidate-1',
        [manySignalsDetection],
        '2026-01-21T00:00:00Z'
      );

      expect(result.graph.signalIds).toHaveLength(5);
      expect(result.graph.signalIds).toEqual(['signal-1', 'signal-2', 'signal-3', 'signal-4', 'signal-5']);
    });
  });

  describe('Idempotency', () => {
    it('should be safe to retry buildGraph on same inputs', async () => {
      // First call - new graph
      vi.mocked(mockEvidenceGraphStore.putGraph).mockResolvedValueOnce(true);
      const result1 = await evidenceGraphBuilder.buildGraph(
        'candidate-1',
        [mockDetection1],
        '2026-01-21T00:00:00Z'
      );

      // Second call - existing graph
      vi.mocked(mockEvidenceGraphStore.putGraph).mockResolvedValueOnce(false);
      const result2 = await evidenceGraphBuilder.buildGraph(
        'candidate-1',
        [mockDetection1],
        '2026-01-21T00:00:00Z'
      );

      expect(result1.isNew).toBe(true);
      expect(result2.isNew).toBe(false);
      expect(result1.graph.graphId).toBe(result2.graph.graphId);
    });
  });
});
