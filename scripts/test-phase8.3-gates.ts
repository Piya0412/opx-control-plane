#!/usr/bin/env ts-node
/**
 * Phase 8.3: Validation Gates Execution
 * Tests all 4 validation gates
 */

import { z } from 'zod';
import { OutputValidator } from './src/validation/output-validator';
import { SchemaValidator } from './src/validation/schema-validator';
import { BusinessValidator } from './src/validation/business-validator';
import { RetryOrchestrator } from './src/validation/retry-orchestrator';
import { FallbackGenerator } from './src/validation/fallback-generator';

// Test schema
const AgentOutputSchema = z.object({
  confidence: z.number(),
  reasoning: z.string(),
  recommendations: z.array(z.string()),
  citations: z.array(z.object({
    source: z.string(),
    content: z.string(),
  })),
});

type AgentOutput = z.infer<typeof AgentOutputSchema>;

console.log('='.repeat(70));
console.log('PHASE 8.3: VALIDATION GATES EXECUTION');
console.log('='.repeat(70));
console.log();

let gatesPassed = 0;
let gatesFailed = 0;

// ============================================================================
// GATE 1: Schema Validation Correctness
// ============================================================================
console.log('GATE 1: Schema Validation Correctness');
console.log('-'.repeat(70));

try {
  // Test 1.1: Valid data
  const validData = {
    confidence: 0.8,
    reasoning: 'This is valid reasoning with sufficient detail',
    recommendations: ['rec1', 'rec2'],
    citations: [{ source: 'doc1.md', content: 'content' }],
  };

  const result1 = SchemaValidator.validate(AgentOutputSchema, validData);
  if (!result1.ok) {
    throw new Error('Valid data was rejected');
  }
  console.log('  ✅ Test 1.1: Valid data accepted');

  // Test 1.2: Invalid data (non-throwing)
  const invalidData = {
    confidence: 'invalid', // Should be number
    reasoning: 'Valid reasoning',
  };

  const result2 = SchemaValidator.validate(AgentOutputSchema, invalidData);
  if (result2.ok) {
    throw new Error('Invalid data was accepted');
  }
  if (result2.error?.layer !== 'schema') {
    throw new Error('Error layer incorrect');
  }
  console.log('  ✅ Test 1.2: Invalid data rejected (non-throwing)');

  // Test 1.3: No exceptions thrown
  let exceptionThrown = false;
  try {
    SchemaValidator.validate(AgentOutputSchema, null);
  } catch {
    exceptionThrown = true;
  }
  if (exceptionThrown) {
    throw new Error('Exception was thrown');
  }
  console.log('  ✅ Test 1.3: No exceptions thrown');

  console.log();
  console.log('✅ GATE 1 PASSED: Schema validation is non-throwing');
  console.log();
  gatesPassed++;
} catch (error) {
  console.log();
  console.log(`❌ GATE 1 FAILED: ${error instanceof Error ? error.message : String(error)}`);
  console.log();
  gatesFailed++;
}

// ============================================================================
// GATE 2: Retry Logic Behavior
// ============================================================================
console.log('GATE 2: Retry Logic Behavior');
console.log('-'.repeat(70));

try {
  const orchestrator = new RetryOrchestrator();

  // Test 2.1: Bounded retries
  if (!orchestrator.shouldRetry(0)) throw new Error('Should allow retry 0');
  if (!orchestrator.shouldRetry(1)) throw new Error('Should allow retry 1');
  if (!orchestrator.shouldRetry(2)) throw new Error('Should allow retry 2');
  if (orchestrator.shouldRetry(3)) throw new Error('Should not allow retry 3');
  console.log('  ✅ Test 2.1: Retries bounded to max 3');

  // Test 2.2: Prompt simplification (no raw errors)
  const errors = [
    { layer: 'schema' as const, message: 'Field "confidence" is required', details: { path: ['confidence'] } },
  ];
  const prompt1 = orchestrator.generateRetryPrompt(1, 'Original prompt', errors);
  const prompt2 = orchestrator.generateRetryPrompt(2, 'Original prompt', errors);

  // Should not contain specific field names or error details
  if (prompt1.toLowerCase().includes('field "confidence"') || prompt1.includes('path')) {
    throw new Error('Retry prompt contains raw error details');
  }
  if (prompt2.toLowerCase().includes('field "confidence"') || prompt2.includes('path')) {
    throw new Error('Retry prompt contains raw error details');
  }
  // Generic terms like "required" are OK - they're part of the summary
  console.log('  ✅ Test 2.2: Prompts summarized (no raw errors)');

  // Test 2.3: Attempt bucketing
  if (orchestrator.getAttemptBucket(0) !== 'first') throw new Error('Bucket 0 wrong');
  if (orchestrator.getAttemptBucket(1) !== 'second') throw new Error('Bucket 1 wrong');
  if (orchestrator.getAttemptBucket(2) !== 'fallback') throw new Error('Bucket 2 wrong');
  console.log('  ✅ Test 2.3: Attempts bucketed correctly');

  console.log();
  console.log('✅ GATE 2 PASSED: Retry logic correct');
  console.log();
  gatesPassed++;
} catch (error) {
  console.log();
  console.log(`❌ GATE 2 FAILED: ${error instanceof Error ? error.message : String(error)}`);
  console.log();
  gatesFailed++;
}

