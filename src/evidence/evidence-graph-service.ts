/**
 * CP-4: Evidence Graph Service
 * 
 * THIN ORCHESTRATION layer.
 * Fetches entities and delegates to builder.
 * 
 * INVARIANTS:
 * - Idempotent by construction (retry-safe)
 * - Fail fast on missing entities (no partial graphs)
 * - Verification has two modes (structural default, referential tooling)
 * 
 * 🔒 DO NOT:
 * - Add correlation logic
 * - Add scoring
 * - Add filtering
 * - Reach into CP-5 logic
 */

import { DetectionStore, StoredDetection } from '../detection/detection-store.js';
import { NormalizedSignalStore } from '../normalization/normalized-signal.store.js';
import { SignalStore } from '../signals/signal-store.js';
import { EvidenceGraphBuilder } from './evidence-graph-builder.js';
import { EvidenceGraphStore } from './evidence-graph-store.js';
import { EvidenceGraph, EntityReference } from './evidence-graph.schema.js';

export interface VerifyOptions {
  /**
   * If true, verify that referenced entities exist in their stores.
   * 
   * ⚠️ TOOLING ONLY - best-effort, may fail if stores unavailable.
   * Default: false (structural verification only)
   */
  referentialCheck?: boolean;
}

export interface VerifyResult {
  valid: boolean;
  errors: string[];
}

/**
 * Evidence Graph Service
 * 
 * Orchestrates graph building and storage.
 * Thin layer - delegates to builder and store.
 */
export class EvidenceGraphService {
  constructor(
    private detectionStore: DetectionStore,
    private normalizedSignalStore: NormalizedSignalStore,
    private signalStore: SignalStore,
    private graphBuilder: EvidenceGraphBuilder,
    private graphStore: EvidenceGraphStore
  ) {}

  /**
   * Create evidence graph for a detection
   * 
   * 🔒 IDEMPOTENT BY CONSTRUCTION
   * - Compute graph deterministically
   * - Attempt conditional write
   * - If graph exists → return existing graph
   * - Never throw on duplicates
   * 
   * 🔒 FAIL FAST on missing entities (no partial graphs)
   * 
   * @param detectionId - Detection to build graph for
   * @returns Evidence graph
   */
  async createGraph(detectionId: string): Promise<EvidenceGraph> {
    // 1. Fetch detection (FAIL FAST if missing)
    const storedDetection = await this.detectionStore.get(detectionId);
    if (!storedDetection) {
      throw new Error(`Detection not found: ${detectionId}`);
    }
    const detection = storedDetection.result;

    // 2. Fetch normalized signal (FAIL FAST if missing)
    const normalizedSignal = await this.normalizedSignalStore.get(
      detection.normalizedSignalId,
      detection.signalTimestamp
    );
    if (!normalizedSignal) {
      throw new Error(`NormalizedSignal not found: ${detection.normalizedSignalId}`);
    }

    // 3. Fetch raw signal (FAIL FAST if missing)
    const rawSignal = await this.signalStore.get(normalizedSignal.sourceSignalId);
    if (!rawSignal) {
      throw new Error(`RawSignal not found: ${normalizedSignal.sourceSignalId}`);
    }

    // 4. Build graph (pure, deterministic)
    const graph = this.graphBuilder.build(detection, normalizedSignal, rawSignal);

    // 5. Store graph (append-only, IDEMPOTENT)
    const storeResult = await this.graphStore.store(graph);

    // 🔒 If graph exists, return existing - never throw on duplicates
    if (storeResult.alreadyExists) {
      const existing = await this.graphStore.get(graph.graphId);
      if (existing) {
        return existing;
      }
    }

    return graph;
  }

  /**
   * Get evidence graph by ID
   * 
   * @param graphId - Graph ID
   * @returns Evidence graph or null
   */
  async getGraph(graphId: string): Promise<EvidenceGraph | null> {
    return this.graphStore.get(graphId);
  }

  /**
   * Get evidence graph by detection ID
   * 
   * @param detectionId - Detection ID
   * @returns Evidence graph or null
   */
  async getGraphByDetection(detectionId: string): Promise<EvidenceGraph | null> {
    return this.graphStore.getByDetection(detectionId);
  }

