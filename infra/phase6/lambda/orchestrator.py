"""
Phase 6 Week 2: LangGraph Orchestrator Lambda Handler

AWS Lambda handler for LangGraph multi-agent orchestration.
"""

import json
import os
import uuid
from typing import Dict, Any

from .graph import build_graph
from .state import create_initial_state
from .checkpointing import create_dynamodb_checkpointer


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler for LangGraph orchestration.
    
    Args:
        event: Lambda event with incident_id and evidence_bundle
        context: Lambda context
        
    Returns:
        Response with final state
    """
    print(f"[orchestrator] Received event: {json.dumps(event)}")
    
    # Extract input
    incident_id = event.get('incident_id')
    evidence_bundle = event.get('evidence_bundle', {})
    budget_limit = event.get('budget_limit', 10.0)
    
    if not incident_id:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'incident_id required'}),
        }
    
    # Generate execution IDs
    execution_id = str(uuid.uuid4())
    thread_id = f"incident-{incident_id}-{execution_id}"
    
    print(f"[orchestrator] Starting execution {execution_id} for incident {incident_id}")
    
    try:
        # Create initial state
        initial_state = create_initial_state(
            incident_id=incident_id,
            evidence_bundle=evidence_bundle,
            execution_id=execution_id,
            thread_id=thread_id,
            budget_limit=budget_limit,
        )
        
        # Create checkpointer
        checkpointer = create_dynamodb_checkpointer(
            table_name=os.environ.get('LANGGRAPH_STATE_TABLE', 'opx-langgraph-state'),
        )
        
        # Build graph with checkpointer
        graph = build_graph(checkpointer=checkpointer)
        
        # Execute graph
        config = {'configurable': {'thread_id': thread_id}}
        final_state = graph.invoke(initial_state, config)
        
        print(f"[orchestrator] Execution complete. Final checkpoint: {final_state['checkpoint_node']}")
        
        # Return final state
        return {
            'statusCode': 200,
            'body': json.dumps({
                'execution_id': execution_id,
                'thread_id': thread_id,
                'incident_id': incident_id,
                'checkpoint_node': final_state['checkpoint_node'],
                'budget': final_state['budget'],
                'consensus': final_state.get('consensus'),
                'agent_outputs': {
                    'signal_intelligence': final_state.get('signal_intelligence'),
                    'historical_pattern': final_state.get('historical_pattern'),
                    'change_intelligence': final_state.get('change_intelligence'),
                    'risk_blast_radius': final_state.get('risk_blast_radius'),
                    'knowledge_rag': final_state.get('knowledge_rag'),
                    'response_strategy': final_state.get('response_strategy'),
                },
            }),
        }
        
    except Exception as e:
        print(f"[orchestrator] Error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
                'execution_id': execution_id,
            }),
        }
