#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

// ============================================================================
// STACK ARCHITECTURE (LOCKED)
// ============================================================================
//
// OpxControlPlaneStack is DEPRECATED and must NOT be deployed.
//
// CloudFormation ownership is permanent unless intentionally migrated.
// Resources were deployed in phase-specific stacks first, establishing ownership.
//
// Current Architecture:
// ┌─────────────────────────────────────────────────────────────────┐
// │ Layer              │ Stack              │ Status    │ Owner     │
// ├─────────────────────────────────────────────────────────────────┤
// │ Runtime Plane      │ OpxPhase6Stack     │ ✅ ACTIVE │ DEPLOYED  │
// │ Knowledge Plane    │ OpxPhase7Stack     │ ✅ ACTIVE │ DEPLOYED  │
// │ Control Plane      │ OpxControlPlane... │ ❌ DEAD   │ NEVER     │
// └─────────────────────────────────────────────────────────────────┘
//
// OpxControlPlaneStack Purpose:
// - Architecture reference only
// - Design documentation
// - Never deploy (resources already exist in Phase 6/7)
//
// To deploy:
//   cd infra/phase6 && cdk deploy OpxPhase6Stack
//   cd infra/phase7 && cdk deploy OpxPhase7Stack
//
// ============================================================================

// OpxControlPlaneStack intentionally NOT instantiated
// All resources managed by phase-specific stacks

app.synth();
