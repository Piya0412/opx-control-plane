#!/usr/bin/env node
/**
 * Phase 6 CDK App - Isolated from Phase 1-5
 * 
 * This app is completely isolated from legacy Phase 1-5 infrastructure.
 * It deploys only Bedrock Agents and LangGraph orchestration.
 * 
 * CRITICAL RULES:
 * 1. No TypeScript imports from Phase 1-5 code
 * 2. Use CloudFormation exports (Fn.importValue) for shared resources
 * 3. Independent deployment lifecycle
 * 4. Zero risk to audited Phase 1-5 infrastructure
 */

import * as cdk from 'aws-cdk-lib';
import { Phase6BedrockStack } from './stacks/phase6-bedrock-stack.js';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

new Phase6BedrockStack(app, 'OpxPhase6Stack', {
  env,
  description: 'opx-control-plane: Phase 6 - Bedrock Agents & LangGraph Orchestration',
  tags: {
    Project: 'opx-control-plane',
    Phase: '6',
    ManagedBy: 'CDK',
    IsolationBoundary: 'phase6-only',
  },
});

app.synth();
