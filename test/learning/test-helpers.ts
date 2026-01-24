/**
 * Phase 4 - Step 7: Test Helpers
 * 
 * Helper functions for learning integration tests.
 */

import type { Incident } from '../../src/incident/incident.schema';
import type { Authority } from '../../src/promotion/authority.schema';

/**
 * Valid outcome request for testing
 */
export const validOutcomeRequest = {
  classification: {
    truePositive: true,
    falsePositive: false,
    rootCause: 'Test root cause',
    resolutionType: 'FIXED' as const,
  },
  humanAssessment: {
    confidenceRating: 0.85,
    severityAccuracy: 'ACCURATE' as const,
    detectionQuality: 'GOOD' as const,
  },
};

/**
 * Human authority for testing
 */
export const humanAuthority: Authority = {
  type: 'HUMAN_OPERATOR',
  principal: 'arn:aws:iam::123456789012:user/operator',
};

/**
 * Create test incident
 */
export function createTestIncident(): Incident {
  const now = new Date().toISOString();
  const incidentId = 'a'.repeat(64);
  
  return {
    incidentId,
    service: 'test-service',
    status: 'OPEN',
    severity: 'HIGH',
    openedAt: now,
    detectionCount: 1,
    correlationCount: 0,
    evidenceCount: 1,
    confidence: 0.8,
    version: '1.0.0',
  };
}

/**
 * Create closed incident
 */
export function createClosedIncident(): Incident {
  const openedAt = new Date(Date.now() - 3600000).toISOString();
  const closedAt = new Date().toISOString();
  const incidentId = 'b'.repeat(64);
  
  return {
    incidentId,
    service: 'test-service',
    status: 'CLOSED',
    severity: 'HIGH',
    openedAt,
    closedAt,
    detectionCount: 1,
    correlationCount: 0,
    evidenceCount: 1,
    confidence: 0.8,
    version: '1.0.0',
  };
}

/**
 * Create open incident
 */
export function createOpenIncident(): Incident {
  const now = new Date().toISOString();
  const incidentId = 'c'.repeat(64);
  
  return {
    incidentId,
    service: 'test-service',
    status: 'OPEN',
    severity: 'HIGH',
    openedAt: now,
    detectionCount: 1,
    correlationCount: 0,
    evidenceCount: 1,
    confidence: 0.8,
    version: '1.0.0',
  };
}

/**
 * Create multiple closed incidents
 */
export function createMultipleClosedIncidents(count: number): Incident[] {
  const incidents: Incident[] = [];
  const baseTime = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days ago
  
  for (let i = 0; i < count; i++) {
    const openedAt = new Date(baseTime + i * 60 * 60 * 1000).toISOString();
    const closedAt = new Date(baseTime + i * 60 * 60 * 1000 + 1800000).toISOString();
    const incidentId = String(i).padStart(64, '0');
    
    incidents.push({
      incidentId,
      service: 'test-service',
      status: 'CLOSED',
      severity: 'HIGH',
      openedAt,
      closedAt,
      detectionCount: 1,
      correlationCount: 0,
      evidenceCount: 1,
      confidence: 0.8,
      version: '1.0.0',
    });
  }
  
  return incidents;
}

/**
 * Transition incident to state (mock)
 */
export async function transitionIncident(
  incidentId: string,
  toState: string
): Promise<void> {
  // Mock implementation for testing
  // In real tests, this would call the incident state machine
  return Promise.resolve();
}
