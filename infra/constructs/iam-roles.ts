import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * IAM Roles for opx-control-plane
 * 
 * Least-privilege roles for different operational personas.
 * NO API KEYS. NO STATIC TOKENS. IAM ONLY.
 * 
 * CRITICAL: Use explicit ARN patterns for execute-api.
 * Do NOT rely on arnForExecuteApi() for IAM auth - it generates
 * patterns that don't match actual API Gateway resource paths.
 */
export class OpxIamRoles extends Construct {
  public readonly incidentCreatorRole: iam.Role;
  public readonly incidentReaderRole: iam.Role;
  public readonly incidentOperatorRole: iam.Role;
  public readonly incidentApproverRole: iam.Role;

  constructor(scope: Construct, id: string, props: {
    apiId: string;
    stageName: string;
  }) {
    super(scope, id);

    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;
    
    // Explicit ARN pattern: arn:aws:execute-api:REGION:ACCOUNT:API_ID/STAGE/METHOD/RESOURCE
    // Using wildcard for Phase 1, can tighten per-method later
    const apiArnBase = `arn:aws:execute-api:${region}:${account}:${props.apiId}/${props.stageName}`;

    // Role: Incident Creator
    // Can create incidents only
    this.incidentCreatorRole = new iam.Role(this, 'IncidentCreatorRole', {
      roleName: 'OpxIncidentCreator',
      assumedBy: new iam.AccountPrincipal(account),
      description: 'Can create incidents in opx-control-plane',
    });

    this.incidentCreatorRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['execute-api:Invoke'],
      resources: [
        `${apiArnBase}/POST/incidents`,
        `${apiArnBase}/GET/incidents`,
        `${apiArnBase}/GET/incidents/*`,
      ],
    }));

    // Role: Incident Reader
    // Can view incidents only (read-only)
    this.incidentReaderRole = new iam.Role(this, 'IncidentReaderRole', {
      roleName: 'OpxIncidentReader',
      assumedBy: new iam.AccountPrincipal(account),
      description: 'Can view incidents in opx-control-plane (read-only)',
    });

    this.incidentReaderRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['execute-api:Invoke'],
      resources: [
        `${apiArnBase}/GET/incidents`,
        `${apiArnBase}/GET/incidents/*`,
      ],
    }));

    // Role: Incident Operator
    // Can create incidents and request transitions
    this.incidentOperatorRole = new iam.Role(this, 'IncidentOperatorRole', {
      roleName: 'OpxIncidentOperator',
      assumedBy: new iam.AccountPrincipal(account),
      description: 'Can create incidents and request transitions',
    });

    this.incidentOperatorRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['execute-api:Invoke'],
      resources: [
        `${apiArnBase}/POST/incidents`,
        `${apiArnBase}/GET/incidents`,
        `${apiArnBase}/GET/incidents/*`,
        `${apiArnBase}/POST/incidents/*/transitions`,
      ],
    }));

    // Role: Incident Approver
    // Can approve/reject actions (highest privilege)
    this.incidentApproverRole = new iam.Role(this, 'IncidentApproverRole', {
      roleName: 'OpxIncidentApprover',
      assumedBy: new iam.AccountPrincipal(account),
      description: 'Can approve/reject incident actions',
    });

    this.incidentApproverRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['execute-api:Invoke'],
      resources: [
        `${apiArnBase}/GET/incidents`,
        `${apiArnBase}/GET/incidents/*`,
        `${apiArnBase}/POST/incidents/*/approvals`,
      ],
    }));

    // Outputs
    new cdk.CfnOutput(this, 'IncidentCreatorRoleArn', {
      value: this.incidentCreatorRole.roleArn,
      description: 'ARN of OpxIncidentCreator role',
    });

    new cdk.CfnOutput(this, 'IncidentReaderRoleArn', {
      value: this.incidentReaderRole.roleArn,
      description: 'ARN of OpxIncidentReader role',
    });

    new cdk.CfnOutput(this, 'IncidentOperatorRoleArn', {
      value: this.incidentOperatorRole.roleArn,
      description: 'ARN of OpxIncidentOperator role',
    });

    new cdk.CfnOutput(this, 'IncidentApproverRoleArn', {
      value: this.incidentApproverRole.roleArn,
      description: 'ARN of OpxIncidentApprover role',
    });
  }
}