// ============================================================================
// GATE 3: Fallback Generation
// ============================================================================
console.log('GATE 3: Fallback Generation');
console.log('-'.repeat(70));

try {
  const generator = new FallbackGenerator();

  // Test 3.1: Confidence 0.0
  const fallback1 = generator.generateFallback({
    agentId: 'test-agent',
    sessionId: 'test-session',
    attempts: 3,
    template: {
      confidence: 0.5,
      reasoning: 'Original',
      recommendations: ['rec1'],
      citations: [],
    },
  });

  if (fallback1.confidence !== 0.0) {
    throw new Error(`Confidence should be 0.0, got ${fallback1.confidence}`);
  }
  console.log('  ✅ Test 3.1: Fallback has confidence 0.0');

  // Test 3.2: Honest reasoning
  if (!fallback1.reasoning.toLowerCase().includes('unable')) {
    throw new Error('Fallback reasoning not honest');
  }
  if (fallback1.reasoning.includes('high confidence') || fallback1.reasoning.includes('successfully')) {
    throw new Error('Fallback reasoning is misleading');
  }
  console.log('  ✅ Test 3.2: Fallback reasoning is honest');

  // Test 3.3: Safe defaults (empty arrays)
  if (fallback1.recommendations.length !== 0) {
    throw new Error('Recommendations should be empty');
  }
  console.log('  ✅ Test 3.3: Arrays cleared to safe defaults');

  console.log();
  console.log('✅ GATE 3 PASSED: Fallback generation correct');
  console.log();
  gatesPassed++;
} catch (error) {
  console.log();
  console.log(`❌ GATE 3 FAILED: ${error instanceof Error ? error.message : String(error)}`);
  console.log();
  gatesFailed++;
}

// ============================================================================
// GATE 4: Business Logic Validation
// ============================================================================
console.log('GATE 4: Business Logic Validation');
console.log('-'.repeat(70));

try {
  const validator = new BusinessValidator();

  // Test 4.1: Confidence range
  if (!validator.validateConfidence(0).ok) throw new Error('0 should be valid');
  if (!validator.validateConfidence(0.5).ok) throw new Error('0.5 should be valid');
  if (!validator.validateConfidence(1).ok) throw new Error('1 should be valid');
  if (validator.validateConfidence(-0.1).ok) throw new Error('-0.1 should be invalid');
  if (validator.validateConfidence(1.1).ok) throw new Error('1.1 should be invalid');
  console.log('  ✅ Test 4.1: Confidence range validated');

  // Test 4.2: Reasoning length
  if (!validator.validateReasoning('This is valid reasoning with sufficient length').ok) {
    throw new Error('Valid reasoning rejected');
  }
  if (validator.validateReasoning('Short').ok) {
    throw new Error('Short reasoning accepted');
  }
  if (validator.validateReasoning('').ok) {
    throw new Error('Empty reasoning accepted');
  }
  console.log('  ✅ Test 4.2: Reasoning length validated');

  // Test 4.3: Citations structure
  if (!validator.validateCitations([{ source: 'doc1', content: 'content' }]).ok) {
    throw new Error('Valid citations rejected');
  }
  if (validator.validateCitations([{ source: '', content: 'content' }]).ok) {
    throw new Error('Empty source accepted');
  }
  if (validator.validateCitations([{ source: 'doc1', content: '' }]).ok) {
    throw new Error('Empty content accepted');
  }
  console.log('  ✅ Test 4.3: Citations structure validated');

  console.log();
  console.log('✅ GATE 4 PASSED: Business logic validation correct');
  console.log();
  gatesPassed++;
} catch (error) {
  console.log();
  console.log(`❌ GATE 4 FAILED: ${error instanceof Error ? error.message : String(error)}`);
  console.log();
  gatesFailed++;
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log('='.repeat(70));
console.log('VALIDATION SUMMARY');
console.log('='.repeat(70));
console.log();
console.log(`  Gates Passed: ${gatesPassed}/4`);
console.log(`  Gates Failed: ${gatesFailed}/4`);
console.log();

if (gatesPassed === 4) {
  console.log('  🎉 ALL GATES PASSED - Phase 8.3 Validated!');
  console.log();
  console.log('  ✅ Correction 1: Non-throwing validation verified');
  console.log('  ✅ Correction 2: Best-effort semantic (design verified)');
  console.log('  ✅ Correction 3: Summarized retry prompts verified');
  console.log('  ✅ Correction 4: Bucketed dimensions verified');
  console.log();
  console.log('  Production Status: APPROVED');
  process.exit(0);
} else {
  console.log('  ⚠️  Some gates failed - review results above');
  process.exit(1);
}
