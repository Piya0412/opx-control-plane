"""
LangGraph Integration Example for Tracing (Phase 8.1)

This shows how to integrate tracing into LangGraph agent nodes.

CRITICAL: Tracing failures NEVER fail the agent.
"""

import time
from typing import Dict, Any
from trace_emitter import (
    emit_trace_event,
    emit_error_trace,
    create_trace_id,
    calculate_cost
)


async def invoke_agent_with_tracing(
    agent_id: str,
    input_data: Dict[str, Any],
    state: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Invoke Bedrock Agent with async tracing.
    
    CRITICAL: Tracing failures NEVER fail the agent.
    
    Args:
        agent_id: Agent identifier (e.g., "signal-intelligence")
        input_data: Input data with query and variables
        state: LangGraph state with incidentId and executionId
        
    Returns:
        Agent response
    """
    trace_id = create_trace_id()
    start_time = time.time()
    
    try:
        # Simulate Bedrock Agent invocation
        # In real implementation, this would be:
        # response = await bedrock_agent_runtime.invoke_agent(...)
        
        # Mock response for example
        response = {
            'output': 'Agent response text',
            'inputTokens': 500,
            'outputTokens': 300,
            'model': 'anthropic.claude-3-sonnet-20240229-v1:0',
            'finishReason': 'stop'
        }
        
        # Calculate latency
        latency = (time.time() - start_time) * 1000  # milliseconds
        
        # CRITICAL ORDER:
        # 1. Calculate cost (uses raw tokens)
        # 2. Emit trace event (async, non-blocking)
        # 3. Redaction happens in trace processor (before storage)
        
        # Step 1: Calculate cost BEFORE redaction
        cost = calculate_cost(
            input_tokens=response['inputTokens'],
            output_tokens=response['outputTokens'],
            model=response['model']
        )
        
        # Step 2: Emit trace event (async, non-blocking)
        emit_success = emit_trace_event(
            trace_id=trace_id,
            trace_version="v1",  # Schema versioning
            agent_id=agent_id,
            incident_id=state['incidentId'],
            execution_id=state['executionId'],
            model=response['model'],
            prompt_text=input_data['query'],
            prompt_tokens=response['inputTokens'],
            prompt_template=input_data.get('template'),
            prompt_variables=input_data.get('variables', {}),
            response_text=response['output'],
            response_tokens=response['outputTokens'],
            finish_reason=response['finishReason'],
            latency=latency,
            cost=cost,
            metadata={
                'retryCount': 0,
                'guardrailsApplied': [],
                'validationStatus': 'passed',
                'captureMethod': 'async'
            }
        )
        
        if not emit_success:
            # Log warning but continue (non-blocking)
            print(f"Warning: Trace emission failed for {trace_id}")
        
        return response
        
    except Exception as e:
        # Agent failure - still try to trace
        try:
            emit_error_trace(
                trace_id=trace_id,
                trace_version="v1",
                agent_id=agent_id,
                incident_id=state['incidentId'],
                execution_id=state['executionId'],
                error=str(e)
            )
        except:
            # Tracing failed - log but don't propagate
            print(f"Warning: Error trace emission failed for {trace_id}")
        
        # Re-raise original exception (agent failure, not tracing failure)
        raise e


# Example usage in LangGraph node
async def signal_intelligence_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Example LangGraph node with tracing.
    
    Args:
        state: LangGraph state
        
    Returns:
        Updated state
    """
    try:
        # Invoke agent with tracing
        response = await invoke_agent_with_tracing(
            agent_id="signal-intelligence",
            input_data={
                'query': state['query'],
                'template': 'signal-analysis-v1',
                'variables': {
                    'service': state.get('service', 'unknown'),
                    'severity': state.get('severity', 'unknown')
                }
            },
            state=state
        )
        
        # Update state with response
        state['signal_analysis'] = response['output']
        return state
        
    except Exception as e:
        # Agent failed - update state with error
        state['signal_analysis_error'] = str(e)
        return state


# Example: Batch tracing for multiple agents
async def invoke_multiple_agents_with_tracing(
    agents: list[str],
    input_data: Dict[str, Any],
    state: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Invoke multiple agents with tracing.
    
    Args:
        agents: List of agent IDs
        input_data: Input data
        state: LangGraph state
        
    Returns:
        Aggregated responses
    """
    responses = {}
    
    for agent_id in agents:
        try:
            response = await invoke_agent_with_tracing(
                agent_id=agent_id,
                input_data=input_data,
                state=state
            )
            responses[agent_id] = response
        except Exception as e:
            # Log error but continue with other agents
            print(f"Agent {agent_id} failed: {e}")
            responses[agent_id] = {'error': str(e)}
    
    return responses
