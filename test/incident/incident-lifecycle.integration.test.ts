/**
 * Phase 3.4: Incident Lifecycle Integration Tests
 * 
 * Tests the complete incident lifecycle from creation through state transitions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IncidentManager } from '../../src/incident/incident-manager';
import { IncidentStore } from '../../src/incident/incident-store';
import { IncidentStateMachine } from '../../src/incident/state-machine';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { Incident, Authority, TransitionMetadata } from '../../src/incident/incident.schema';
import type { PromotionResult } from '../../src/promotion/promotion.schema';
import type { EvidenceBundle } from '../../src/evidence/evidence-bundle.schema';

describe('Phase 3.4: Incident Lifecycle Integration', () => {
  let incidentManager: IncidentManager;
  let incidentStore: IncidentStore;
  let stateMachine: IncidentStateMachine;

  const tableName = process.env.INCIDENTS_TABLE_NAME || 'opx-incidents';
  const client = new DynamoDBClient({});

  beforeEach(() => {
    stateMachine = new IncidentStateMachine();
    incidentStore = new IncidentStore({ tableName, client });
    incidentManager = new IncidentManager(incidentStore, stateMachine);
  });

  describe('Incident Creation', () => {
    it('should create incident from promotion result', async () => {
      // Arrange - Use unique IDs to avoid conflicts with previous test runs
      const uniqueSuffix = Date.now().toString().padStart(16, '0');
      const promotionResult: PromotionResult = {
        decision: 'PROMOTE',
        candidateId: ('a' + uniqueSuffix).padEnd(64, '0'),
        incidentId: ('b' + uniqueSuffix).padEnd(64, '0'),
        confidenceScore: 0.8,
        confidenceBand: 'HIGH',
        evaluatedAt: '2026-01-22T10:00:00.000Z',
        gateVersion: 'v1.0.0',
      };

      const evidence: EvidenceBundle = {
        evidenceId: ('c' + uniqueSuffix).padEnd(64, '0'),
        service: 'order-service',
        detections: [
          {
            detectionId: ('d' + uniqueSuffix).padEnd(64, '0'),
            ruleId: 'high-error-rate',
            severity: 'CRITICAL',
            signalIds: ['signal1', 'signal2'],
            detectedAt: '2026-01-22T09:55:00.000Z',
          },
          {
            detectionId: ('e' + uniqueSuffix).padEnd(64, '0'),
            ruleId: 'high-latency',
            severity: 'HIGH',
            signalIds: ['signal3'],
            detectedAt: '2026-01-22T09:56:00.000Z',
          },
        ],
        windowStart: '2026-01-22T09:50:00.000Z',
        windowEnd: '2026-01-22T10:00:00.000Z',
        bundledAt: '2026-01-22T10:00:00.000Z',
        signalSummary: {
          signalCount: 3,
          severityDistribution: { CRITICAL: 2, HIGH: 1 },
          timeSpread: 60000,
          uniqueRules: 2,
        },
      };

      const authority: Authority = {
        type: 'AUTO_ENGINE',
        principal: 'arn:aws:lambda:us-east-1:123456789012:function:test',
      };

      // Act
      const incident = await incidentManager.createIncident(
        promotionResult,
        evidence,
        promotionResult.candidateId,
        authority
      );

      // Assert
      expect(incident).toBeDefined();
      expect(incident.incidentId).toBe(promotionResult.incidentId);
      expect(incident.status).toBe('PENDING');
      expect(incident.service).toBe('order-service');
      expect(incident.severity).toBe('SEV1'); // CRITICAL maps to SEV1
      expect(incident.evidenceId).toBe(evidence.evidenceId);
      expect(incident.candidateId).toBe(promotionResult.candidateId);
      expect(incident.confidenceScore).toBe(0.8);
      expect(incident.openedAt).toBeUndefined(); // Not set until OPEN
      expect(incident.lastModifiedAt).toBe(promotionResult.evaluatedAt); // DERIVED
      expect(incident.createdBy).toEqual(authority);
      expect(incident.lastModifiedBy).toEqual(authority);
      expect(incident.title).toContain('SEV1'); // Title uses mapped severity
      expect(incident.title).toContain('order-service');
    });

    it('should be idempotent - return existing incident on duplicate create', async () => {
      // Arrange
      const promotionResult: PromotionResult = {
        decision: 'PROMOTE',
        candidateId: 'a'.repeat(64),
        incidentId: 'b'.repeat(64), // Exactly 64 chars
        confidenceScore: 0.7,
        confidenceBand: 'HIGH',
        evaluatedAt: '2026-01-22T10:00:00.000Z',
        gateVersion: 'v1.0.0',
      };

      const evidence: EvidenceBundle = {
        evidenceId: 'c'.repeat(64),
        service: 'payment-service',
        detections: [
          {
            detectionId: 'd'.repeat(64),
            ruleId: 'test-rule',
            severity: 'HIGH',
            signalIds: ['signal1', 'signal2'],
            detectedAt: '2026-01-22T09:55:00.000Z',
          },
        ],
        windowStart: '2026-01-22T09:50:00.000Z',
        windowEnd: '2026-01-22T10:00:00.000Z',
        bundledAt: '2026-01-22T10:00:00.000Z',
        signalSummary: {
          signalCount: 2,
          severityDistribution: { HIGH: 2 },
          timeSpread: 0,
          uniqueRules: 1,
        },
      };

      const authority: Authority = {
        type: 'AUTO_ENGINE',
        principal: 'arn:aws:lambda:us-east-1:123456789012:function:test',
      };

      // Act - Create twice
      const incident1 = await incidentManager.createIncident(
        promotionResult,
        evidence,
        promotionResult.candidateId,
        authority
      );

      const incident2 = await incidentManager.createIncident(
        promotionResult,
        evidence,
        promotionResult.candidateId,
        authority
      );

      // Assert - Same incident returned
      expect(incident1.incidentId).toBe(incident2.incidentId);
      expect(incident1.openedAt).toBe(incident2.openedAt);
      expect(incident1.status).toBe(incident2.status);
    });

    it('should derive severity from evidence (max severity)', async () => {
      // Arrange - Use unique IDs to avoid conflicts with previous test runs
      const uniqueSuffix = Date.now().toString().padStart(16, '0');
      const promotionResult: PromotionResult = {
        decision: 'PROMOTE',
        candidateId: ('a' + uniqueSuffix).padEnd(64, '0'),
        incidentId: ('c' + uniqueSuffix).padEnd(64, '0'), // Different from first test
        confidenceScore: 0.7,
        confidenceBand: 'HIGH',
        evaluatedAt: '2026-01-22T10:00:00.000Z',
        gateVersion: 'v1.0.0',
      };

      const evidence: EvidenceBundle = {
        evidenceId: ('c' + uniqueSuffix).padEnd(64, '0'),
        service: 'test-service',
        detections: [
          {
            detectionId: ('d' + uniqueSuffix).padEnd(64, '0'),
            ruleId: 'rule1',
            severity: 'LOW',
            signalIds: ['signal1'],
            detectedAt: '2026-01-22T09:55:00.000Z',
          },
          {
            detectionId: ('e' + uniqueSuffix).padEnd(64, '0'),
            ruleId: 'rule2',
            severity: 'CRITICAL',
            signalIds: ['signal2'],
            detectedAt: '2026-01-22T09:56:00.000Z',
          },
          {
            detectionId: ('f' + uniqueSuffix).padEnd(64, '0'),
            ruleId: 'rule3',
            severity: 'MEDIUM',
            signalIds: ['signal3'],
            detectedAt: '2026-01-22T09:57:00.000Z',
          },
        ],
        windowStart: '2026-01-22T09:50:00.000Z',
        windowEnd: '2026-01-22T10:00:00.000Z',
        bundledAt: '2026-01-22T10:00:00.000Z',
        signalSummary: {
          signalCount: 3,
          severityDistribution: { LOW: 1, CRITICAL: 1, MEDIUM: 1 },
          timeSpread: 120000,
          uniqueRules: 3,
        },
      };

      const authority: Authority = {
        type: 'AUTO_ENGINE',
        principal: 'arn:aws:lambda:us-east-1:123456789012:function:test',
      };

      // Act
      const incident = await incidentManager.createIncident(
        promotionResult,
        evidence,
        promotionResult.candidateId,
        authority
      );

      // Assert - Should use CRITICAL (max severity)
      expect(incident.severity).toBe('SEV1'); // CRITICAL maps to SEV1
    });
  });

  describe('State Transitions', () => {
    let testIncident: Incident;

    beforeEach(async () => {
      // Create a test incident with unique ID for each test
      const uniqueId = 'd' + Date.now().toString().padStart(63, '0'); // Exactly 64 chars
      const promotionResult: PromotionResult = {
        decision: 'PROMOTE',
        candidateId: 'a'.repeat(64),
        incidentId: uniqueId.substring(0, 64), // Ensure exactly 64 chars
        confidenceScore: 0.8,
        confidenceBand: 'HIGH',
        evaluatedAt: '2026-01-22T10:00:00.000Z',
        gateVersion: 'v1.0.0',
      };

      const evidence: EvidenceBundle = {
        evidenceId: 'c'.repeat(64),
        service: 'test-service',
        detections: [
          {
            detectionId: 'd'.repeat(64),
            ruleId: 'test-rule',
            severity: 'HIGH',
            signalIds: ['signal1', 'signal2'],
            detectedAt: '2026-01-22T09:55:00.000Z',
          },
        ],
        windowStart: '2026-01-22T09:50:00.000Z',
        windowEnd: '2026-01-22T10:00:00.000Z',
        bundledAt: '2026-01-22T10:00:00.000Z',
        signalSummary: {
          signalCount: 2,
          severityDistribution: { HIGH: 2 },
          timeSpread: 0,
          uniqueRules: 1,
        },
      };

      const authority: Authority = {
        type: 'AUTO_ENGINE',
        principal: 'arn:aws:lambda:us-east-1:123456789012:function:test',
      };

      testIncident = await incidentManager.createIncident(
        promotionResult,
        evidence,
        promotionResult.candidateId,
        authority
      );
    });

    it('should transition PENDING → OPEN', async () => {
      // Arrange
      const authority: Authority = {
        type: 'HUMAN_OPERATOR',
        principal: 'arn:aws:iam::123456789012:user/operator',
      };

      // testIncident is already in PENDING state

      // Act
      const updated = await incidentManager.transitionIncident(
        testIncident.incidentId,
        'OPEN',
        authority
      );

      // Assert
      expect(updated.status).toBe('OPEN');
      expect(updated.openedAt).toBeDefined();
      expect(updated.lastModifiedBy).toEqual(authority);
      expect(updated.lastModifiedAt).not.toBe(testIncident.lastModifiedAt);
    });

    it('should transition OPEN → MITIGATING', async () => {
      // Arrange
      const authority: Authority = {
        type: 'HUMAN_OPERATOR',
        principal: 'arn:aws:iam::123456789012:user/operator',
      };

      // First transition to OPEN
      await incidentManager.transitionIncident(
        testIncident.incidentId,
        'OPEN',
        authority
      );

      // Act
      const updated = await incidentManager.transitionIncident(
        testIncident.incidentId,
        'MITIGATING',
        authority
      );

      // Assert
      expect(updated.status).toBe('MITIGATING');
      expect(updated.mitigatingAt).toBeDefined();
    });

    it('should transition OPEN → RESOLVED (direct path)', async () => {
      // Arrange
      const authority: Authority = {
        type: 'ON_CALL_SRE',
        principal: 'arn:aws:iam::123456789012:user/sre',
      };

      const metadata: TransitionMetadata = {
        reason: 'Quick fix applied',
        notes: 'Simple configuration change',
      };

      // First transition to OPEN
      await incidentManager.transitionIncident(
        testIncident.incidentId,
        'OPEN',
        { type: 'HUMAN_OPERATOR', principal: 'arn:aws:iam::123456789012:user/operator' }
      );

      // Act - Direct transition from OPEN to RESOLVED
      const updated = await incidentManager.transitionIncident(
        testIncident.incidentId,
        'RESOLVED',
        authority,
        metadata
      );

      // Assert
      expect(updated.status).toBe('RESOLVED');
      expect(updated.resolvedAt).toBeDefined();
      expect(updated.lastModifiedBy.type).toBe('ON_CALL_SRE');
    });

    it('should transition MITIGATING → RESOLVED with metadata', async () => {
      // Arrange
      const authority: Authority = {
        type: 'ON_CALL_SRE',
        principal: 'arn:aws:iam::123456789012:user/sre',
      };

      // First transition to OPEN, then MITIGATING
      await incidentManager.transitionIncident(
        testIncident.incidentId,
        'OPEN',
        { type: 'HUMAN_OPERATOR', principal: 'arn:aws:iam::123456789012:user/operator' }
      );

      await incidentManager.transitionIncident(
        testIncident.incidentId,
        'MITIGATING',
        { type: 'HUMAN_OPERATOR', principal: 'arn:aws:iam::123456789012:user/operator' }
      );

      const metadata: TransitionMetadata = {
        reason: 'Deployed fix v2.1.0',
        notes: 'Rolled back bad deployment',
      };

      // Act
      const updated = await incidentManager.transitionIncident(
        testIncident.incidentId,
        'RESOLVED',
        authority,
        metadata
      );

      // Assert
      expect(updated.status).toBe('RESOLVED');
      expect(updated.resolvedAt).toBeDefined();
      expect(updated.lastModifiedBy.type).toBe('ON_CALL_SRE');
    });

    it('should transition RESOLVED → CLOSED', async () => {
      // Arrange
      const authority: Authority = {
        type: 'HUMAN_OPERATOR',
        principal: 'arn:aws:iam::123456789012:user/operator',
      };

      // Transition through states to RESOLVED
      await incidentManager.transitionIncident(
        testIncident.incidentId,
        'OPEN',
        authority
      );

      await incidentManager.transitionIncident(
        testIncident.incidentId,
        'MITIGATING',
        authority
      );

      await incidentManager.transitionIncident(
        testIncident.incidentId,
        'RESOLVED',
        { type: 'ON_CALL_SRE', principal: 'arn:aws:iam::123456789012:user/sre' },
        { reason: 'Fixed' }
      );

      // Act
      const updated = await incidentManager.transitionIncident(
        testIncident.incidentId,
        'CLOSED',
        authority
      );

      // Assert
      expect(updated.status).toBe('CLOSED');
      expect(updated.closedAt).toBeDefined();
    });

    it('should reject invalid transition OPEN → CLOSED', async () => {
      // Arrange
      const authority: Authority = {
        type: 'ON_CALL_SRE',
        principal: 'arn:aws:iam::123456789012:user/sre',
      };

      // First transition to OPEN
      await incidentManager.transitionIncident(
        testIncident.incidentId,
        'OPEN',
        { type: 'HUMAN_OPERATOR', principal: 'arn:aws:iam::123456789012:user/operator' }
      );

      // Act & Assert
      await expect(
        incidentManager.transitionIncident(
          testIncident.incidentId,
          'CLOSED',
          authority
        )
      ).rejects.toThrow('Transition not allowed');
    });

    it('should reject transition from CLOSED (terminal state)', async () => {
      // Arrange
      const authority: Authority = {
        type: 'HUMAN_OPERATOR',
        principal: 'arn:aws:iam::123456789012:user/operator',
      };

      // Transition to CLOSED
      await incidentManager.transitionIncident(
        testIncident.incidentId,
        'OPEN',
        authority
      );

      await incidentManager.transitionIncident(
        testIncident.incidentId,
        'MITIGATING',
        authority
      );

      await incidentManager.transitionIncident(
        testIncident.incidentId,
        'RESOLVED',
        { type: 'ON_CALL_SRE', principal: 'arn:aws:iam::123456789012:user/sre' },
        { reason: 'Fixed' }
      );

      await incidentManager.transitionIncident(
        testIncident.incidentId,
        'CLOSED',
        authority
      );

      // Act & Assert - Try to transition from CLOSED
      await expect(
        incidentManager.transitionIncident(
          testIncident.incidentId,
          'OPEN',
          authority
        )
      ).rejects.toThrow('Transition not allowed');
    });

    it('should reject transition with insufficient authority', async () => {
      // Arrange
      const authority: Authority = {
        type: 'HUMAN_OPERATOR', // Not ON_CALL_SRE
        principal: 'arn:aws:iam::123456789012:user/operator',
      };

      // Transition to OPEN, then MITIGATING first
      await incidentManager.transitionIncident(
        testIncident.incidentId,
        'OPEN',
        authority
      );

      await incidentManager.transitionIncident(
        testIncident.incidentId,
        'MITIGATING',
        authority
      );

      // Act & Assert - Try to resolve without ON_CALL_SRE authority
      await expect(
        incidentManager.transitionIncident(
          testIncident.incidentId,
          'RESOLVED',
          authority,
          { reason: 'Fixed' }
        )
      ).rejects.toThrow('Insufficient authority');
    });

    it('should reject transition without required metadata', async () => {
      // Arrange
      const authority: Authority = {
        type: 'ON_CALL_SRE',
        principal: 'arn:aws:iam::123456789012:user/sre',
      };

      // Transition to OPEN, then MITIGATING first
      await incidentManager.transitionIncident(
        testIncident.incidentId,
        'OPEN',
        { type: 'HUMAN_OPERATOR', principal: 'arn:aws:iam::123456789012:user/operator' }
      );

      await incidentManager.transitionIncident(
        testIncident.incidentId,
        'MITIGATING',
        { type: 'HUMAN_OPERATOR', principal: 'arn:aws:iam::123456789012:user/operator' }
      );

      // Act & Assert - Try to resolve without required metadata
      await expect(
        incidentManager.transitionIncident(
          testIncident.incidentId,
          'RESOLVED',
          authority
          // Missing metadata with 'reason' field
        )
      ).rejects.toThrow('Missing required metadata');
    });
  });

  describe('Determinism', () => {
    it('should produce same incidentId for same evidence', async () => {
      // Arrange
      const promotionResult: PromotionResult = {
        decision: 'PROMOTE',
        candidateId: 'a'.repeat(64),
        incidentId: 'e'.repeat(64), // Exactly 64 chars
        confidenceScore: 0.8,
        confidenceBand: 'HIGH',
        evaluatedAt: '2026-01-22T10:00:00.000Z',
        gateVersion: 'v1.0.0',
      };

      const evidence: EvidenceBundle = {
        evidenceId: 'c'.repeat(64),
        service: 'test-service',
        detections: [
          {
            detectionId: 'd'.repeat(64),
            ruleId: 'test-rule',
            severity: 'HIGH',
            signalIds: ['signal1', 'signal2'],
            detectedAt: '2026-01-22T09:55:00.000Z',
          },
        ],
        windowStart: '2026-01-22T09:50:00.000Z',
        windowEnd: '2026-01-22T10:00:00.000Z',
        bundledAt: '2026-01-22T10:00:00.000Z',
        signalSummary: {
          signalCount: 2,
          severityDistribution: { HIGH: 2 },
          timeSpread: 0,
          uniqueRules: 1,
        },
      };

      const authority: Authority = {
        type: 'AUTO_ENGINE',
        principal: 'arn:aws:lambda:us-east-1:123456789012:function:test',
      };

      // Act - Create incident (will be idempotent on second call)
      const incident1 = await incidentManager.createIncident(
        promotionResult,
        evidence,
        promotionResult.candidateId,
        authority
      );

      const incident2 = await incidentManager.createIncident(
        promotionResult,
        evidence,
        promotionResult.candidateId,
        authority
      );

      // Assert - Same incident ID
      expect(incident1.incidentId).toBe(incident2.incidentId);
      expect(incident1.incidentId).toBe(promotionResult.incidentId);
    });
  });
});
