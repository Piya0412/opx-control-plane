#!/usr/bin/env node
/**
 * Phase 7 CDK App - Knowledge Base Infrastructure
 * 
 * This app is isolated from Phase 1-6 infrastructure.
 * It deploys only the Bedrock Knowledge Base and OpenSearch Serverless.
 * 
 * CRITICAL RULES:
 * 1. No TypeScript imports from Phase 1-6 code
 * 2. Use CloudFormation exports (Fn.importValue) for shared resources if needed
 * 3. Independent deployment lifecycle
 * 4. Zero risk to existing infrastructure
 */

import * as cdk from 'aws-cdk-lib';
import { Phase7KnowledgeBaseStack } from './stacks/phase7-knowledge-base-stack.js';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

new Phase7KnowledgeBaseStack(app, 'OpxPhase7Stack', {
  env,
  description: 'opx-control-plane: Phase 7 - Bedrock Knowledge Base & OpenSearch Serverless',
  tags: {
    Project: 'opx-control-plane',
    Phase: '7',
    ManagedBy: 'CDK',
    IsolationBoundary: 'phase7-only',
  },
});

app.synth();
