/**
 * CP-5: Candidate Generator Tests
 * 
 * Tests for candidate generation orchestration with all mandatory fixes.
 * 
 * 🔒 FIX #1: Window-based correlation (query ALL detections in window)
 * 🔒 FIX #2: All matcher fields enforced
 * 🔒 FIX #3: Graph-detection integrity validated
 * 🔒 FIX #4: Concurrent generation converges
 * 🔒 FIX-A: keyFields included in correlation key
 * 🔒 FIX-B: sameRuleId compares against trigger detection's ruleId
 * 🔒 FIX-C: Query partition narrowing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CandidateGenerator, NormalizedSignalStore } from '../../src/candidate/candidate-generator.js';
import { CorrelationRuleLoader } from '../../src/candidate/correlation-rule-loader.js';
import { CandidateStore } from '../../src/candidate/candidate-store.js';
import { DetectionStore } from '../../src/detection/detection-store.js';
import { EvidenceGraphStore } from '../../src/evidence/evidence-graph-store.js';
import { DetectionResult } from '../../src/detection/detection-result.js';
import { NormalizedSignal } from '../../src/normalization/normalized-signal.schema.js';
import { EvidenceGraph } from '../../src/evidence/evidence-graph.schema.js';
import { CorrelationRule } from '../../src/candidate/correlation-rule.schema.js';

describe('CP-5: Candidate Generator', () => {
  // Mock stores
  let mockDetectionStore: Partial<DetectionStore>;
  let mockGraphStore: Partial<EvidenceGraphStore>;
  let mockSignalStore: NormalizedSignalStore;
  let mockRuleLoader: Partial<CorrelationRuleLoader>;
  let mockCandidateStore: Partial<CandidateStore>;
  let generator: CandidateGenerator;

  // Test fixtures
  const createDetection = (overrides: Partial<DetectionResult> = {}): DetectionResult => ({
    detectionId: 'det-' + Math.random().toString(36).substring(7),
    ruleId: 'lambda-error-rate',
    ruleVersion: '1.0.0',
    normalizedSignalId: 'sig-' + Math.random().toString(36).substring(7),
    signalTimestamp: '2026-01-16T10:30:00.000Z',
    decision: 'MATCH',
    severity: 'SEV2',
    confidence: 'HIGH',
    evaluationTrace: [],
    detectionVersion: 'v1',
    ...overrides,
  });

  const createSignal = (overrides: Partial<NormalizedSignal> = {}): NormalizedSignal => ({
    normalizedSignalId: 'sig-' + Math.random().toString(36).substring(7),
    sourceSignalId: 'raw-' + Math.random().toString(36).substring(7),
    signalType: 'error',
    source: 'cloudwatch',
    severity: 'SEV2',
    confidence: 'HIGH',
    timestamp: '2026-01-16T10:30:00.000Z',
    resourceRefs: [],
    environmentRefs: [],
    evidenceRefs: [],
    normalizationVersion: 'v1',
    normalizedAt: '2026-01-16T10:30:01.000Z',
    ...overrides,
  });

  const createGraph = (detectionId: string): EvidenceGraph => ({
    graphId: 'g'.repeat(64),
    detectionId,
    nodes: [
      {
        nodeId: `node-detection-${detectionId}`,
        nodeType: 'DETECTION_RESULT',
        ref: { entityType: 'DetectionResult', entityId: detectionId, storeLocation: 'opx-detections' },
        timestamp: '2026-01-16T10:30:00.000Z',
      },
    ],
    edges: [],
    graphVersion: 'v1',
  });

  const createRule = (overrides: Partial<CorrelationRule> = {}): CorrelationRule => ({
    id: 'service-cascade',
    version: '1.0.0',
    description: 'Test rule',
    matcher: {
      sameService: true,
      windowMinutes: 60,
      windowTruncation: 'hour',
      minDetections: 1,
      maxDetections: 100,
    },
    keyFields: ['service', 'windowTruncated'],
    primarySelection: 'HIGHEST_SEVERITY_THEN_EARLIEST_THEN_LEXICAL',
    confidenceBoost: {
      multipleDetections: 0.2,
      highSeverityRule: 0.3,
    },
    ...overrides,
  });

  beforeEach(() => {
    // Reset mocks
    mockDetectionStore = {
      get: vi.fn(),
      queryByTimeRange: vi.fn(),
    };
    mockGraphStore = {
      getByDetection: vi.fn(),
    };
    mockSignalStore = {
      get: vi.fn(),
    };
    mockRuleLoader = {
      loadAllRules: vi.fn(),
    };
    mockCandidateStore = {
      store: vi.fn(),
    };

    generator = new CandidateGenerator({
      detectionStore: mockDetectionStore as DetectionStore,
      graphStore: mockGraphStore as EvidenceGraphStore,
      signalStore: mockSignalStore,
      ruleLoader: mockRuleLoader as CorrelationRuleLoader,
      candidateStore: mockCandidateStore as CandidateStore,
    });
  });


  describe('generateForDetection()', () => {
    it('should throw if detection not found', async () => {
      (mockDetectionStore.get as any).mockResolvedValue(null);

      await expect(generator.generateForDetection('non-existent'))
        .rejects.toThrow('Detection not found');
    });

    it('should throw if signal not found', async () => {
      const detection = createDetection();
      (mockDetectionStore.get as any).mockResolvedValue({ result: detection });
      (mockSignalStore.get as any).mockResolvedValue(null);

      await expect(generator.generateForDetection(detection.detectionId))
        .rejects.toThrow('Normalized signal not found');
    });

    it('should process all rules independently (HARDENING #1)', async () => {
      const detection = createDetection({ detectionId: 'det-trigger' });
      const signal = createSignal({ normalizedSignalId: detection.normalizedSignalId });
      const graph = createGraph(detection.detectionId);
      const rule1 = createRule({ id: 'rule-1' });
      const rule2 = createRule({ id: 'rule-2' });

      (mockDetectionStore.get as any).mockResolvedValue({ result: detection });
      (mockSignalStore.get as any).mockResolvedValue(signal);
      (mockRuleLoader.loadAllRules as any).mockReturnValue([rule1, rule2]);
      (mockDetectionStore.queryByTimeRange as any).mockResolvedValue([detection]);
      (mockGraphStore.getByDetection as any).mockResolvedValue(graph);
      (mockCandidateStore.store as any).mockResolvedValue({ success: true, alreadyExists: false });

      const results = await generator.generateForDetection(detection.detectionId);

      // Should attempt to generate for both rules
      expect(mockDetectionStore.queryByTimeRange).toHaveBeenCalledTimes(2);
    });

    it('should continue processing if one rule fails', async () => {
      const detection = createDetection({ detectionId: 'det-trigger' });
      const signal = createSignal({ normalizedSignalId: detection.normalizedSignalId });
      const graph = createGraph(detection.detectionId);
      const rule1 = createRule({ id: 'rule-1' });
      const rule2 = createRule({ id: 'rule-2' });

      (mockDetectionStore.get as any).mockResolvedValue({ result: detection });
      (mockSignalStore.get as any).mockResolvedValue(signal);
      (mockRuleLoader.loadAllRules as any).mockReturnValue([rule1, rule2]);
      
      // First rule fails, second succeeds
      (mockDetectionStore.queryByTimeRange as any)
        .mockRejectedValueOnce(new Error('Query failed'))
        .mockResolvedValueOnce([detection]);
      (mockGraphStore.getByDetection as any).mockResolvedValue(graph);
      (mockCandidateStore.store as any).mockResolvedValue({ success: true, alreadyExists: false });

      const results = await generator.generateForDetection(detection.detectionId);

      // Should still get result from second rule
      expect(results.length).toBe(1);
    });
  });

  describe('🔒 FIX #1: Window-based correlation', () => {
    it('should query ALL detections in the correlation window', async () => {
      const triggerDetection = createDetection({
        detectionId: 'det-trigger',
        signalTimestamp: '2026-01-16T10:30:00.000Z',
      });
      const windowDetection = createDetection({
        detectionId: 'det-window',
        signalTimestamp: '2026-01-16T10:15:00.000Z',
      });
      const triggerSignal = createSignal({ normalizedSignalId: triggerDetection.normalizedSignalId });
      const windowSignal = createSignal({ normalizedSignalId: windowDetection.normalizedSignalId });
      const rule = createRule({ matcher: { ...createRule().matcher, windowMinutes: 60 } });

      (mockDetectionStore.get as any).mockResolvedValue({ result: triggerDetection });
      (mockSignalStore.get as any).mockImplementation((id: string) => {
        if (id === triggerDetection.normalizedSignalId) return Promise.resolve(triggerSignal);
        if (id === windowDetection.normalizedSignalId) return Promise.resolve(windowSignal);
        return Promise.resolve(null);
      });
      (mockRuleLoader.loadAllRules as any).mockReturnValue([rule]);
      (mockDetectionStore.queryByTimeRange as any).mockResolvedValue([triggerDetection, windowDetection]);
      (mockGraphStore.getByDetection as any).mockImplementation((id: string) => {
        return Promise.resolve(createGraph(id));
      });
      (mockCandidateStore.store as any).mockResolvedValue({ success: true, alreadyExists: false });

      await generator.generateForDetection(triggerDetection.detectionId);

      // Should query with window boundaries
      expect(mockDetectionStore.queryByTimeRange).toHaveBeenCalledWith(
        expect.stringMatching(/2026-01-16T09:30/), // windowStart (60 min before trigger)
        '2026-01-16T10:30:00.000Z', // windowEnd (trigger time)
        expect.any(Object),
        expect.any(Number)
      );
    });

    it('should include multiple detections from window in candidate', async () => {
      const triggerDetection = createDetection({
        detectionId: 'det-trigger',
        normalizedSignalId: 'sig-trigger',
        signalTimestamp: '2026-01-16T10:30:00.000Z',
      });
      const windowDetection = createDetection({
        detectionId: 'det-window',
        normalizedSignalId: 'sig-window',
        signalTimestamp: '2026-01-16T10:15:00.000Z',
      });
      const triggerSignal = createSignal({ normalizedSignalId: 'sig-trigger' });
      const windowSignal = createSignal({ normalizedSignalId: 'sig-window' });
      const rule = createRule();

      (mockDetectionStore.get as any).mockResolvedValue({ result: triggerDetection });
      (mockSignalStore.get as any).mockImplementation((id: string) => {
        if (id === 'sig-trigger') return Promise.resolve(triggerSignal);
        if (id === 'sig-window') return Promise.resolve(windowSignal);
        return Promise.resolve(null);
      });
      (mockRuleLoader.loadAllRules as any).mockReturnValue([rule]);
      (mockDetectionStore.queryByTimeRange as any).mockResolvedValue([triggerDetection, windowDetection]);
      (mockGraphStore.getByDetection as any).mockImplementation((id: string) => {
        return Promise.resolve(createGraph(id));
      });
      
      let storedCandidate: any;
      (mockCandidateStore.store as any).mockImplementation((c: any) => {
        storedCandidate = c;
        return Promise.resolve({ success: true, alreadyExists: false });
      });

      await generator.generateForDetection(triggerDetection.detectionId);

      // Candidate should include both detections
      expect(storedCandidate.detectionIds).toContain('det-trigger');
      expect(storedCandidate.detectionIds).toContain('det-window');
      expect(storedCandidate.detectionIds.length).toBe(2);
    });
  });


  describe('🔒 FIX #2: All matcher fields enforced', () => {
    it('should filter by severities when declared', async () => {
      const triggerDetection = createDetection({
        detectionId: 'det-trigger',
        normalizedSignalId: 'sig-trigger',
        severity: 'SEV1',
      });
      const sev4Detection = createDetection({
        detectionId: 'det-sev4',
        normalizedSignalId: 'sig-sev4',
        severity: 'SEV4',
      });
      const triggerSignal = createSignal({ normalizedSignalId: 'sig-trigger' });
      const sev4Signal = createSignal({ normalizedSignalId: 'sig-sev4' });
      
      // Rule only allows SEV1 and SEV2
      const rule = createRule({
        matcher: {
          ...createRule().matcher,
          severities: ['SEV1', 'SEV2'],
        },
      });

      (mockDetectionStore.get as any).mockResolvedValue({ result: triggerDetection });
      (mockSignalStore.get as any).mockImplementation((id: string) => {
        if (id === 'sig-trigger') return Promise.resolve(triggerSignal);
        if (id === 'sig-sev4') return Promise.resolve(sev4Signal);
        return Promise.resolve(null);
      });
      (mockRuleLoader.loadAllRules as any).mockReturnValue([rule]);
      (mockDetectionStore.queryByTimeRange as any).mockResolvedValue([triggerDetection, sev4Detection]);
      (mockGraphStore.getByDetection as any).mockImplementation((id: string) => {
        return Promise.resolve(createGraph(id));
      });
      
      let storedCandidate: any;
      (mockCandidateStore.store as any).mockImplementation((c: any) => {
        storedCandidate = c;
        return Promise.resolve({ success: true, alreadyExists: false });
      });

      await generator.generateForDetection(triggerDetection.detectionId);

      // SEV4 detection should be filtered out
      expect(storedCandidate.detectionIds).toContain('det-trigger');
      expect(storedCandidate.detectionIds).not.toContain('det-sev4');
    });

    it('should filter by signalTypes when declared', async () => {
      const triggerDetection = createDetection({
        detectionId: 'det-trigger',
        normalizedSignalId: 'sig-trigger',
      });
      const metricDetection = createDetection({
        detectionId: 'det-metric',
        normalizedSignalId: 'sig-metric',
      });
      const triggerSignal = createSignal({ normalizedSignalId: 'sig-trigger', signalType: 'error' });
      const metricSignal = createSignal({ normalizedSignalId: 'sig-metric', signalType: 'metric' });
      
      // Rule only allows error signals
      const rule = createRule({
        matcher: {
          ...createRule().matcher,
          signalTypes: ['error'],
        },
      });

      (mockDetectionStore.get as any).mockResolvedValue({ result: triggerDetection });
      (mockSignalStore.get as any).mockImplementation((id: string) => {
        if (id === 'sig-trigger') return Promise.resolve(triggerSignal);
        if (id === 'sig-metric') return Promise.resolve(metricSignal);
        return Promise.resolve(null);
      });
      (mockRuleLoader.loadAllRules as any).mockReturnValue([rule]);
      (mockDetectionStore.queryByTimeRange as any).mockResolvedValue([triggerDetection, metricDetection]);
      (mockGraphStore.getByDetection as any).mockImplementation((id: string) => {
        return Promise.resolve(createGraph(id));
      });
      
      let storedCandidate: any;
      (mockCandidateStore.store as any).mockImplementation((c: any) => {
        storedCandidate = c;
        return Promise.resolve({ success: true, alreadyExists: false });
      });

      await generator.generateForDetection(triggerDetection.detectionId);

      // Metric detection should be filtered out
      expect(storedCandidate.detectionIds).toContain('det-trigger');
      expect(storedCandidate.detectionIds).not.toContain('det-metric');
    });

    it('should filter by sameService when declared', async () => {
      const triggerDetection = createDetection({
        detectionId: 'det-trigger',
        normalizedSignalId: 'sig-trigger',
      });
      const otherServiceDetection = createDetection({
        detectionId: 'det-other',
        normalizedSignalId: 'sig-other',
      });
      const triggerSignal = createSignal({ normalizedSignalId: 'sig-trigger', source: 'lambda' });
      const otherSignal = createSignal({ normalizedSignalId: 'sig-other', source: 'dynamodb' });
      
      const rule = createRule({
        matcher: {
          ...createRule().matcher,
          sameService: true,
        },
      });

      (mockDetectionStore.get as any).mockResolvedValue({ result: triggerDetection });
      (mockSignalStore.get as any).mockImplementation((id: string) => {
        if (id === 'sig-trigger') return Promise.resolve(triggerSignal);
        if (id === 'sig-other') return Promise.resolve(otherSignal);
        return Promise.resolve(null);
      });
      (mockRuleLoader.loadAllRules as any).mockReturnValue([rule]);
      (mockDetectionStore.queryByTimeRange as any).mockResolvedValue([triggerDetection, otherServiceDetection]);
      (mockGraphStore.getByDetection as any).mockImplementation((id: string) => {
        return Promise.resolve(createGraph(id));
      });
      
      let storedCandidate: any;
      (mockCandidateStore.store as any).mockImplementation((c: any) => {
        storedCandidate = c;
        return Promise.resolve({ success: true, alreadyExists: false });
      });

      await generator.generateForDetection(triggerDetection.detectionId);

      // Other service detection should be filtered out
      expect(storedCandidate.detectionIds).toContain('det-trigger');
      expect(storedCandidate.detectionIds).not.toContain('det-other');
    });
  });

  describe('🔒 FIX #3: Graph-detection integrity', () => {
    it('should skip detections without evidence graph', async () => {
      const triggerDetection = createDetection({
        detectionId: 'det-trigger',
        normalizedSignalId: 'sig-trigger',
      });
      const orphanDetection = createDetection({
        detectionId: 'det-orphan',
        normalizedSignalId: 'sig-orphan',
      });
      const triggerSignal = createSignal({ normalizedSignalId: 'sig-trigger' });
      const orphanSignal = createSignal({ normalizedSignalId: 'sig-orphan' });
      const rule = createRule();

      (mockDetectionStore.get as any).mockResolvedValue({ result: triggerDetection });
      (mockSignalStore.get as any).mockImplementation((id: string) => {
        if (id === 'sig-trigger') return Promise.resolve(triggerSignal);
        if (id === 'sig-orphan') return Promise.resolve(orphanSignal);
        return Promise.resolve(null);
      });
      (mockRuleLoader.loadAllRules as any).mockReturnValue([rule]);
      (mockDetectionStore.queryByTimeRange as any).mockResolvedValue([triggerDetection, orphanDetection]);
      (mockGraphStore.getByDetection as any).mockImplementation((id: string) => {
        if (id === 'det-trigger') return Promise.resolve(createGraph(id));
        return Promise.resolve(null); // Orphan has no graph
      });
      
      let storedCandidate: any;
      (mockCandidateStore.store as any).mockImplementation((c: any) => {
        storedCandidate = c;
        return Promise.resolve({ success: true, alreadyExists: false });
      });

      await generator.generateForDetection(triggerDetection.detectionId);

      // Orphan detection should be excluded
      expect(storedCandidate.detectionIds).toContain('det-trigger');
      expect(storedCandidate.detectionIds).not.toContain('det-orphan');
    });

    it('should skip detections with mismatched graph.detectionId', async () => {
      const triggerDetection = createDetection({
        detectionId: 'det-trigger',
        normalizedSignalId: 'sig-trigger',
      });
      const mismatchDetection = createDetection({
        detectionId: 'det-mismatch',
        normalizedSignalId: 'sig-mismatch',
      });
      const triggerSignal = createSignal({ normalizedSignalId: 'sig-trigger' });
      const mismatchSignal = createSignal({ normalizedSignalId: 'sig-mismatch' });
      const rule = createRule();

      (mockDetectionStore.get as any).mockResolvedValue({ result: triggerDetection });
      (mockSignalStore.get as any).mockImplementation((id: string) => {
        if (id === 'sig-trigger') return Promise.resolve(triggerSignal);
        if (id === 'sig-mismatch') return Promise.resolve(mismatchSignal);
        return Promise.resolve(null);
      });
      (mockRuleLoader.loadAllRules as any).mockReturnValue([rule]);
      (mockDetectionStore.queryByTimeRange as any).mockResolvedValue([triggerDetection, mismatchDetection]);
      (mockGraphStore.getByDetection as any).mockImplementation((id: string) => {
        if (id === 'det-trigger') return Promise.resolve(createGraph(id));
        // Return graph with wrong detectionId
        return Promise.resolve({ ...createGraph('wrong-id'), detectionId: 'wrong-id' });
      });
      
      let storedCandidate: any;
      (mockCandidateStore.store as any).mockImplementation((c: any) => {
        storedCandidate = c;
        return Promise.resolve({ success: true, alreadyExists: false });
      });

      await generator.generateForDetection(triggerDetection.detectionId);

      // Mismatched detection should be excluded
      expect(storedCandidate.detectionIds).toContain('det-trigger');
      expect(storedCandidate.detectionIds).not.toContain('det-mismatch');
    });
  });


  describe('🔒 FIX #4: Concurrent generation convergence', () => {
    it('should return isNew=false when candidate already exists', async () => {
      const detection = createDetection({ detectionId: 'det-trigger', normalizedSignalId: 'sig-trigger' });
      const signal = createSignal({ normalizedSignalId: 'sig-trigger' });
      const graph = createGraph(detection.detectionId);
      const rule = createRule();

      (mockDetectionStore.get as any).mockResolvedValue({ result: detection });
      (mockSignalStore.get as any).mockResolvedValue(signal);
      (mockRuleLoader.loadAllRules as any).mockReturnValue([rule]);
      (mockDetectionStore.queryByTimeRange as any).mockResolvedValue([detection]);
      (mockGraphStore.getByDetection as any).mockResolvedValue(graph);
      
      // Simulate already exists
      (mockCandidateStore.store as any).mockResolvedValue({ success: true, alreadyExists: true });

      const results = await generator.generateForDetection(detection.detectionId);

      expect(results.length).toBe(1);
      expect(results[0].isNew).toBe(false);
    });

    it('should produce same candidateId for same inputs (determinism)', async () => {
      const detection = createDetection({
        detectionId: 'det-fixed',
        normalizedSignalId: 'sig-fixed',
        ruleId: 'lambda-error-rate',
        signalTimestamp: '2026-01-16T10:30:00.000Z',
        severity: 'SEV2',
      });
      const signal = createSignal({
        normalizedSignalId: 'sig-fixed',
        source: 'cloudwatch',
      });
      const graph = createGraph(detection.detectionId);
      const rule = createRule({ id: 'test-rule', version: '1.0.0' });

      (mockDetectionStore.get as any).mockResolvedValue({ result: detection });
      (mockSignalStore.get as any).mockResolvedValue(signal);
      (mockRuleLoader.loadAllRules as any).mockReturnValue([rule]);
      (mockDetectionStore.queryByTimeRange as any).mockResolvedValue([detection]);
      (mockGraphStore.getByDetection as any).mockResolvedValue(graph);
      
      const storedCandidates: any[] = [];
      (mockCandidateStore.store as any).mockImplementation((c: any) => {
        storedCandidates.push(c);
        return Promise.resolve({ success: true, alreadyExists: false });
      });

      // Generate twice
      await generator.generateForDetection(detection.detectionId);
      await generator.generateForDetection(detection.detectionId);

      // Both should produce same candidateId
      expect(storedCandidates.length).toBe(2);
      expect(storedCandidates[0].candidateId).toBe(storedCandidates[1].candidateId);
    });
  });

  describe('🔒 FIX-B: sameRuleId comparison', () => {
    it('should filter by trigger detection ruleId when sameRuleId=true', async () => {
      const triggerDetection = createDetection({
        detectionId: 'det-trigger',
        normalizedSignalId: 'sig-trigger',
        ruleId: 'lambda-error-rate',
      });
      const sameRuleDetection = createDetection({
        detectionId: 'det-same-rule',
        normalizedSignalId: 'sig-same-rule',
        ruleId: 'lambda-error-rate',
      });
      const differentRuleDetection = createDetection({
        detectionId: 'det-diff-rule',
        normalizedSignalId: 'sig-diff-rule',
        ruleId: 'dynamodb-throttle',
      });
      const triggerSignal = createSignal({ normalizedSignalId: 'sig-trigger' });
      const sameRuleSignal = createSignal({ normalizedSignalId: 'sig-same-rule' });
      const diffRuleSignal = createSignal({ normalizedSignalId: 'sig-diff-rule' });
      
      const rule = createRule({
        matcher: {
          ...createRule().matcher,
          sameRuleId: true,
        },
      });

      (mockDetectionStore.get as any).mockResolvedValue({ result: triggerDetection });
      (mockSignalStore.get as any).mockImplementation((id: string) => {
        if (id === 'sig-trigger') return Promise.resolve(triggerSignal);
        if (id === 'sig-same-rule') return Promise.resolve(sameRuleSignal);
        if (id === 'sig-diff-rule') return Promise.resolve(diffRuleSignal);
        return Promise.resolve(null);
      });
      (mockRuleLoader.loadAllRules as any).mockReturnValue([rule]);
      (mockDetectionStore.queryByTimeRange as any).mockResolvedValue([
        triggerDetection,
        sameRuleDetection,
        differentRuleDetection,
      ]);
      (mockGraphStore.getByDetection as any).mockImplementation((id: string) => {
        return Promise.resolve(createGraph(id));
      });
      
      let storedCandidate: any;
      (mockCandidateStore.store as any).mockImplementation((c: any) => {
        storedCandidate = c;
        return Promise.resolve({ success: true, alreadyExists: false });
      });

      await generator.generateForDetection(triggerDetection.detectionId);

      // Only detections with same ruleId as trigger should be included
      expect(storedCandidate.detectionIds).toContain('det-trigger');
      expect(storedCandidate.detectionIds).toContain('det-same-rule');
      expect(storedCandidate.detectionIds).not.toContain('det-diff-rule');
    });
  });

  describe('🔒 FIX-C: Query partition narrowing', () => {
    it('should pass ruleId filter when sameRuleId=true', async () => {
      const detection = createDetection({
        detectionId: 'det-trigger',
        normalizedSignalId: 'sig-trigger',
        ruleId: 'lambda-error-rate',
      });
      const signal = createSignal({ normalizedSignalId: 'sig-trigger' });
      const graph = createGraph(detection.detectionId);
      
      const rule = createRule({
        matcher: {
          ...createRule().matcher,
          sameRuleId: true,
        },
      });

      (mockDetectionStore.get as any).mockResolvedValue({ result: detection });
      (mockSignalStore.get as any).mockResolvedValue(signal);
      (mockRuleLoader.loadAllRules as any).mockReturnValue([rule]);
      (mockDetectionStore.queryByTimeRange as any).mockResolvedValue([detection]);
      (mockGraphStore.getByDetection as any).mockResolvedValue(graph);
      (mockCandidateStore.store as any).mockResolvedValue({ success: true, alreadyExists: false });

      await generator.generateForDetection(detection.detectionId);

      // Should pass ruleId in filter for partition narrowing
      expect(mockDetectionStore.queryByTimeRange).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ ruleId: 'lambda-error-rate' }),
        expect.any(Number)
      );
    });

    it('should not pass ruleId filter when sameRuleId=false', async () => {
      const detection = createDetection({
        detectionId: 'det-trigger',
        normalizedSignalId: 'sig-trigger',
        ruleId: 'lambda-error-rate',
      });
      const signal = createSignal({ normalizedSignalId: 'sig-trigger' });
      const graph = createGraph(detection.detectionId);
      
      const rule = createRule({
        matcher: {
          ...createRule().matcher,
          sameRuleId: false,
        },
      });

      (mockDetectionStore.get as any).mockResolvedValue({ result: detection });
      (mockSignalStore.get as any).mockResolvedValue(signal);
      (mockRuleLoader.loadAllRules as any).mockReturnValue([rule]);
      (mockDetectionStore.queryByTimeRange as any).mockResolvedValue([detection]);
      (mockGraphStore.getByDetection as any).mockResolvedValue(graph);
      (mockCandidateStore.store as any).mockResolvedValue({ success: true, alreadyExists: false });

      await generator.generateForDetection(detection.detectionId);

      // Should NOT pass ruleId in filter
      expect(mockDetectionStore.queryByTimeRange).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.not.objectContaining({ ruleId: expect.any(String) }),
        expect.any(Number)
      );
    });
  });

  describe('minDetections enforcement', () => {
    it('should not generate candidate if below minDetections', async () => {
      const detection = createDetection({ detectionId: 'det-trigger', normalizedSignalId: 'sig-trigger' });
      const signal = createSignal({ normalizedSignalId: 'sig-trigger' });
      
      // Rule requires at least 3 detections
      const rule = createRule({
        matcher: {
          ...createRule().matcher,
          minDetections: 3,
        },
      });

      (mockDetectionStore.get as any).mockResolvedValue({ result: detection });
      (mockSignalStore.get as any).mockResolvedValue(signal);
      (mockRuleLoader.loadAllRules as any).mockReturnValue([rule]);
      (mockDetectionStore.queryByTimeRange as any).mockResolvedValue([detection]); // Only 1 detection
      (mockGraphStore.getByDetection as any).mockResolvedValue(createGraph(detection.detectionId));

      const results = await generator.generateForDetection(detection.detectionId);

      // Should not generate candidate
      expect(results.length).toBe(0);
      expect(mockCandidateStore.store).not.toHaveBeenCalled();
    });
  });

  describe('maxDetections enforcement', () => {
    it('should cap detections at maxDetections', async () => {
      const detections = Array.from({ length: 10 }, (_, i) =>
        createDetection({
          detectionId: `det-${i}`,
          normalizedSignalId: `sig-${i}`,
          severity: i < 3 ? 'SEV1' : 'SEV2', // First 3 are SEV1
        })
      );
      const signals = detections.map(d =>
        createSignal({ normalizedSignalId: d.normalizedSignalId })
      );
      
      // Rule allows max 5 detections
      const rule = createRule({
        matcher: {
          ...createRule().matcher,
          maxDetections: 5,
        },
      });

      (mockDetectionStore.get as any).mockResolvedValue({ result: detections[0] });
      (mockSignalStore.get as any).mockImplementation((id: string) => {
        const signal = signals.find(s => s.normalizedSignalId === id);
        return Promise.resolve(signal || null);
      });
      (mockRuleLoader.loadAllRules as any).mockReturnValue([rule]);
      (mockDetectionStore.queryByTimeRange as any).mockResolvedValue(detections);
      (mockGraphStore.getByDetection as any).mockImplementation((id: string) => {
        return Promise.resolve(createGraph(id));
      });
      
      let storedCandidate: any;
      (mockCandidateStore.store as any).mockImplementation((c: any) => {
        storedCandidate = c;
        return Promise.resolve({ success: true, alreadyExists: false });
      });

      await generator.generateForDetection(detections[0].detectionId);

      // Should cap at 5 detections
      expect(storedCandidate.detectionIds.length).toBe(5);
    });
  });
});
