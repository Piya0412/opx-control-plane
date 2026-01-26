/**
 * EventBridge Wiring Construct
 * 
 * Wires the end-to-end incident lifecycle:
 * - Signals → Detection
 * - Detection → (future: Correlation/Candidate)
 * - IncidentCreated → Phase 6 Intelligence
 * 
 * CRITICAL RULES:
 * - No polling, no cron jobs
 * - Deterministic processing only
 * - Fail-closed by default
 * - Read-only intelligence
 */

import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface EventBridgeWiringProps {
  /**
   * EventBridge event bus
   */
  eventBus: events.IEventBus;

  /**
   * Detection engine Lambda function
   */
  detectionLambda: lambda.IFunction;

  /**
   * Phase 6 invocation handler Lambda function
   */
  phase6InvocationLambda: lambda.IFunction;
}

/**
 * EventBridge Wiring Construct
 * 
 * Creates EventBridge rules to wire the incident lifecycle.
 */
export class EventBridgeWiring extends Construct {
  public readonly signalToDetectionRule: events.Rule;
  public readonly incidentToPhase6Rule: events.Rule;

  constructor(scope: Construct, id: string, props: EventBridgeWiringProps) {
    super(scope, id);

    // ========================================================================
    // RULE 1: SignalIngested → Detection Engine
    // ========================================================================

    this.signalToDetectionRule = new events.Rule(this, 'SignalToDetectionRule', {
      eventBus: props.eventBus,
      description: 'Route SignalIngested events to Detection Engine',
      eventPattern: {
        source: ['opx.signal'],
        detailType: ['SignalIngested'],
      },
      targets: [
        new targets.LambdaFunction(props.detectionLambda, {
          retryAttempts: 2, // Retry on failure
          maxEventAge: cdk.Duration.hours(1), // Discard after 1 hour
        }),
      ],
    });

    // Grant detection Lambda permission to be invoked by EventBridge
    props.detectionLambda.grantInvoke(
      new iam.ServicePrincipal('events.amazonaws.com')
    );

    // ========================================================================
    // RULE 2: IncidentCreated → Phase 6 Intelligence
    // ========================================================================

    this.incidentToPhase6Rule = new events.Rule(this, 'IncidentToPhase6Rule', {
      eventBus: props.eventBus,
      description: 'Route IncidentCreated events to Phase 6 Intelligence',
      eventPattern: {
        source: ['opx.incident'],
        detailType: ['IncidentCreated'],
      },
      targets: [
        new targets.LambdaFunction(props.phase6InvocationLambda, {
          retryAttempts: 2, // Retry on failure
          maxEventAge: cdk.Duration.hours(1), // Discard after 1 hour
        }),
      ],
    });

    // Grant Phase 6 invocation Lambda permission to be invoked by EventBridge
    props.phase6InvocationLambda.grantInvoke(
      new iam.ServicePrincipal('events.amazonaws.com')
    );

    // ========================================================================
    // OUTPUTS
    // ========================================================================

    new cdk.CfnOutput(this, 'SignalToDetectionRuleArn', {
      value: this.signalToDetectionRule.ruleArn,
      description: 'EventBridge rule: SignalIngested → Detection',
    });

    new cdk.CfnOutput(this, 'IncidentToPhase6RuleArn', {
      value: this.incidentToPhase6Rule.ruleArn,
      description: 'EventBridge rule: IncidentCreated → Phase 6',
    });
  }
}
