/**
 * Phase 6 Step 2: Agent Schemas (Corrected)
 * 
 * All agent input/output schemas with Zod validation.
 */

import { z } from 'zod';

// ============================================================================
// Replayable Input Wrapper
// ============================================================================

export const ReplayableInputSchema = z.object({
  capturedAt: z.string().datetime(),
  dataVersion: z.string(),
  source: z.enum(['EVIDENCE_BUNDLE', 'INCIDENT_SNAPSHOT', 'HISTORICAL_PROJECTION']),
  checksum: z.string().length(64), // SHA-256
});

export type ReplayableInput = z.infer<typeof ReplayableInputSchema>;

// ============================================================================
// Incident Snapshot (from Phase 4)
// ============================================================================

export const IncidentSnapshotSchema = z.object({
  incidentId: z.string(),
  service: z.string(),
  severity: z.string(),
  status: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type IncidentSnapshot = z.infer<typeof IncidentSnapshotSchema>;

// ============================================================================
// Signal Summary (pre-aggregated)
// ============================================================================

export const SignalSummarySchema = z.object({
  signalId: z.string(),
  signalType: z.enum(['METRIC', 'LOG', 'TRACE']),
  service: z.string(),
  observedAt: z.string().datetime(),
  summary: z.object({
    severity: z.string(),
    count: z.number(),
    sampleMessages: z.array(z.string()).max(3).optional(),
    aggregatedMetrics: z.array(z.object({
      metric: z.string(),
      baseline: z.number(),
      observed: z.number(),
      deviation: z.number(),
    })).optional(),
  }),
  maxTokens: z.number().max(200),
});

export type SignalSummary = z.infer<typeof SignalSummarySchema>;

// ============================================================================
// Evidence Bundle (from Phase 3.1)
// ============================================================================

export const EvidenceBundleSchema = z.object({
  evidenceId: z.string(),
  bundledAt: z.string().datetime(),
  signalSummaries: z.array(SignalSummarySchema),
  detectionSummaries: z.array(z.any()), // Simplified for now
  metricSummaries: z.array(z.any()), // Simplified for now
});

export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;

// ============================================================================
// Base Agent Input
// ============================================================================

export const BaseAgentInputSchema = z.object({
  incidentSnapshot: IncidentSnapshotSchema,
  evidenceBundle: EvidenceBundleSchema,
  replayable: ReplayableInputSchema,
});

export type BaseAgentInput = z.infer<typeof BaseAgentInputSchema>;

// ============================================================================
// Normalized Confidence
// ============================================================================

export const NormalizedConfidenceSchema = z.object({
  confidence_estimate: z.number().min(0).max(1),
  confidence_basis: z.array(z.enum(['data', 'pattern', 'assumption'])),
  confidence_breakdown: z.object({
    data_quality: z.number().min(0).max(1),
    pattern_strength: z.number().min(0).max(1),
    assumption_count: z.number().int().min(0),
  }),
});

export type NormalizedConfidence = z.infer<typeof NormalizedConfidenceSchema>;

// ============================================================================
// Hypothesis (not truth)
// ============================================================================

export const HypothesisSchema = z.object({
  type: z.enum(['ROOT_CAUSE', 'CORRELATION', 'PATTERN']),
  description: z.string().min(1).max(500),
  confidence: NormalizedConfidenceSchema,
  supporting_evidence: z.array(z.string()).max(10),
  contradicting_evidence: z.array(z.string()).max(5),
});

export type Hypothesis = z.infer<typeof HypothesisSchema>;

// ============================================================================
// Recommendation (non-authoritative)
// ============================================================================

export const RecommendationSchema = z.object({
  type: z.enum(['INVESTIGATION', 'MITIGATION', 'ROLLBACK']),
  description: z.string().min(1).max(300),
  risk_estimate: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  confidence: NormalizedConfidenceSchema,
  rationale: z.string().min(1).max(200),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

// ============================================================================
// Agent Output Envelope
// ============================================================================

export const AgentRecommendationSchema = z.object({
  // Agent identity
  agentId: z.string(),
  agentVersion: z.string(),
  schemaVersion: z.string(),
  
  // Model identity
  modelId: z.string(),
  modelVersion: z.string(),
  
  // Incident context
  incidentId: z.string(),
  
  // Hypothesis (not truth)
  hypothesis: HypothesisSchema,
  
  // Recommendations (non-authoritative)
  recommendations: z.array(RecommendationSchema).max(5),
  
  // Metadata
  executedAt: z.string().datetime(),
  durationMs: z.number(),
  estimated_cost_usd: z.number(),
  
  // Explicit disclaimer
  disclaimer: z.literal('HYPOTHESIS_ONLY_NOT_AUTHORITATIVE'),
});

export type AgentRecommendation = z.infer<typeof AgentRecommendationSchema>;

// ============================================================================
// Signal Analysis Input
// ============================================================================

export const SignalAnalysisInputSchema = BaseAgentInputSchema;
export type SignalAnalysisInput = z.infer<typeof SignalAnalysisInputSchema>;

// ============================================================================
// Historical Incident Input
// ============================================================================

export const IncidentProjectionSchema = z.object({
  incidentId: z.string(),
  service: z.string(),
  severity: z.string(),
  status: z.string(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
  resolutionSummary: z.object({
    type: z.string(),
    timeToResolveMinutes: z.number(),
    actions: z.array(z.string()),
  }).optional(),
  projectionVersion: z.string(),
  projectedAt: z.string().datetime(),
});

export type IncidentProjection = z.infer<typeof IncidentProjectionSchema>;

export const HistoricalIncidentInputSchema = BaseAgentInputSchema.extend({
  historicalProjections: z.array(IncidentProjectionSchema),
});

export type HistoricalIncidentInput = z.infer<typeof HistoricalIncidentInputSchema>;

// ============================================================================
// Change Intelligence Input
// ============================================================================

export const ChangeRecordSchema = z.object({
  changeId: z.string(),
  type: z.enum(['DEPLOYMENT', 'CONFIG', 'INFRASTRUCTURE']),
  service: z.string(),
  timestamp: z.string().datetime(),
  
  // Explicit source marking
  source: z.enum(['MOCK', 'DERIVED', 'AUTHORITATIVE']),
  sourceSystem: z.string().optional(),
  
  details: z.record(z.any()),
});

export type ChangeRecord = z.infer<typeof ChangeRecordSchema>;

export const ChangeIntelligenceInputSchema = BaseAgentInputSchema.extend({
  changeRecords: z.array(ChangeRecordSchema),
});

export type ChangeIntelligenceInput = z.infer<typeof ChangeIntelligenceInputSchema>;


// ============================================================================
// Phase 6 Step 3: Extended Schemas for Advanced Agents
// ============================================================================

// Service Dependency Snapshot (from Phase 5)
export const ServiceDependencySnapshotSchema = z.object({
  service: z.string(),
  snapshotAt: z.string().datetime(),
  snapshotVersion: z.string(),
  dependencies: z.array(z.object({
    service: z.string(),
    type: z.enum(['SYNC', 'ASYNC', 'DATA']),
    criticality: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  })),
  dependents: z.array(z.object({
    service: z.string(),
    type: z.enum(['SYNC', 'ASYNC', 'DATA']),
    criticality: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  })),
  trafficSummary: z.object({
    requestsPerMinute: z.number(),
    errorRate: z.number(),
    activeUsers: z.number(),
    p99Latency: z.number(),
  }),
  source: z.literal('DERIVED'),
  checksum: z.string().length(64),
});

export type ServiceDependencySnapshot = z.infer<typeof ServiceDependencySnapshotSchema>;

// Traffic Impact Summary (from Phase 5)
export const TrafficImpactSummarySchema = z.object({
  service: z.string(),
  timeWindow: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  summarizedAt: z.string().datetime(),
  estimatedAffectedUsers: z.number(),
  estimatedAffectedRequests: z.number(),
  errorRateIncrease: z.number(),
  latencyIncrease: z.number(),
  propagationPaths: z.array(z.object({
    from: z.string(),
    to: z.string(),
    probability: z.number().min(0).max(1),
    estimatedLatency: z.number(),
  })),
  source: z.literal('DERIVED'),
  checksum: z.string().length(64),
});

export type TrafficImpactSummary = z.infer<typeof TrafficImpactSummarySchema>;

// Knowledge Chunk Projection (from Phase 7)
export const KnowledgeChunkProjectionSchema = z.object({
  chunkId: z.string(),
  documentId: z.string(),
  documentType: z.enum(['RUNBOOK', 'POSTMORTEM', 'ARCHITECTURE', 'PLAYBOOK']),
  title: z.string(),
  excerpt: z.string().max(500),
  keywords: z.array(z.string()),
  relevanceScore: z.number().min(0).max(1),
  url: z.string(),
  lastUpdated: z.string().datetime(),
  projectedAt: z.string().datetime(),
  source: z.literal('AUTHORITATIVE'),
  checksum: z.string().length(64),
});

export type KnowledgeChunkProjection = z.infer<typeof KnowledgeChunkProjectionSchema>;

// Risk & Blast Radius Input
export const RiskBlastRadiusInputSchema = BaseAgentInputSchema.extend({
  dependencySnapshot: ServiceDependencySnapshotSchema,
  trafficImpact: TrafficImpactSummarySchema,
});

export type RiskBlastRadiusInput = z.infer<typeof RiskBlastRadiusInputSchema>;

// Knowledge Recommendation Input
export const KnowledgeRecommendationInputSchema = BaseAgentInputSchema.extend({
  knowledgeChunks: z.array(KnowledgeChunkProjectionSchema),
  searchContext: z.object({
    errorPatterns: z.array(z.string()),
    classification: z.string(),
  }),
});

export type KnowledgeRecommendationInput = z.infer<typeof KnowledgeRecommendationInputSchema>;

// Response Strategy Input
export const ResponseStrategyInputSchema = BaseAgentInputSchema.extend({
  coreAgentRecommendations: z.array(AgentRecommendationSchema),
  advancedAgentRecommendations: z.array(AgentRecommendationSchema),
});

export type ResponseStrategyInput = z.infer<typeof ResponseStrategyInputSchema>;
