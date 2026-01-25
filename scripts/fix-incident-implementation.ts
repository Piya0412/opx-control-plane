#!/usr/bin/env tsx
/**
 * CRITICAL FIX: Update Incident Implementation Files
 * 
 * Updates all implementation files to use the unified schema:
 * - state → status
 * - IncidentState → IncidentStatus
 * - NormalizedSeverity → Severity (SEV1-SEV5)
 * - resolution fields flattened
 */

import * as fs from 'fs';

console.log('🔧 Fixing Incident Implementation Files...\n');

// === FIX: incident-manager.ts ===

console.log('📝 Updating incident-manager.ts...');

const incidentManagerPath = 'src/incident/incident-manager.ts';
let incidentManager = fs.readFileSync(incidentManagerPath, 'utf-8');

// Replace imports
incidentManager = incidentManager.replace(
  /IncidentState,/g,
  'IncidentStatus,'
);

incidentManager = incidentManager.replace(
  /NormalizedSeverity,/g,
  'Severity,'
);

// Replace type references
incidentManager = incidentManager.replace(
  /state\?: IncidentState;/g,
  'status?: IncidentStatus;'
);

incidentManager = incidentManager.replace(
  /severity\?: NormalizedSeverity;/g,
  'severity?: Severity;'
);

incidentManager = incidentManager.replace(
  /targetState: IncidentState,/g,
  'targetStatus: IncidentStatus,'
);

// Replace field names in code
incidentManager = incidentManager.replace(
  /state: 'OPEN',/g,
  "status: 'PENDING',"
);

incidentManager = incidentManager.replace(
  /\.state/g,
  '.status'
);

incidentManager = incidentManager.replace(
  /private deriveSeverity\(evidence: EvidenceBundle\): NormalizedSeverity/g,
  'private deriveSeverity(evidence: EvidenceBundle): Severity'
);

incidentManager = incidentManager.replace(
  /private buildTitle\(evidence: EvidenceBundle, severity: NormalizedSeverity\)/g,
  'private buildTitle(evidence: EvidenceBundle, severity: Severity)'
);

// Fix severity mapping (CRITICAL/HIGH/MEDIUM/LOW/INFO → SEV1/SEV2/SEV3/SEV4/SEV5)
incidentManager = incidentManager.replace(
  /if \(severities\.includes\('CRITICAL'\)\) return 'CRITICAL';[\s\S]*?return 'INFO';/,
  `// Map detection severities to incident severities
    // Detection: CRITICAL/HIGH/MEDIUM/LOW/INFO
    // Incident: SEV1/SEV2/SEV3/SEV4/SEV5
    if (severities.includes('CRITICAL')) return 'SEV1';
    if (severities.includes('HIGH')) return 'SEV2';
    if (severities.includes('MEDIUM')) return 'SEV3';
    if (severities.includes('LOW')) return 'SEV4';
    return 'SEV5';`
);

// Add missing fields
incidentManager = incidentManager.replace(
  /createdAt: promotionResult\.evaluatedAt,/,
  `createdAt: promotionResult.evaluatedAt,
      detectionCount: evidence.detections.length,
      evidenceGraphCount: 1, // Single evidence bundle
      blastRadiusScope: 'SINGLE_SERVICE', // Default, can be enhanced later
      incidentVersion: 1,`
);

fs.writeFileSync(incidentManagerPath, incidentManager, 'utf-8');
console.log('✅ incident-manager.ts updated\n');

// === FIX: incident-store.ts ===

console.log('📝 Updating incident-store.ts...');

const incidentStorePath = 'src/incident/incident-store.ts';
if (fs.existsSync(incidentStorePath)) {
  let incidentStore = fs.readFileSync(incidentStorePath, 'utf-8');
  
  incidentStore = incidentStore.replace(/IncidentState/g, 'IncidentStatus');
  incidentStore = incidentStore.replace(/\.state/g, '.status');
  
  fs.writeFileSync(incidentStorePath, incidentStore, 'utf-8');
  console.log('✅ incident-store.ts updated\n');
}

console.log('✅ Implementation files updated!');
console.log('');
console.log('Next: Run npm test to verify fixes');