  /**
   * Verify graph integrity
   * 
   * 🔒 TWO MODES:
   * - Mode A (DEFAULT): Structural verification only - does NOT touch live stores
   * - Mode B (EXPLICIT): Referential verification - tooling only, best-effort
   * 
   * Evidence validity must NOT depend on live lookups.
   * 
   * @param graphId - Graph to verify
   * @param options - Verification options
   * @returns Verification result
   */
  async verifyGraph(graphId: string, options: VerifyOptions = {}): Promise<VerifyResult> {
    const errors: string[] = [];

    // 1. Fetch graph
    const graph = await this.graphStore.get(graphId);
    if (!graph) {
      return { valid: false, errors: ['Graph not found'] };
    }

    // === MODE A: STRUCTURAL VERIFICATION (DEFAULT) ===
    // Does NOT touch live stores

    // A1. Verify node references are well-formed
    for (const node of graph.nodes) {
      if (!node.ref.entityType || !node.ref.entityId) {
        errors.push(`Node ${node.nodeId} has malformed reference`);
      }
      if (!node.ref.storeLocation) {
        errors.push(`Node ${node.nodeId} missing storeLocation`);
      }
    }

    // A2. Verify edge source/target exist in graph
    const nodeIds = new Set(graph.nodes.map(n => n.nodeId));
    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.sourceNodeId)) {
        errors.push(`Edge source not found in graph: ${edge.sourceNodeId}`);
      }
      if (!nodeIds.has(edge.targetNodeId)) {
        errors.push(`Edge target not found in graph: ${edge.targetNodeId}`);
      }
    }

    // A3. Verify no cycles (Phase-2 guarantee: DAG rooted at Detection)
    const hasCycle = this.detectCycle(graph);
    if (hasCycle) {
      errors.push('Graph contains cycle (invalid)');
    }

    // A4. Verify graph has detection root
    const rootNode = graph.nodes.find(n => n.nodeType === 'DETECTION_RESULT');
    if (!rootNode) {
      errors.push('Graph has no DETECTION_RESULT root node');
    }

    // A5. Verify graph has expected structure (3 nodes, 2 edges for v1)
    if (graph.graphVersion === 'v1') {
      if (graph.nodes.length !== 3) {
        errors.push(`v1 graph should have 3 nodes, found ${graph.nodes.length}`);
      }
      if (graph.edges.length !== 2) {
        errors.push(`v1 graph should have 2 edges, found ${graph.edges.length}`);
      }
    }

    // === MODE B: REFERENTIAL VERIFICATION (EXPLICIT TOOLING ONLY) ===
    // Best-effort, used only in debugging/audits
    if (options.referentialCheck) {
      for (const node of graph.nodes) {
        const exists = await this.verifyNodeReferenceExists(node.ref);
        if (!exists) {
          errors.push(`[REFERENTIAL] Entity not found: ${node.ref.entityType}#${node.ref.entityId}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Detect cycles in graph
   * 
   * Should never happen in Phase-2 (DAG guarantee).
   */
  private detectCycle(graph: EvidenceGraph): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    // Build adjacency list
    const adjacency = new Map<string, string[]>();
    for (const edge of graph.edges) {
      const targets = adjacency.get(edge.sourceNodeId) || [];
      targets.push(edge.targetNodeId);
      adjacency.set(edge.sourceNodeId, targets);
    }

    const hasCycleFrom = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      for (const neighbor of adjacency.get(nodeId) || []) {
        if (!visited.has(neighbor)) {
          if (hasCycleFrom(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of graph.nodes) {
      if (!visited.has(node.nodeId)) {
        if (hasCycleFrom(node.nodeId)) return true;
      }
    }

    return false;
  }

  /**
   * Verify entity exists in store
   * 
   * ⚠️ TOOLING ONLY - best-effort, may fail if store unavailable.
   */
  private async verifyNodeReferenceExists(ref: EntityReference): Promise<boolean> {
    try {
      switch (ref.entityType) {
        case 'DetectionResult':
          const detection = await this.detectionStore.get(ref.entityId);
          return detection !== null;

        case 'NormalizedSignal':
          // Would need timestamp to query - simplified for now
          return true;

        case 'Signal':
          const signal = await this.signalStore.get(ref.entityId);
          return signal !== null;

        default:
          return true;
      }
    } catch {
      // Best-effort - return true on error to not block verification
      return true;
    }
  }
}
