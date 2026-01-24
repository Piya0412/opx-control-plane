#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { OpxControlPlaneStack } from './stacks/opx-control-plane-stack.js';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

new OpxControlPlaneStack(app, 'OpxControlPlaneStack', {
  env,
  description: 'opx-control-plane: Enterprise Operational Control Plane (Phase 1)',
  tags: {
    Project: 'opx-control-plane',
    Phase: '1',
    ManagedBy: 'CDK',
  },
});

app.synth();
