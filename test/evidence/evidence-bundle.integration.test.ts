/**
 * Phase 3.1: Evidence Bundle Integration Tests
 * 
 * Tests evidence bundle creation, storage, and retrieval.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { EvidenceBuilder } from '../../src/evidence/evidence-builder.js';
import { EvidenceStore } from '../../src/evidence/evidence-store.js';
import { computeEvidenceId } from '../../src/evidence/evidence-id.js';
import { computeSignalSummary } from '../../src/evidence/signal-summary.js';
import type { DetectionSummary } from '../../src/evidence/evidence-bundle.schema.js';

describe('Evidence Bundle Integration', () => {
  let evidenceStore: EvidenceStore;
  let evidenceBuilder: EvidenceBuilder;
  
  const tableName = process.env.EVIDENCE_BUNDLES_TABLE_NAME || 'opx-evidence-bundles';
  
  beforeAll(() => {
    const dynamoClient = new DynamoDBClient({});
    evidenceStore = new EvidenceStore(dynamoClient, tableName);
    evidenceBuilder = new EvidenceBuilder();
  });
  
  describe('Build and Store Evidence', () => {
    it('should build evidence bundle from detections', () => {
      const detections: DetectionSummary[] = [
        {
          detectionId: 'det-001',
          ruleId: 'rule-test',
          ruleVersion: '1.0.0',
          severity: 'CRITICAL',
          confidence: 0.9,
          detectedAt: '2026-01-21T10:00:00.000Z',
          signalIds: ['sig-001', 'sig-002'],
        },
        {
          detectionId: 'det-002',
          ruleId: 'rule-test',
          ruleVersion: '1.0.0',
          severity: 'HIGH',
          confidence: 0.8,
          detectedAt: '2026-01-21T10:02:00.000Z',
          signalIds: ['sig-003'],
        },
      ];
      
      const bundle = evidenceBuilder.buildBundle(
        detections,
        'test-service',
        '2026-01-21T10:00:00.000Z',
        '2026-01-21T10:05:00.000Z'
      );
      
      expect(bundle.evidenceId).toHaveLength(64);
      expect(bundle.service).toBe('test-service');
      expect(bundle.detections).toHaveLength(2);
      expect(bundle.signalSummary.signalCount).toBe(3);
      expect(bundle.signalSummary.uniqueRules).toBe(1);
    });
    
    it('should store and retrieve evidence bundle', async () => {
      const detections: DetectionSummary[] = [
        {
          detectionId: 'det-101',
          ruleId: 'rule-store-test',
          ruleVersion: '1.0.0',
          severity: 'CRITICAL',
          confidence: 0.95,
          detectedAt: '2026-01-21T11:00:00.000Z',
          signalIds: ['sig-101'],
        },
      ];
      
      const bundle = evidenceBuilder.buildBundle(
        detections,
        'store-test-service',
        '2026-01-21T11:00:00.000Z',
        '2026-01-21T11:05:00.000Z'
      );
      
      // Store bundle
      const isNew = await evidenceStore.putEvidence(bundle);
      expect(isNew).toBe(true);
      
      // Retrieve bundle
      const retrieved = await evidenceStore.getEvidence(bundle.evidenceId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.evidenceId).toBe(bundle.evidenceId);
      expect(retrieved!.service).toBe('store-test-service');
      expect(retrieved!.detections).toHaveLength(1);
    });
  });
  
  describe('Idempotency', () => {
    it('should be idempotent when storing same bundle twice', async () => {
      const detections: DetectionSummary[] = [
        {
          detectionId: 'det-201',
          ruleId: 'rule-idempotent',
          ruleVersion: '1.0.0',
          severity: 'HIGH',
          confidence: 0.85,
          detectedAt: '2026-01-21T12:00:00.000Z',
          signalIds: ['sig-201', 'sig-202'],
        },
      ];
      
      const bundle = evidenceBuilder.buildBundle(
        detections,
        'idempotent-service',
        '2026-01-21T12:00:00.000Z',
        '2026-01-21T12:05:00.000Z'
      );
      
      // Store first time
      const isNew1 = await evidenceStore.putEvidence(bundle);
      expect(isNew1).toBe(true);
      
      // Store second time (idempotent)
      const isNew2 = await evidenceStore.putEvidence(bundle);
      expect(isNew2).toBe(false);
      
      // Verify only one record exists
      const retrieved = await evidenceStore.getEvidence(bundle.evidenceId);
      expect(retrieved).not.toBeNull();
    });
  });
  
  describe('Determinism', () => {
    it('should generate same evidenceId for same detections (different order)', () => {
      const detections1: DetectionSummary[] = [
        {
          detectionId: 'det-301',
          ruleId: 'rule-det',
          ruleVersion: '1.0.0',
          severity: 'CRITICAL',
          confidence: 0.9,
          detectedAt: '2026-01-21T13:00:00.000Z',
          signalIds: ['sig-301'],
        },
        {
          detectionId: 'det-302',
          ruleId: 'rule-det',
          ruleVersion: '1.0.0',
          severity: 'HIGH',
          confidence: 0.8,
          detectedAt: '2026-01-21T13:01:00.000Z',
          signalIds: ['sig-302'],
        },
      ];
      
      // Same detections, different order
      const detections2: DetectionSummary[] = [detections1[1], detections1[0]];
      
      const bundle1 = evidenceBuilder.buildBundle(
        detections1,
        'determinism-service',
        '2026-01-21T13:00:00.000Z',
        '2026-01-21T13:05:00.000Z'
      );
      
      const bundle2 = evidenceBuilder.buildBundle(
        detections2,
        'determinism-service',
        '2026-01-21T13:00:00.000Z',
        '2026-01-21T13:05:00.000Z'
      );
      
      expect(bundle1.evidenceId).toBe(bundle2.evidenceId);
      expect(bundle1.signalSummary).toEqual(bundle2.signalSummary);
    });
    
    it('should generate same evidenceId on replay', async () => {
      const detections: DetectionSummary[] = [
        {
          detectionId: 'det-401',
          ruleId: 'rule-replay',
          ruleVersion: '1.0.0',
          severity: 'CRITICAL',
          confidence: 0.92,
          detectedAt: '2026-01-21T14:00:00.000Z',
          signalIds: ['sig-401', 'sig-402'],
        },
      ];
      
      // Build and store first time
      const bundle1 = evidenceBuilder.buildBundle(
        detections,
        'replay-service',
        '2026-01-21T14:00:00.000Z',
        '2026-01-21T14:05:00.000Z'
      );
      
      await evidenceStore.putEvidence(bundle1);
      
      // Rebuild from same detections (replay)
      const bundle2 = evidenceBuilder.buildBundle(
        detections,
        'replay-service',
        '2026-01-21T14:00:00.000Z',
        '2026-01-21T14:05:00.000Z'
      );
      
      // Should have same evidenceId
      expect(bundle2.evidenceId).toBe(bundle1.evidenceId);
      
      // Retrieve from store
      const retrieved = await evidenceStore.getEvidence(bundle1.evidenceId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.evidenceId).toBe(bundle1.evidenceId);
    });
  });
  
  describe('Fail-Closed', () => {
    it('should throw when building with zero detections', () => {
      expect(() => {
        evidenceBuilder.buildBundle(
          [],
          'fail-service',
          '2026-01-21T15:00:00.000Z',
          '2026-01-21T15:05:00.000Z'
        );
      }).toThrow('Cannot build evidence bundle with zero detections');
    });
    
    it('should throw when detection is outside window', () => {
      const detections: DetectionSummary[] = [
        {
          detectionId: 'det-501',
          ruleId: 'rule-fail',
          ruleVersion: '1.0.0',
          severity: 'HIGH',
          confidence: 0.8,
          detectedAt: '2026-01-21T16:10:00.000Z', // Outside window
          signalIds: ['sig-501'],
        },
      ];
      
      expect(() => {
        evidenceBuilder.buildBundle(
          detections,
          'fail-service',
          '2026-01-21T16:00:00.000Z',
          '2026-01-21T16:05:00.000Z'
        );
      }).toThrow('outside window bounds');
    });
  });
  
  describe('Evidence ID Computation', () => {
    it('should compute deterministic evidence ID', () => {
      const id1 = computeEvidenceId(
        ['det-a', 'det-b'],
        '2026-01-21T10:00:00.000Z',
        '2026-01-21T10:05:00.000Z'
      );
      
      const id2 = computeEvidenceId(
        ['det-a', 'det-b'],
        '2026-01-21T10:00:00.000Z',
        '2026-01-21T10:05:00.000Z'
      );
      
      expect(id1).toBe(id2);
      expect(id1).toHaveLength(64);
    });
    
    it('should be order-independent', () => {
      const id1 = computeEvidenceId(
        ['det-a', 'det-b', 'det-c'],
        '2026-01-21T10:00:00.000Z',
        '2026-01-21T10:05:00.000Z'
      );
      
      const id2 = computeEvidenceId(
        ['det-c', 'det-a', 'det-b'],
        '2026-01-21T10:00:00.000Z',
        '2026-01-21T10:05:00.000Z'
      );
      
      expect(id1).toBe(id2);
    });
    
    it('should generate different IDs for different inputs', () => {
      const id1 = computeEvidenceId(
        ['det-a'],
        '2026-01-21T10:00:00.000Z',
        '2026-01-21T10:05:00.000Z'
      );
      
      const id2 = computeEvidenceId(
        ['det-b'],
        '2026-01-21T10:00:00.000Z',
        '2026-01-21T10:05:00.000Z'
      );
      
      expect(id1).not.toBe(id2);
    });
  });
  
  describe('Signal Summary Computation', () => {
    it('should compute correct signal summary', () => {
      const detections: DetectionSummary[] = [
        {
          detectionId: 'det-1',
          ruleId: 'rule-a',
          ruleVersion: '1.0.0',
          severity: 'CRITICAL',
          confidence: 0.9,
          detectedAt: '2026-01-21T10:00:00.000Z',
          signalIds: ['s1', 's2'],
        },
        {
          detectionId: 'det-2',
          ruleId: 'rule-b',
          ruleVersion: '1.0.0',
          severity: 'HIGH',
          confidence: 0.8,
          detectedAt: '2026-01-21T10:02:00.000Z',
          signalIds: ['s3'],
        },
        {
          detectionId: 'det-3',
          ruleId: 'rule-a',
          ruleVersion: '1.0.0',
          severity: 'CRITICAL',
          confidence: 0.85,
          detectedAt: '2026-01-21T10:04:00.000Z',
          signalIds: ['s4', 's5', 's6'],
        },
      ];
      
      const summary = computeSignalSummary(detections);
      
      expect(summary.signalCount).toBe(6);
      expect(summary.severityDistribution).toEqual({
        CRITICAL: 2,
        HIGH: 1,
      });
      expect(summary.timeSpread).toBe(4 * 60 * 1000); // 4 minutes in ms
      expect(summary.uniqueRules).toBe(2);
    });
  });
});
