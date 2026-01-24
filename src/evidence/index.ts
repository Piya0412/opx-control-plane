/**
 * Evidence Module Exports
 * 
 * Phase 2.4: Evidence Graphs
 * Phase 3.1: Evidence Bundles
 */

// ========================================
// Phase 2.4: Evidence Graph Exports
// ========================================

// Schema
export {
  EvidenceGraph,
  EvidenceGraphSchema,
  EvidenceNode,
  EvidenceNodeSchema,
  EvidenceNodeType,
  EvidenceNodeTypeSchema,
  EvidenceEdge,
  EvidenceEdgeSchema,
  EvidenceEdgeType,
  EvidenceEdgeTypeSchema,
  EntityReference,
  EntityReferenceSchema,
  StoredEvidenceGraph,
  StoredEvidenceGraphSchema,
  computeGraphId,
  parseEvidenceGraph,
  GRAPH_VERSION,
} from './evidence-graph.schema.js';

// Builder
export {
  EvidenceGraphBuilder,
} from './evidence-graph-builder.js';

// Store
export {
  EvidenceGraphStore,
  EvidenceGraphStoreConfig,
  StoreResult,
} from './evidence-graph-store.js';

// Service
export {
  EvidenceGraphService,
  VerifyOptions,
  VerifyResult,
} from './evidence-graph-service.js';

// ========================================
// Phase 3.1: Evidence Bundle Exports
// ========================================

// Schema
export {
  EvidenceBundle,
  EvidenceBundleSchema,
  DetectionSummary,
  DetectionSummarySchema,
  SignalSummary,
  SignalSummarySchema,
  NormalizedSeverity,
  NormalizedSeveritySchema,
} from './evidence-bundle.schema.js';

// Builder
export {
  EvidenceBuilder,
} from './evidence-builder.js';

// Store
export {
  EvidenceStore,
} from './evidence-store.js';

// Utilities
export {
  computeEvidenceId,
} from './evidence-id.js';

export {
  computeSignalSummary,
} from './signal-summary.js';
