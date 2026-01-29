"""
Phase 8.1: Trace Event Emitter (Python)

Emits LLM trace events to EventBridge from LangGraph nodes.

GOVERNANCE RULES (LOCKED):
- Tracing failures NEVER fail agents
- Async, non-blocking
- Best-effort delivery
- No exceptions propagated
"""

import json
import os
from typing import Dict, List, Optional
import boto3
from botocore.exceptions import ClientError

eventbridge = boto3.client('events')
EVENT_BUS_NAME = os.environ.get('EVENT_BUS_NAME', 'opx-control-plane')


def emit_trace_event_async(
    trace_id: str,
    timestamp: str,
    agent_id: str,
    incident_id: str,
    execution_id: str,
    model: str,
    model_version: str,
    prompt_text: str,
    prompt_tokens: int,
    prompt_template: str,
    prompt_variables: Dict[str, str],
    response_text: str,
    response_tokens: int,
    finish_reason: str,
    latency: int,
    input_cost: float,
    output_cost: float,
    total_cost: float,
    retry_count: int,
    guardrails_applied: List[str],
    validation_status: str,
    capture_method: str
) -> None:
    """
    Emit LLM trace event to EventBridge.
    
    CRITICAL: This function NEVER raises exceptions.
    Failures are logged but not propagated.
    
    Args:
        trace_id: Unique trace identifier
        timestamp: ISO 8601 timestamp
        agent_id: Agent identifier
        incident_id: Incident context
        execution_id: Execution identifier
        model: Model identifier
        model_version: Model version
        prompt_text: Prompt text (will be redacted in processor)
        prompt_tokens: Input token count
        prompt_template: Prompt template identifier
        prompt_variables: Template variables (will be sanitized in processor)
        response_text: Response text (will be redacted in processor)
        response_tokens: Output token count
        finish_reason: Completion reason
        latency: Response latency in ms
        input_cost: Input cost in USD
        output_cost: Output cost in USD
        total_cost: Total cost in USD
        retry_count: Number of retries
        guardrails_applied: List of guardrails that fired
        validation_status: Validation status
        capture_method: Capture method (sync/async)
    """
    try:
        trace_event = {
            "traceId": trace_id,
            "timestamp": timestamp,
            "agentId": agent_id,
            "incidentId": incident_id,
            "executionId": execution_id,
            "model": model,
            "modelVersion": model_version,
            "prompt": {
                "text": prompt_text,
                "tokens": prompt_tokens,
                "template": prompt_template,
                "variables": prompt_variables
            },
            "response": {
                "text": response_text,
                "tokens": response_tokens,
                "finishReason": finish_reason,
                "latency": latency
            },
            "cost": {
                "inputCost": input_cost,
                "outputCost": output_cost,
                "total": total_cost
            },
            "metadata": {
                "retryCount": retry_count,
                "guardrailsApplied": guardrails_applied,
                "validationStatus": validation_status,
                "captureMethod": capture_method
            }
        }
        
        eventbridge.put_events(
            Entries=[
                {
                    'Source': 'opx.langgraph',
                    'DetailType': 'LLMTraceEvent',
                    'Detail': json.dumps(trace_event),
                    'EventBusName': EVENT_BUS_NAME
                }
            ]
        )
        
    except Exception as e:
        # CRITICAL: Tracing failures are logged but NOT propagated
        print(f"WARNING: Failed to emit trace event {trace_id}: {e}")
        # Do NOT raise - tracing failures must not break agents
