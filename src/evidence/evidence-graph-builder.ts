import { createHash } from 'crypto';
import { EvidenceGraph, EvidenceGraphSchema } from './evidence-graph.schema';
import { EvidenceGraphStore } from './evidence-graph-store';
import { Detection } from '../detection/detection.schema';

/**
 * Evidence Graph Builder Configuration
 */
export interface EvidenceGraphBuilderConfig {
  evidenceGraphStore: EvidenceGraphStore;
}

/**
 * Graph Build Result
 */
export interface GraphBuildResult {
  graph: EvidenceGraph;
  isNew: boolean;  // false if already existed (idempotent)
}

/**
 * Evidence Graph Builder
 * 
 * Links detections to candidates through evidence graphs.
 * 
 * Responsibilities:
 * - Take candidateId + detections
 * - Build evidence graph
 * - Persist graph to DynamoDB
 * - Return graph ID
 * 
 * Does NOT:
 * - Read from candidates table
 * - Perform promotion logic
 * - Create incidents
 * - Emit events (graphs are internal data structures)
 * 
 * Invariants:
 * - Same candidate + same detections → same graph ID
 * - Graph ID is deterministic (replay-safe)
 * - Idempotent storage (safe to retry)
 * - Fail-closed on errors
 */
export class EvidenceGraphBuilder {
  private evidenceGraphStore: EvidenceGraphStore;

  constructor(config: EvidenceGraphBuilderConfig) {
    this.evidenceGraphStore = config.evidenceGraphStore;
  }

  /**
   * Compute deterministic graph ID
   * 
   * @param candidateId - Candidate ID
   * @param detectionIds - Array of detection IDs
   * @returns Deterministic graph ID (SHA-256 hash)
   */
  private computeGraphId(
    candidateId: string,
    detectionIds: string[]
  ): string {
    // Sort detection IDs for determinism (order-independent)
    const sortedDetectionIds = [...detectionIds].sort();
    
    // Concatenate inputs with delimiter
    const input = candidateId + '|' + sortedDetectionIds.join('|');
    
    // Hash with SHA-256
    return createHash('sha256').update(input).digest('hex');
  }

  /**
   * Extract all signal IDs from detections
   * 
   * @param detections - Array of detections
   * @returns Sorted, unique signal IDs
   */
  private extractSignalIds(detections: Detection[]): string[] {
    // Flatten all signal IDs from all detections
    const allSignalIds = detections.flatMap(d => d.signalIds);
    
    // Remove duplicates and sort for determinism
    const uniqueSignalIds = [...new Set(allSignalIds)].sort();
    
    return uniqueSignalIds;
  }

  /**
   * Build evidence graph from candidate and detections
   * 
   * @param candidateId - Candidate ID
   * @param detections - Array of detections
   * @param currentTime - Current timestamp (for determinism)
   * @returns Graph build result
   * @throws If inputs are invalid or storage fails
   */
  async buildGraph(
    candidateId: string,
    detections: Detection[],
    currentTime: string
  ): Promise<GraphBuildResult> {
    // Validate inputs (fail-closed)
    if (!candidateId || candidateId.trim().length === 0) {
      throw new Error('Invalid candidateId: must be non-empty');
    }

    if (!detections || detections.length === 0) {
      throw new Error('Cannot build graph with zero detections');
    }

    // Validate all detections
    for (const detection of detections) {
      if (!detection.detectionId) {
        throw new Error('Invalid detection: missing detectionId');
      }
    }

    // Extract detection IDs
    const detectionIds = detections.map(d => d.detectionId);

    // Extract all signal IDs (deduplicated and sorted)
    const signalIds = this.extractSignalIds(detections);

    // Compute graph ID (deterministic)
    const graphId = this.computeGraphId(candidateId, detectionIds);

    // Build graph object
    const graph: EvidenceGraph = {
      graphId,
      candidateId,
      detectionIds: [...detectionIds].sort(),  // Sort for determinism
      signalIds,  // Already sorted and unique
      createdAt: currentTime
    };

    // Validate graph schema (fail-closed)
    EvidenceGraphSchema.parse(graph);

    // Store graph (idempotent)
    const isNew = await this.evidenceGraphStore.putGraph(graph);

    return { graph, isNew };
  }
}
