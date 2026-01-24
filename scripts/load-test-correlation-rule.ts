/**
 * Load Test Correlation Rule
 * 
 * Creates a simple test correlation rule for Phase 2.2 testing.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CorrelationRuleStore } from '../src/correlation/correlation-rule-store.js';
import type { CorrelationRule } from '../src/correlation/correlation-rule.schema.js';

const dynamoClient = new DynamoDBClient({});
const ruleStore = new CorrelationRuleStore(dynamoClient, 'opx-correlation-rules');

const testRule: CorrelationRule = {
  ruleId: 'rule-test-high-severity',
  ruleName: 'Test High Severity Correlation',
  ruleVersion: '1.0.0',
  description: 'Test rule for correlating high severity signals',
  
  filters: {
    severity: ['SEV1', 'SEV2'],
  },
  
  timeWindow: {
    duration: 'PT5M', // 5 minutes
    alignment: 'fixed',
  },
  
  groupBy: {
    service: true,
    severity: true,
    identityWindow: false,
  },
  
  threshold: {
    minSignals: 2,
    maxSignals: 10,
  },
  
  candidateTemplate: {
    title: '{{signalCount}} high severity signals in {{service}}',
    description: 'Correlated {{signalCount}} {{severity}} signals in service {{service}} between {{windowStart}} and {{windowEnd}}',
    tags: ['high-severity', 'auto-correlated'],
  },
  
  createdAt: new Date().toISOString(),
  createdBy: 'test-script',
  enabled: true,
};

async function main() {
  try {
    console.log('Creating test correlation rule...');
    await ruleStore.createRule(testRule);
    console.log('✓ Test correlation rule created successfully');
    
    // Verify it was created
    const retrieved = await ruleStore.getRule(testRule.ruleId, testRule.ruleVersion);
    console.log('✓ Verified rule exists:', retrieved?.ruleId);
    
    // List enabled rules
    const enabledRules = await ruleStore.listEnabledRules();
    console.log(`✓ Total enabled rules: ${enabledRules.length}`);
    
  } catch (error) {
    console.error('✗ Error:', error);
    process.exit(1);
  }
}

main();
