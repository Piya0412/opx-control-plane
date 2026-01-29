"""
Guardrail Violation Handler

Logs guardrail violations to DynamoDB and emits CloudWatch metrics.
Handles both BLOCK and WARN modes with proper confidence defaults.
"""

import boto3
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional

# Import redaction from Phase 8.1
from .redaction import redact_pii

dynamodb = boto3.resource('dynamodb')
cloudwatch = boto3.client('cloudwatch')

# Table name from environment
VIOLATIONS_TABLE_NAME = os.environ.get('GUARDRAIL_VIOLATIONS_TABLE', 'opx-guardrail-violations')
violations_table = dynamodb.Table(VIOLATIONS_TABLE_NAME)


async def handle_guardrail_violation(
    agent_id: str,
    incident_id: str,
    execution_id: str,
    trace_id: str,
    violation: Dict[str, Any],
    input_text: str,
    response: Dict[str, Any],
    model: str = 'unknown'
) -> str:
    """
    Log guardrail violation to DynamoDB and emit CloudWatch metrics.
    
    Args:
        agent_id: Which agent triggered the violation
        incident_id: Incident context
        execution_id: LangGraph execution ID
        trace_id: Link to LLM trace
        violation: Violation details from Bedrock
        input_text: Prompt that triggered violation
        response: Full response from Bedrock
        model: LLM model used
        
    Returns:
        violation_id: UUID of the logged violation
        
    Note:
        - Confidence defaults to 1.0 if not provided by Bedrock
        - PII is redacted before storage
        - CloudWatch metrics do NOT include incidentId dimension
    """
    
    violation_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()
    
    # Redact sensitive content (using Phase 8.1 redaction)
    redacted_input, input_redactions = redact_pii(input_text)
    
    redacted_output = None
    output_redactions = 0
    if 'output' in response and response['output']:
        redacted_output, output_redactions = redact_pii(response['output'])
    
    # Extract violation details with safe defaults
    violation_type = violation.get('type', 'UNKNOWN')
    violation_action = violation.get('action', 'BLOCK')
    violation_category = violation.get('category')
    violation_threshold = violation.get('threshold')
    
    # Confidence defaults to 1.0 if not provided by Bedrock
    confidence = violation.get('confidence', 1.0)
    
    # Determine if request was blocked
    blocked = violation_action == 'BLOCK'
    
    # Store violation in DynamoDB
    try:
        violations_table.put_item(Item={
            'violationId': violation_id,
            'timestamp': timestamp,
            'traceId': trace_id,
            'agentId': agent_id,
            'incidentId': incident_id,  # OK in DynamoDB, NOT in CloudWatch dimensions
            'executionId': execution_id,
            'violation': {
                'type': violation_type,
                'action': violation_action,
                'category': violation_category,
                'threshold': violation_threshold,
                'confidence': confidence,  # Defaults to 1.0 if absent
            },
            'content': {
                'input': redacted_input,
                'output': redacted_output,
                'detectedText': '[REDACTED]',  # Never store actual detected text
                'inputRedactions': input_redactions,
                'outputRedactions': output_redactions,
            },
            'response': {
                'blocked': blocked,
                'message': response.get('message', 'Guardrail violation detected'),
                'retryAllowed': not blocked,
            },
            'metadata': {
                'guardrailId': os.environ.get('GUARDRAIL_ID', 'unknown'),
                'guardrailVersion': os.environ.get('GUARDRAIL_VERSION', '1'),
                'model': model,
            },
        })
    except Exception as e:
        # Log error but don't fail the agent execution
        print(f"ERROR: Failed to store guardrail violation: {e}")
        # Continue to emit metrics even if DynamoDB write fails
    
    # Emit CloudWatch metrics (NO incidentId dimension!)
    try:
        cloudwatch.put_metric_data(
            Namespace='OPX/Guardrails',
            MetricData=[
                {
                    'MetricName': 'ViolationCount',
                    'Value': 1,
                    'Unit': 'Count',
                    'Timestamp': datetime.now(timezone.utc),
                    'Dimensions': [
                        {'Name': 'AgentId', 'Value': agent_id},
                        {'Name': 'ViolationType', 'Value': violation_type},
                        {'Name': 'Action', 'Value': violation_action},
                    ],
                },
                {
                    'MetricName': 'ConfidenceScore',
                    'Value': confidence,
                    'Unit': 'None',
                    'Timestamp': datetime.now(timezone.utc),
                    'Dimensions': [
                        {'Name': 'AgentId', 'Value': agent_id},
                        {'Name': 'ViolationType', 'Value': violation_type},
                    ],
                },
            ]
        )
    except Exception as e:
        # Log error but don't fail the agent execution
        print(f"ERROR: Failed to emit guardrail metrics: {e}")
    
    return violation_id


def handle_guardrail_violation_sync(
    agent_id: str,
    incident_id: str,
    execution_id: str,
    trace_id: str,
    violation: Dict[str, Any],
    input_text: str,
    response: Dict[str, Any],
    model: str = 'unknown'
) -> str:
    """
    Synchronous version of handle_guardrail_violation for non-async contexts.
    """
    import asyncio
    
    # Run async function in sync context
    loop = asyncio.get_event_loop()
    if loop.is_running():
        # If loop is already running, create a new task
        return asyncio.create_task(
            handle_guardrail_violation(
                agent_id, incident_id, execution_id, trace_id,
                violation, input_text, response, model
            )
        )
    else:
        # If no loop is running, run until complete
        return loop.run_until_complete(
            handle_guardrail_violation(
                agent_id, incident_id, execution_id, trace_id,
                violation, input_text, response, model
            )
        )
