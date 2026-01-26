#!/usr/bin/env python3
"""
Phase 6 Week 5: Lambda Execution Handler

EventBridge → LangGraph execution entrypoint.

CRITICAL RULES:
1. NEVER raise unhandled exceptions
2. Always return structured response
3. Emit CloudWatch metrics
4. Use DynamoDB checkpointing
5. Generate idempotent execution_id

Handler Contract:
    Input: EventBridge event with incident data
    Output: Execution result with recommendation
"""

import json
import os
import sys
import traceback
from datetime import datetime
from typing import Any, Dict

import boto3

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from src.langgraph.graph import entry_node, graph
from src.langgraph.state import GraphState


# ============================================================================
# CLOUDWATCH METRICS CLIENT
# ============================================================================

cloudwatch = boto3.client('cloudwatch', region_name=os.environ.get('AWS_DEFAULT_REGION', 'us-east-1'))


def emit_metric(
    metric_name: str,
    value: float,
    unit: str = 'None',
    dimensions: Dict[str, str] = None,
) -> None:
    """
    Emit CloudWatch metric.
    
    Args:
        metric_name: Metric name (e.g., 'Execution.Count')
        value: Metric value
        unit: CloudWatch unit (None, Count, Milliseconds, etc.)
        dimensions: Metric dimensions
    """
    try:
        metric_data = {
            'MetricName': metric_name,
            'Value': value,
            'Unit': unit,
            'Timestamp': datetime.utcnow(),
        }
        
        if dimensions:
            metric_data['Dimensions'] = [
                {'Name': k, 'Value': v}
                for k, v in dimensions.items()
            ]
        
        cloudwatch.put_metric_data(
            Namespace='Phase6',
            MetricData=[metric_data],
        )
    except Exception as e:
        print(f"[WARN] Failed to emit metric {metric_name}: {e}")


# ============================================================================
# INPUT VALIDATION
# ============================================================================

