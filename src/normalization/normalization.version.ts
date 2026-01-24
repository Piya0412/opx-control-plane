/**
 * CP-2: Normalization Version Registry
 * 
 * Tracks normalization logic versions.
 * Logic changes require new version.
 */

export const NORMALIZATION_VERSION = 'v1';

/**
 * Version History
 * 
 * v1 (2026-01-15):
 * - Initial normalization rules
 * - Field canonicalization
 * - Resource/environment reference extraction
 * - Evidence reference pointers
 */
export const VERSION_HISTORY = {
  v1: {
    date: '2026-01-15',
    description: 'Initial normalization rules',
    changes: [
      'Field canonicalization (timestamp, signalType)',
      'Resource reference extraction (ARN, name, id)',
      'Environment reference extraction (account, region, stage)',
      'Evidence reference pointers (no duplication)',
    ],
  },
} as const;
