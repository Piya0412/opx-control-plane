/**
 * Phase 6 Step 4: Agent Guardrails
 * 
 * CORRECTION 4: Simplified to check schema/confidence/disclaimer/PII/cost only.
 * Does NOT validate execution semantics (Phase 5 responsibility).
 */

import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatchClient({});

export interface GuardrailViolation {
  rule: string;
  severity: 'WARNING' | 'ERROR';
  message: string;
}

export class AgentGuardrails {
  /**
   * Validate agent output against guardrails
   */
  static validateOutput(_agentId: string, output: any): GuardrailViolation[] {
    const violations: GuardrailViolation[] = [];

    // Guardrail 1: Disclaimer present
    if (!this.hasDisclaimer(output)) {
      violations.push({
        rule: 'DISCLAIMER_REQUIRED',
        severity: 'ERROR',
        message: 'Agent output missing HYPOTHESIS_ONLY_NOT_AUTHORITATIVE disclaimer',
      });
    }

    // Guardrail 2: Confidence scores present and normalized
    if (!this.hasValidConfidence(output)) {
      violations.push({
        rule: 'CONFIDENCE_REQUIRED',
        severity: 'ERROR',
        message: 'Agent output missing or invalid confidence scores (must be 0.0-1.0)',
      });
    }

    // Guardrail 3: Schema compliance (basic structure check)
    if (!this.hasValidSchema(output)) {
      violations.push({
        rule: 'SCHEMA_INVALID',
        severity: 'ERROR',
        message: 'Agent output does not match expected schema structure',
      });
    }

    // Guardrail 4: No PII in output
    if (this.containsPII(output)) {
      violations.push({
        rule: 'NO_PII',
        severity: 'ERROR',
        message: 'Agent output contains potential PII',
      });
    }

    // Guardrail 5: Cost within limits
    if (output.cost && output.cost > 1.0) {
      violations.push({
        rule: 'COST_LIMIT',
        severity: 'ERROR',
        message: `Agent cost ${output.cost} exceeds limit of $1.00`,
      });
    }

    return violations;
  }

  private static hasDisclaimer(output: any): boolean {
    const outputStr = JSON.stringify(output);
    return outputStr.includes('HYPOTHESIS_ONLY_NOT_AUTHORITATIVE');
  }

  private static hasValidConfidence(output: any): boolean {
    // Check if confidence exists and is in valid range
    if (output.analysis && typeof output.analysis.confidence === 'number') {
      const conf = output.analysis.confidence;
      return conf >= 0.0 && conf <= 1.0;
    }
    return false;
  }

  private static hasValidSchema(output: any): boolean {
    // Basic structure check (not full Zod validation)
    return (
      output &&
      typeof output === 'object' &&
      output.agentId &&
      output.agentVersion &&
      output.schemaVersion &&
      output.modelVersion
    );
  }

  private static containsPII(output: any): boolean {
    // Simple PII detection (email, SSN, phone patterns)
    const outputStr = JSON.stringify(output);
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const ssnPattern = /\d{3}-\d{2}-\d{4}/;
    const phonePattern = /\d{3}-\d{3}-\d{4}/;

    return (
      emailPattern.test(outputStr) ||
      ssnPattern.test(outputStr) ||
      phonePattern.test(outputStr)
    );
  }

  /**
   * Log guardrail violations
   */
  static async logViolations(
    agentId: string,
    incidentId: string,
    violations: GuardrailViolation[]
  ): Promise<void> {
    if (violations.length === 0) return;

    console.warn('GUARDRAIL_VIOLATIONS', {
      agentId,
      incidentId,
      violations,
    });

    // Publish guardrail violation count
    const errorCount = violations.filter((v) => v.severity === 'ERROR').length;

    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: 'OPX/Agents',
        MetricData: [
          {
            MetricName: 'GuardrailViolationCount',
            Value: violations.length,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
            Dimensions: [
              { Name: 'AgentId', Value: agentId },
              { Name: 'Severity', Value: errorCount > 0 ? 'ERROR' : 'WARNING' },
            ],
          },
        ],
      })
    );
  }
}
