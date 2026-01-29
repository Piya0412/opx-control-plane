"""
Trace Emitter for LLM Traces (Phase 8.1)

Emits trace events to EventBridge for async processing.

CRITICAL: This is non-blocking - failures never fail the agent.
"""

import os
import json
import uuid
import boto3
from datetime import datetime, timezone
from typing import Dict, Any, Optional

# EventBridge client
eventbridge = boto3.client('events')
event_bus_name = os.environ.get('EVENT_BUS_NAME', 'opx-audit-events')


def emit_trace_event(
    trace_id: str,
    agent_id: str,
    incident_id: str,
    execution_id: str,
    prompt_text: str,
    response_text: str,
    prompt_tokens: int,
    response_tokens: int,
    latency: float,
    model: str,
    cost: Dict[str, float],
    prompt_template: Optional[str] = None,
    prompt_variables: Optional[Dict] = None,
    finish_reason: str = "stop",
    metadata: Optional[Dict] = None,
) -> bool:
    """
    Emit trace event to EventBridge.
    
    CRITICAL: This is non-blocking - failures are logged but never propagated.
    
    Args:
        trace_id: Unique trace identifier
        agent_id: Agent identifier (e.g., "signal-intelligence")
        incident_id: Incident context
        execution_id: LangGraph execution ID
        prompt_text: Prompt text (will be redacted in processor)
        response_text: Response text (will be redacted in processor)
        prompt_tokens: Input token count
        response_tokens: Output token count
        latency: Response time in milliseconds
        model: Model identifier
        cost: Cost breakdown (inputCost, outputCost, total)
        prompt_template: Optional template ID
        prompt_variables: Optional template variables
        finish_reason: Completion reason
        metadata: Optional metadata
        
    Returns:
        True if event emitted successfully, False otherwise
    """
    try:
        # Build trace event
        trace_event = {
            'traceId': trace_id,
            'traceVersion': 'v1',  # Schema versioning
            'timestamp': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
            'agentId': agent_id,
            'incidentId': incident_id,  # ✅ OK in event, will be stored in DynamoDB
            'executionId': execution_id,
            'model': model,
            'modelVersion': extract_model_version(model),
            'prompt': {
                'text': prompt_text,  # Will be redacted in processor
                'tokens': prompt_tokens,
                'template': prompt_template or 'unknown',
                'variables': prompt_variables or {}  # Will be sanitized in processor
            },
            'response': {
                'text': response_text,  # Will be redacted in processor
                'tokens': response_tokens,
                'finishReason': finish_reason,
                'latency': latency
            },
            'cost': cost,  # Already computed (before redaction)
            'metadata': metadata or {}
        }
        
        # Emit to EventBridge
        response = eventbridge.put_events(
            Entries=[{
                'Source': 'opx.langgraph',
                'DetailType': 'LLMTraceEvent',
                'Detail': json.dumps(trace_event),
                'EventBusName': event_bus_name
            }]
        )
        
        # Check for failures
        if response.get('FailedEntryCount', 0) > 0:
            print(f"Failed to emit trace event: {response.get('Entries', [])}")
            return False
        
        return True
        
    except Exception as e:
        # Log error but don't propagate (non-blocking)
        print(f"Error emitting trace event: {e}")
        return False


def extract_model_version(model: str) -> str:
    """
    Extract version from model identifier.
    
    Args:
        model: Model identifier (e.g., "anthropic.claude-3-sonnet-20240229-v1:0")
        
    Returns:
        Version string (e.g., "20240229")
    """
    try:
        # Extract date-like version from model string
        parts = model.split('-')
        for part in parts:
            if part.isdigit() and len(part) == 8:  # YYYYMMDD format
                return part
        return 'unknown'
    except Exception:
        return 'unknown'


def calculate_cost(
    prompt_tokens: int,
    response_tokens: int,
    model: str
) -> Dict[str, float]:
    """
    Calculate cost for LLM invocation.
    
    CRITICAL: This must run BEFORE redaction (uses raw token counts).
    
    Args:
        prompt_tokens: Input token count
        response_tokens: Output token count
        model: Model identifier
        
    Returns:
        Cost breakdown dict with inputCost, outputCost, total
    """
    # Pricing per 1M tokens (as of Jan 2026)
    # Source: https://aws.amazon.com/bedrock/pricing/
    pricing = {
        'claude-3-sonnet': {
            'input': 3.00,   # $3 per 1M input tokens
            'output': 15.00  # $15 per 1M output tokens
        },
        'claude-3-haiku': {
            'input': 0.25,   # $0.25 per 1M input tokens
            'output': 1.25   # $1.25 per 1M output tokens
        },
        'claude-3-opus': {
            'input': 15.00,  # $15 per 1M input tokens
            'output': 75.00  # $75 per 1M output tokens
        }
    }
    
    # Determine model family
    model_lower = model.lower()
    if 'opus' in model_lower:
        rates = pricing['claude-3-opus']
    elif 'haiku' in model_lower:
        rates = pricing['claude-3-haiku']
    else:
        rates = pricing['claude-3-sonnet']  # Default to Sonnet
    
    # Calculate costs
    input_cost = (prompt_tokens / 1_000_000) * rates['input']
    output_cost = (response_tokens / 1_000_000) * rates['output']
    total_cost = input_cost + output_cost
    
    return {
        'inputCost': round(input_cost, 6),
        'outputCost': round(output_cost, 6),
        'total': round(total_cost, 6)
    }


def create_trace_id() -> str:
    """
    Create a unique trace ID.
    
    Returns:
        UUID v4 string
    """
    return str(uuid.uuid4())
