"""
LangGraph Integration Example for Tracing (Phase 8.1)

Shows how to integrate tracing into LangGraph agent nodes.

CRITICAL: Tracing failures NEVER fail the agent.
"""

import time
from typing import Dict, Any
from trace_emitter import emit_trace_event, calculate_cost, create_trace_id


async def invoke_agent_with_tracing(
    agent_id: str,
    input_data: Dict[str, Any],
    state: Dict[str, Any],
    bedrock_agent_runtime: Any
) -> Dict[str, Any]:
    """
    Invoke Bedrock Agent with async tracing.
    
    CRITICAL: Tracing failures NEVER fail the agent.
    
    Args:
        agent_id: Agent identifier
        input_data: Input data with query and optional variables
        state: LangGraph state with incidentId and executionId
        bedrock_agent_runtime: Bedrock Agent Runtime client
        
    Returns:
        Agent response
    """
    trace_id = create_trace_id()
    start_time = time.time()
    
    try:
        # Invoke agent
        response = await bedrock_agent_runtime.invoke_agent(
            agentId=agent_id,
            agentAliasId="TSTALIASID",
            sessionId=state["executionId"],
            inputText=input_data["query"]
        )
        
        # Calculate latency
        latency = (time.time() - start_time) * 1000  # milliseconds
        
        # Extract token counts from response
        prompt_tokens = response.get('usage', {}).get('inputTokens', 0)
        response_tokens = response.get('usage', {}).get('outputTokens', 0)
        
        # CRITICAL ORDER:
        # 1. Calculate cost (uses raw tokens, before redaction)
        # 2. Emit trace event (async, non-blocking)
        # 3. Redaction happens in trace processor (before storage)
        
        # Step 1: Calculate cost BEFORE redaction
        cost = calculate_cost(
            prompt_tokens=prompt_tokens,
            response_tokens=response_tokens,
            model=get_agent_model(agent_id)
        )
        
        # Step 2: Emit trace event (async, non-blocking)
        emit_trace_event(
            trace_id=trace_id,
            agent_id=agent_id,
            incident_id=state["incidentId"],
            execution_id=state["executionId"],
            prompt_text=input_data["query"],
            response_text=response["output"],
            prompt_tokens=prompt_tokens,
            response_tokens=response_tokens,
            latency=latency,
            model=get_agent_model(agent_id),
            cost=cost,
            prompt_template=input_data.get("template"),
            prompt_variables=input_data.get("variables", {}),
            finish_reason=response.get('stopReason', 'stop'),
            metadata={
                'retryCount': state.get('retryCount', 0),
                'guardrailsApplied': state.get('guardrailsApplied', []),
                'validationStatus': state.get('validationStatus', 'passed'),
                'captureMethod': 'async'
            }
        )
        
        return response
        
    except Exception as e:
        # Agent failure - still try to trace
        try:
            emit_trace_event(
                trace_id=trace_id,
                agent_id=agent_id,
                incident_id=state["incidentId"],
                execution_id=state["executionId"],
                prompt_text=input_data["query"],
                response_text=f"ERROR: {str(e)}",
                prompt_tokens=0,
                response_tokens=0,
                latency=(time.time() - start_time) * 1000,
                model=get_agent_model(agent_id),
                cost={'inputCost': 0.0, 'outputCost': 0.0, 'total': 0.0},
                finish_reason='error',
                metadata={'error': str(e)}
            )
        except Exception as trace_error:
            # Tracing failed - log but don't propagate
            print(f"Trace emission failed for {trace_id}: {trace_error}")
        
        # Re-raise original exception
        raise e


def get_agent_model(agent_id: str) -> str:
    """
    Get model identifier for agent.
    
    Args:
        agent_id: Agent identifier
        
    Returns:
        Model identifier
    """
    # Map agent IDs to models
    agent_models = {
        'signal-intelligence': 'anthropic.claude-3-sonnet-20240229-v1:0',
        'historical-pattern': 'anthropic.claude-3-sonnet-20240229-v1:0',
        'change-intelligence': 'anthropic.claude-3-sonnet-20240229-v1:0',
        'risk-blast-radius': 'anthropic.claude-3-sonnet-20240229-v1:0',
        'response-strategy': 'anthropic.claude-3-sonnet-20240229-v1:0',
        'knowledge-rag': 'anthropic.claude-3-sonnet-20240229-v1:0',
    }
    return agent_models.get(agent_id, 'anthropic.claude-3-sonnet-20240229-v1:0')


# Example usage in LangGraph node
async def signal_intelligence_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Example LangGraph node with tracing.
    
    Args:
        state: LangGraph state
        
    Returns:
        Updated state
    """
    import boto3
    
    bedrock_agent_runtime = boto3.client('bedrock-agent-runtime')
    
    # Invoke agent with tracing
    response = await invoke_agent_with_tracing(
        agent_id='signal-intelligence',
        input_data={
            'query': state['query'],
            'variables': {
                'incidentId': state['incidentId'],
                'signals': state.get('signals', [])
            }
        },
        state=state,
        bedrock_agent_runtime=bedrock_agent_runtime
    )
    
    # Update state with response
    return {
        **state,
        'signal_analysis': response['output']
    }
