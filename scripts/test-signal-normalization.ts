/**
 * Test Signal Normalization
 * 
 * Debug why signals are failing to normalize
 */

import { SignalNormalizer } from '../src/signal/signal-normalizer.js';
import { readFileSync } from 'fs';

const normalizer = new SignalNormalizer();

// Load test signal
const signal1 = JSON.parse(readFileSync('test-signals/signal-1.json', 'utf-8'));

console.log('Input signal:', JSON.stringify(signal1, null, 2));

const normalized = normalizer.normalizeCloudWatchAlarm(signal1);

if (normalized) {
  console.log('\n✓ Normalization successful!');
  console.log('Normalized signal:', JSON.stringify(normalized, null, 2));
} else {
  console.log('\n✗ Normalization failed!');
  console.log('Checking requirements:');
  console.log('- NewStateValue:', signal1.NewStateValue);
  console.log('- AlarmName:', signal1.AlarmName);
  
  // Test service extraction
  const parts = signal1.AlarmName.split('-');
  console.log('- Alarm name parts:', parts);
  console.log('- Service (parts[0]):', parts[0]);
  
  // Test severity extraction
  if (parts.length >= 3) {
    console.log('- Severity candidate (parts[1]):', parts[1]);
    console.log('- Is valid severity?:', ['SEV1', 'SEV2', 'SEV3', 'SEV4'].includes(parts[1].toUpperCase()));
  } else {
    console.log('- Not enough parts for severity');
  }
}