def validate_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate EventBridge event schema.
    
    Args:
        event: EventBridge event
    
    Returns:
        Validated event payload
    
    Raises:
        ValueError: If validation fails
    """
    # Extract detail from EventBridge event
    detail = event.get('detail', {})
    
    # Required fields
    if not detail.get('incident_id'):
        raise ValueError("incident_id is required in event.detail")
    
    if not detail.get('evidence_bundle'):
        raise ValueError("evidence_bundle is required in event.detail")
    
    # Optional fields with defaults
    if 'budget_remaining' not in detail:
        detail['budget_remaining'] = 5.0  # Default $5 budget
    
    if 'session_id' not in detail:
        # Generate session_id from incident_id + timestamp
        detail['session_id'] = f"{detail['incident_id']}-{datetime.utcnow().timestamp()}"
    
    if 'execution_id' not in detail:
        # Generate execution_id (idempotent)
        detail['execution_id'] = f"exec-{detail['incident_id']}-{datetime.utcnow().timestamp()}"
    
    if 'timestamp' not in detail:
        detail['timestamp'] = datetime.utcnow().isoformat()
    
    return detail


# ============================================================================
# LAMBDA HANDLER
# ============================================================================

def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler for LangGraph execution.
    
    This is the single execution authority for Phase 6 intelligence.
    
    Args:
        event: EventBridge event with incident data
        context: Lambda context
    
    Returns:
        Structured response with recommendation
    
    NEVER raises unhandled exceptions.
    """
    start_time = datetime.utcnow()
    incident_id = None
    execution_id = None
    
    try:
        print(f"[INFO] Lambda invoked at {start_time.isoformat()}")
        print(f"[INFO] Event: {json.dumps(event, default=str)}")
        
        # ====================================================================
        # STEP 1: VALIDATE INPUT
        # ====================================================================
        
        try:
            validated_input = validate_event(event)
            incident_id = validated_input['incident_id']
            execution_id = validated_input['execution_id']
            
            print(f"[INFO] Validated input for incident: {incident_id}")
            print(f"[INFO] Execution ID: {execution_id}")
        
        except ValueError as e:
            print(f"[ERROR] Input validation failed: {e}")
            emit_metric('Execution.ValidationFailure', 1, 'Count')
            
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'INPUT_VALIDATION_FAILED',
                    'message': str(e),
                    'timestamp': datetime.utcnow().isoformat(),
                }),
            }
        
        # ====================================================================
        # STEP 2: CREATE INITIAL STATE
        # ====================================================================
        
        try:
            print(f"[INFO] Creating initial GraphState...")
            initial_state = entry_node(validated_input)
            print(f"[INFO] Initial state created successfully")
        
        except Exception as e:
            print(f"[ERROR] Failed to create initial state: {e}")
            traceback.print_exc()
            emit_metric('Execution.StateCreationFailure', 1, 'Count')
            
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'error': 'STATE_CREATION_FAILED',
                    'message': str(e),
                    'incident_id': incident_id,
                    'timestamp': datetime.utcnow().isoformat(),
                }),
            }
        
        # ====================================================================
        # STEP 3: INVOKE LANGGRAPH
        # ====================================================================
        
        try:
            print(f"[INFO] Invoking LangGraph with DynamoDB checkpointing...")
            
            # Set environment variable for DynamoDB checkpointing
            os.environ['USE_DYNAMODB_CHECKPOINTING'] = 'true'
            os.environ['LANGGRAPH_CHECKPOINT_TABLE'] = 'opx-langgraph-checkpoints-dev'
            
            # Invoke graph with checkpointing
            result = graph.invoke(
                initial_state,
                config={
                    'configurable': {
                        'thread_id': validated_input['session_id'],
                    },
                },
            )
            
            print(f"[INFO] LangGraph execution completed successfully")
        
        except Exception as e:
            print(f"[ERROR] LangGraph execution failed: {e}")
            traceback.print_exc()
            emit_metric('Execution.GraphFailure', 1, 'Count')
            
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'error': 'GRAPH_EXECUTION_FAILED',
                    'message': str(e),
                    'incident_id': incident_id,
                    'execution_id': execution_id,
                    'timestamp': datetime.utcnow().isoformat(),
                }),
            }
        
        # ====================================================================
        # STEP 4: EMIT METRICS
        # ====================================================================
        
        end_time = datetime.utcnow()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)
        
        emit_metric('Execution.Count', 1, 'Count')
        emit_metric('Execution.DurationMs', duration_ms, 'Milliseconds')
        
        if 'cost' in result:
            total_cost = result['cost'].get('total', 0.0)
            emit_metric('Cost.TotalUSD', total_cost, 'None')
        
        if 'execution_summary' in result:
            summary = result['execution_summary']
            agents_succeeded = summary.get('agents_succeeded', 0)
            agents_failed = summary.get('agents_failed', 0)
            
            emit_metric('Agent.SuccessCount', agents_succeeded, 'Count')
            emit_metric('Agent.FailureCount', agents_failed, 'Count')
            
            if agents_succeeded + agents_failed > 0:
                failure_rate = agents_failed / (agents_succeeded + agents_failed) * 100
                emit_metric('Agent.FailureRate', failure_rate, 'Percent')
        
        # ====================================================================
        # STEP 5: RETURN RESPONSE
        # ====================================================================
        
        print(f"[INFO] Execution completed in {duration_ms}ms")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'incident_id': result.get('incident_id'),
                'execution_id': execution_id,
                'recommendation': result.get('recommendation'),
                'cost': result.get('cost'),
                'execution_summary': result.get('execution_summary'),
                'timestamp': end_time.isoformat(),
            }, default=str),
        }
    
    except Exception as e:
        # ====================================================================
        # CATCH-ALL ERROR HANDLER (SHOULD NEVER REACH HERE)
        # ====================================================================
        
        print(f"[CRITICAL] Unhandled exception in Lambda handler: {e}")
        traceback.print_exc()
        
        emit_metric('Execution.UnhandledException', 1, 'Count')
        
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'UNHANDLED_EXCEPTION',
                'message': str(e),
                'incident_id': incident_id,
                'execution_id': execution_id,
                'timestamp': datetime.utcnow().isoformat(),
            }),
        }


# ============================================================================
# LOCAL TESTING
# ============================================================================

if __name__ == '__main__':
    """
    Local testing entrypoint.
    
    Usage:
        python3 src/langgraph/lambda_handler.py
    """
    # Sample EventBridge event
    test_event = {
        'detail': {
            'incident_id': 'INC-TEST-LAMBDA-001',
            'evidence_bundle': {
                'signals': [
                    {
                        'type': 'metric',
                        'name': 'CPUUtilization',
                        'value': 95.5,
                        'timestamp': datetime.utcnow().isoformat(),
                    }
                ],
                'context': {
                    'service': 'api-gateway',
                    'environment': 'production',
                },
            },
            'budget_remaining': 5.0,
        },
    }
    
    # Mock Lambda context
    class MockContext:
        function_name = 'Phase6ExecutorLambda'
        memory_limit_in_mb = 512
        invoked_function_arn = 'arn:aws:lambda:us-east-1:123456789012:function:Phase6ExecutorLambda'
        aws_request_id = 'test-request-id'
    
    # Invoke handler
    response = handler(test_event, MockContext())
    
    print("\n" + "=" * 80)
    print("LAMBDA RESPONSE")
    print("=" * 80)
    print(json.dumps(response, indent=2, default=str))
