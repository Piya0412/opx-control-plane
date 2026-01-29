import * as cdk from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { Construct } from 'constructs';

export class BedrockGuardrails extends Construct {
  public readonly guardrailId: string;
  public readonly guardrailArn: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const guardrail = new bedrock.CfnGuardrail(this, 'AgentGuardrail', {
      name: 'opx-agent-guardrail',
      description: 'Safety guardrails for OPX Bedrock Agents - prevents PII leaks and inappropriate content',
      
      // PII Detection (BLOCK mode)
      sensitiveInformationPolicyConfig: {
        piiEntitiesConfig: [
          { type: 'EMAIL', action: 'BLOCK' },
          { type: 'PHONE', action: 'BLOCK' },
          { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK' },
          { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
          { type: 'AWS_ACCESS_KEY', action: 'BLOCK' },
          { type: 'AWS_SECRET_KEY', action: 'BLOCK' },
          { type: 'DRIVER_ID', action: 'BLOCK' },
          { type: 'US_PASSPORT_NUMBER', action: 'BLOCK' },
        ],
      },
      
      // Content Filters (WARN mode - configured as ANONYMIZE to allow with logging)
      contentPolicyConfig: {
        filtersConfig: [
          { 
            type: 'HATE', 
            inputStrength: 'MEDIUM', 
            outputStrength: 'MEDIUM' 
          },
          { 
            type: 'VIOLENCE', 
            inputStrength: 'MEDIUM', 
            outputStrength: 'MEDIUM' 
          },
          { 
            type: 'SEXUAL', 
            inputStrength: 'HIGH', 
            outputStrength: 'HIGH' 
          },
          { 
            type: 'MISCONDUCT', 
            inputStrength: 'LOW', 
            outputStrength: 'LOW' 
          },
        ],
      },
      
      // Topic Denial (BLOCK mode with conceptual definitions)
      topicPolicyConfig: {
        topicsConfig: [
          {
            name: 'SYSTEM_COMMAND_EXECUTION',
            definition: 'Conceptual domain covering system operations, shell execution, and infrastructure commands',
            type: 'DENY',
          },
          {
            name: 'CREDENTIAL_HANDLING',
            definition: 'Conceptual domain covering credential access, API key requests, and authentication material',
            type: 'DENY',
          },
          {
            name: 'DESTRUCTIVE_ACTIONS',
            definition: 'Conceptual domain covering data deletion, resource termination, and irreversible operations',
            type: 'DENY',
          },
        ],
      },
      
      // Word Filters (WARN mode)
      wordPolicyConfig: {
        managedWordListsConfig: [
          { type: 'PROFANITY' },
        ],
      },
      
      blockedInputMessaging: 'This request was blocked due to safety guardrails. Please rephrase and try again.',
      blockedOutputsMessaging: 'This response was blocked due to safety guardrails.',
    });

    this.guardrailId = guardrail.attrGuardrailId;
    this.guardrailArn = guardrail.attrGuardrailArn;

    // Output for reference
    new cdk.CfnOutput(this, 'GuardrailId', {
      value: this.guardrailId,
      description: 'Bedrock Guardrail ID',
    });

    new cdk.CfnOutput(this, 'GuardrailArn', {
      value: this.guardrailArn,
      description: 'Bedrock Guardrail ARN',
    });
  }
}
