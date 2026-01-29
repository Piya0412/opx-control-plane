"""
Phase 8.2: Guardrail Integration for LangGraph Agents

Integrates Bedrock Guardrails with agent invocations.
Handles BOTH exception-based and response-based guardrail blocks.
"""

import os
import boto3
from typing import Dict, Any
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from tracing.guardrail_handler import handle_guardrail_violation_sync

# AWS clients
bedrock_agent_runtime = boto3.client('bedrock-agent-runtime')


def invoke_agent_with_guardrails(
    agent_id: str,
    input_data: Dict[str, Any],
    state: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Invoke Bedrock Agent with guardrails attached.
    
    Handles BOTH exception-based and response-based guardrail blocks:
    1. Exception: GuardrailInterventionException (some violations)
    2. Response: {"guardrailAction": "BLOCKED"} (other violations)
    
    Args:
        agent_id: Bedrock Agent ID
        input_data: Input containing query
        state: LangGraph state with incidentId and executionId
        
    Returns:
        Agent response or graceful degradation if blocked
    """
    
    guardrail_id = os.environ.get('GUARDRAIL_ID')
    if not guardrail_id:
        print("WARNING: GUARDRAIL_ID not set - proceeding without guardrails")
        # Proceed without guardrails if not configured
        return _invoke_agent_without_guardrails(agent_id, input_data, state)
    
    try:
        # Invoke agent with guardrail attached
        response = bedrock_agent_runtime.invoke_agent(
            agentId=agent_id,
            agentAliasId=os.environ.get('AGENT_ALIAS_ID', 'TSTALIASID'),
            sessionId=state.get("executionId", "unknown"),
            inputText=input_data.get("query", ""),
            guardrailIdentifier=guardrail_id,
            guardrailVersion='1'
        )
        
        # Check for response-based guardrail blocks
        if response.get('guardrailAction') == 'BLOCKED':
            handle_guardrail_violation_sync(
                agent_id=agent_id,
                incident_id=state.get("incidentId", "unknown"),
                execution_id=state.get("executionId", "unknown"),
                trace_id=response.get('traceId', 'unknown'),
                violation={
                    'type': response.get('violationType', 'UNKNOWN'),
                    'action': 'BLOCK',
                    'category': response.get('category'),
                    'confidence': response.get('confidence', 1.0)  # Default to 1.0 if absent
                },
                input_text=input_data.get("query", ""),
                response=response,
                model=response.get('model', 'unknown')
            )
            
            # Return graceful degradation
            return {
                "output": "Unable to process request due to safety guardrails.",
                "blocked": True,
                "guardrailAction": "BLOCKED"
            }
        
        # Check for non-blocking violations (WARN mode)
        if 'guardrailAction' in response and response['guardrailAction'] != 'BLOCKED':
            handle_guardrail_violation_sync(
                agent_id=agent_id,
                incident_id=state.get("incidentId", "unknown"),
                execution_id=state.get("executionId", "unknown"),
                trace_id=response.get('traceId', 'unknown'),
                violation={
                    'type': response.get('violationType', 'UNKNOWN'),
                    'action': 'WARN',  # Interpret as WARN for logging
                    'category': response.get('category'),
                    'confidence': response.get('confidence', 1.0)  # Default to 1.0 if absent
                },
                input_text=input_data.get("query", ""),
                response=response,
                model=response.get('model', 'unknown')
            )
        
        return response
        
    except bedrock_agent_runtime.exceptions.GuardrailInterventionException as e:
        # Exception-based guardrail block
        handle_guardrail_violation_sync(
            agent_id=agent_id,
            incident_id=state.get("incidentId", "unknown"),
            execution_id=state.get("executionId", "unknown"),
            trace_id='unknown',
            violation={
                'type': getattr(e, 'violationType', 'UNKNOWN'),
                'action': 'BLOCK',
                'category': getattr(e, 'category', None),
                'confidence': getattr(e, 'confidence', 1.0)  # Default to 1.0 if absent
            },
            input_text=input_data.get("query", ""),
            response={'error': str(e)},
            model='unknown'
        )
        
        # Return graceful degradation
        return {
            "output": "Unable to process request due to safety guardrails.",
            "blocked": True,
            "guardrailAction": "BLOCKED",
            "error": str(e)
        }
    
    except Exception as e:
        # Other errors - log but don't treat as guardrail violation
        print(f"ERROR: Agent invocation failed: {e}")
        return {
            "output": "Agent invocation failed due to an error.",
            "blocked": False,
            "error": str(e)
        }


def _invoke_agent_without_guardrails(
    agent_id: str,
    input_data: Dict[str, Any],
    state: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Invoke agent without guardrails (fallback when GUARDRAIL_ID not set).
    
    Args:
        agent_id: Bedrock Agent ID
        input_data: Input containing query
        state: LangGraph state
        
    Returns:
        Agent response
    """
    try:
        response = bedrock_agent_runtime.invoke_agent(
            agentId=agent_id,
            agentAliasId=os.environ.get('AGENT_ALIAS_ID', 'TSTALIASID'),
            sessionId=state.get("executionId", "unknown"),
            inputText=input_data.get("query", "")
        )
        return response
    except Exception as e:
        print(f"ERROR: Agent invocation failed: {e}")
        return {
            "output": "Agent invocation failed due to an error.",
            "blocked": False,
            "error": str(e)
        }
