import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface BudgetAlertLambdaProps {
  readonly enabled?: boolean; // ✅ Correction 4: Optional, default false
  readonly functionName?: string;
}

/**
 * Budget Alert Lambda (Optional)
 * Phase 8.4: Observability only - no enforcement
 * ✅ Correction 4: Disabled by default
 */
export class BudgetAlertLambda extends Construct {
  public readonly function?: lambda.Function;

  constructor(scope: Construct, id: string, props?: BudgetAlertLambdaProps) {
    super(scope, id);

    // ✅ Correction 4: Only create if explicitly enabled
    if (props?.enabled !== true) {
      new cdk.CfnOutput(this, 'BudgetLambdaStatus', {
        value: 'DISABLED',
        description: 'Budget Alert Lambda is disabled (default)',
      });
      return;
    }

    // Create Lambda function
    this.function = new lambda.Function(this, 'Function', {
      functionName: props?.functionName || 'opx-budget-alert',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import json
import boto3
import os
from datetime import datetime

cloudwatch = boto3.client('cloudwatch')

def handler(event, context):
    """
    Budget alert handler (observability only)
    Logs budget status, does NOT enforce
    """
    print(json.dumps({
        'level': 'INFO',
        'message': 'Budget alert triggered',
        'event': event,
        'timestamp': datetime.utcnow().isoformat()
    }))
    
    # Get current cost metrics
    try:
        response = cloudwatch.get_metric_statistics(
            Namespace='OPX/Analytics',
            MetricName='TotalCost',
            Dimensions=[],
            StartTime=datetime.utcnow().replace(day=1, hour=0, minute=0, second=0),
            EndTime=datetime.utcnow(),
            Period=86400,  # 1 day
            Statistics=['Sum']
        )
        
        total_cost = sum(point['Sum'] for point in response['Datapoints'])
        
        print(json.dumps({
            'level': 'INFO',
            'message': 'Current month cost',
            'total_cost': total_cost,
            'timestamp': datetime.utcnow().isoformat()
        }))
        
    except Exception as e:
        print(json.dumps({
            'level': 'ERROR',
            'message': 'Failed to get cost metrics',
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }))
    
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Budget alert logged'})
    }
      `),
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      environment: {
        LOG_LEVEL: 'INFO',
      },
    });

    // Grant CloudWatch read permissions
    this.function.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cloudwatch:GetMetricStatistics',
        'cloudwatch:ListMetrics',
      ],
      resources: ['*'],
    }));

    // Outputs
    new cdk.CfnOutput(this, 'BudgetLambdaStatus', {
      value: 'ENABLED',
      description: 'Budget Alert Lambda is enabled',
    });

    new cdk.CfnOutput(this, 'BudgetLambdaArn', {
      value: this.function.functionArn,
      description: 'Budget Alert Lambda ARN',
    });

    // Tags
    cdk.Tags.of(this).add('Phase', '8.4');
    cdk.Tags.of(this).add('Component', 'TokenAnalytics');
  }
}
