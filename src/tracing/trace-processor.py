"""
Trace Processor Lambda (Phase 8.1)

Processes LLM trace events from EventBridge and stores them in DynamoDB.

CRITICAL ARCHITECTURE:
- Uses native EventBridge format (event['detail']), NOT SQS format
- Non-blocking: failures never propagate to agents
- Best-effort delivery: log errors but return success

REDACTION ORDER:
1. Cost already computed (in agent node, before emission)
2. Redact PII NOW (before storage)
3. Store redacted trace
"""

import os
import json
import boto3
from datetime import datetime, timedelta
from typing import Dict, Any

# Import redaction logic
from redaction import redact_pii, sanitize_variables

# DynamoDB client
dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('TRACES_TABLE_NAME', 'opx-llm-traces')
traces_table = dynamodb.Table(table_name)


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Process trace events from EventBridge.
    
    CRITICAL: Uses native EventBridge format (event['detail']), NOT SQS format.
    
    Args:
        event: EventBridge event
        context: Lambda context
        
    Returns:
        Response dict with statusCode
    """
    try:
        # EventBridge delivers events as event['detail'] (NOT event['Records'])
        trace_data = event['detail']
        
        # CRITICAL REDACTION ORDER:
        # 1. Cost already computed (in agent node, before emission)
        # 2. Redact PII NOW (before storage)
        # 3. Store redacted trace
        
        # Step 2: Redact PII from prompt and response
        prompt_text = trace_data.get('prompt', {}).get('text', '')
        response_text = trace_data.get('response', {}).get('text', '')
        
        redacted_prompt, prompt_redacted = redact_pii(prompt_text)
        redacted_response, response_redacted = redact_pii(response_text)
        
        # Sanitize prompt variables (stringify, redact, truncate)
        original_variables = trace_data.get('prompt', {}).get('variables', {})
        sanitized_variables = sanitize_variables(original_variables)
        
        # Calculate TTL (90 days from now)
        ttl = int((datetime.now() + timedelta(days=90)).timestamp())
        
        # Step 3: Store trace (with redacted content)
        item = {
            'traceId': trace_data['traceId'],
            'traceVersion': trace_data.get('traceVersion', 'v1'),  # Schema versioning
            'timestamp': trace_data['timestamp'],
            'agentId': trace_data['agentId'],
            'incidentId': trace_data['incidentId'],  # ✅ OK in DynamoDB
            'executionId': trace_data['executionId'],
            'model': trace_data.get('model', 'unknown'),
            'modelVersion': trace_data.get('modelVersion', 'unknown'),
            'prompt': {
                'text': redacted_prompt,
                'tokens': trace_data.get('prompt', {}).get('tokens', 0),
                'template': trace_data.get('prompt', {}).get('template', 'unknown'),
                'variables': sanitized_variables  # Dict[str, str] - safe format
            },
            'response': {
                'text': redacted_response,
                'tokens': trace_data.get('response', {}).get('tokens', 0),
                'finishReason': trace_data.get('response', {}).get('finishReason', 'unknown'),
                'latency': trace_data.get('response', {}).get('latency', 0)
            },
            'cost': trace_data.get('cost', {
                'inputCost': 0.0,
                'outputCost': 0.0,
                'total': 0.0
            }),
            'metadata': {
                **trace_data.get('metadata', {}),
                'redactionApplied': prompt_redacted or response_redacted
            },
            'ttl': ttl
        }
        
        # Store in DynamoDB (non-authoritative, TTL-based)
        traces_table.put_item(Item=item)
        
        print(f"Trace stored successfully: {trace_data['traceId']}")
        
        return {
            'statusCode': 200,
            'traceId': trace_data['traceId'],
            'redactionApplied': prompt_redacted or response_redacted
        }
        
    except KeyError as e:
        # Missing required field
        print(f"Missing required field in trace event: {e}")
        print(f"Event: {json.dumps(event)}")
        # Return success (non-blocking)
        return {
            'statusCode': 200,
            'error': f'Missing field: {str(e)}'
        }
        
    except Exception as e:
        # Log error but return success (non-blocking, best-effort)
        print(f"Failed to process trace: {e}")
        print(f"Event: {json.dumps(event)}")
        # Return success to prevent retry storms
        return {
            'statusCode': 200,
            'error': str(e)
        }


def query_traces_by_agent(agent_id: str, limit: int = 100) -> list:
    """
    Query traces by agent ID.
    
    Args:
        agent_id: Agent identifier
        limit: Maximum number of traces to return
        
    Returns:
        List of trace items
    """
    response = traces_table.query(
        IndexName='agentId-timestamp-index',
        KeyConditionExpression='agentId = :aid',
        ExpressionAttributeValues={':aid': agent_id},
        Limit=limit,
        ScanIndexForward=False  # Most recent first
    )
    return response.get('Items', [])


def query_traces_by_execution(execution_id: str) -> list:
    """
    Query traces by execution ID.
    
    Args:
        execution_id: LangGraph execution identifier
        
    Returns:
        List of trace items
    """
    response = traces_table.query(
        IndexName='executionId-timestamp-index',
        KeyConditionExpression='executionId = :eid',
        ExpressionAttributeValues={':eid': execution_id},
        ScanIndexForward=True  # Chronological order
    )
    return response.get('Items', [])
