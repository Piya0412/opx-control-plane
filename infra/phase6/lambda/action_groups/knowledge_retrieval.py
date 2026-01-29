"""
Knowledge Retrieval Action Group for Bedrock Agent.

Phase 7.4: Integrate Bedrock Knowledge Base with Knowledge RAG Agent.
Phase 7.5: Add CloudWatch metrics and structured logging.

CRITICAL RULES:
1. Vector-only search (no HYBRID - determinism requirement)
2. Read-only access (no ingestion)
3. Graceful degradation (return empty results on error)
4. Citation format: [Source: {source_file}, lines {start_line}-{end_line}]
5. Non-blocking metrics (retrieval must succeed even if metrics fail)
6. Low-cardinality dimensions (AgentId, QueryType only - NO IncidentId)
"""

import json
import os
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import ClientError

# ============================================================================
# CONFIGURATION
# ============================================================================

KNOWLEDGE_BASE_ID = os.environ.get('KNOWLEDGE_BASE_ID', '')
AGENT_ID = 'knowledge-rag'

# AWS clients
bedrock_agent_runtime = boto3.client('bedrock-agent-runtime')
cloudwatch = boto3.client('cloudwatch')


# ============================================================================
# METRICS & LOGGING (NON-BLOCKING)
# ============================================================================

def emit_metrics(
    metric_name: str,
    value: float,
    unit: str,
    query_type: str,
    dimensions: Optional[Dict[str, str]] = None
) -> None:
    """
    Emit CloudWatch metric (non-blocking, best-effort).
    
    CRITICAL: This function must NEVER throw exceptions.
    If metrics fail, log the error but continue execution.
    
    Args:
        metric_name: Metric name
        value: Metric value
        unit: CloudWatch unit (Count, Milliseconds, None, etc.)
        query_type: Query classification (runbook, postmortem, etc.)
        dimensions: Additional dimensions (optional)
    """
    try:
        metric_dimensions = [
            {'Name': 'AgentId', 'Value': AGENT_ID},
            {'Name': 'QueryType', 'Value': query_type}
        ]
        
        if dimensions:
            for key, val in dimensions.items():
                metric_dimensions.append({'Name': key, 'Value': val})
        
        cloudwatch.put_metric_data(
            Namespace='OpxKnowledgeBase',
            MetricData=[{
                'MetricName': metric_name,
                'Value': value,
                'Unit': unit,
                'Timestamp': datetime.utcnow(),
                'Dimensions': metric_dimensions
            }]
        )
    except Exception as e:
        # Best-effort: log but do not throw
        print(f"[WARN] Metric emission failed for {metric_name}: {str(e)}")


def log_structured(
    event_type: str,
    query: str,
    result_count: int,
    latency_ms: int,
    relevance_scores: List[float],
    incident_id: Optional[str] = None,
    error: Optional[str] = None
) -> None:
    """
    Log structured event (non-blocking, best-effort).
    
    CRITICAL: This function must NEVER throw exceptions.
    IncidentId is logged here but NOT used as a metric dimension.
    
    Args:
        event_type: Event type (retrieval_success, retrieval_error, etc.)
        query: Query text (sanitized)
        result_count: Number of results returned
        latency_ms: Execution time in milliseconds
        relevance_scores: List of relevance scores
        incident_id: Incident ID (logged, not used as metric dimension)
        error: Error message (if failed)
    """
    try:
        log_entry = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'event_type': event_type,
            'agent_id': AGENT_ID,
            'query': query[:200],  # Truncate for safety
            'result_count': result_count,
            'latency_ms': latency_ms,
            'relevance_scores': relevance_scores,
            'avg_relevance_score': sum(relevance_scores) / len(relevance_scores) if relevance_scores else 0.0
        }
        
        if incident_id:
            log_entry['incident_id'] = incident_id
        
        if error:
            log_entry['error'] = error
        
        print(json.dumps(log_entry))
    except Exception as e:
        # Best-effort: log but do not throw
        print(f"[WARN] Structured logging failed: {str(e)}")


def classify_query(query: str) -> str:
    """
    Classify query type for metrics dimensioning.
    
    Args:
        query: Query text
    
    Returns:
        Query type (runbook, postmortem, general)
    """
    query_lower = query.lower()
    
    if any(word in query_lower for word in ['runbook', 'procedure', 'how to', 'steps']):
        return 'runbook'
    elif any(word in query_lower for word in ['postmortem', 'incident', 'outage', 'failure']):
        return 'postmortem'
    else:
        return 'general'


# ============================================================================
# KNOWLEDGE RETRIEVAL
# ============================================================================

def retrieve_knowledge(
    query: str,
    max_results: int = 5,
    incident_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Query Bedrock Knowledge Base and return relevant chunks with citations.
    
    Phase 7.5: Emits CloudWatch metrics and structured logs (non-blocking).
    
    Args:
        query: Natural language query
        max_results: Maximum number of results (default: 5)
        incident_id: Incident ID (logged, not used as metric dimension)
    
    Returns:
        {
            "results": [
                {
                    "content": "...",
                    "citation": {
                        "source_file": "runbooks/rds-failover.md",
                        "start_line": 5,
                        "end_line": 10,
                        "section_header": "Diagnosis"
                    },
                    "relevance_score": 0.87
                }
            ]
        }
    
    CRITICAL:
    - Uses SEMANTIC search only (no HYBRID - determinism requirement)
    - Graceful degradation: returns empty results on error
    - Error logged to CloudWatch, not returned to agent
    - Metrics emission is non-blocking (retrieval succeeds even if metrics fail)
    """
    start_time = time.time()
    query_type = classify_query(query)
    relevance_scores = []
    error_msg = None
    
    try:
        response = bedrock_agent_runtime.retrieve(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            retrievalQuery={'text': query},
            retrievalConfiguration={
                'vectorSearchConfiguration': {
                    'numberOfResults': max_results,
                    'overrideSearchType': 'SEMANTIC'
                }
            }
        )
        
        results = []
        for item in response.get('retrievalResults', []):
            content = item['content']['text']
            metadata = item.get('metadata', {})
            score = item.get('score', 0.0)
            relevance_scores.append(score)
            
            results.append({
                'content': content,
                'citation': {
                    'source_file': metadata.get('source_file', 'unknown'),
                    'start_line': metadata.get('start_line', 0),
                    'end_line': metadata.get('end_line', 0),
                    'section_header': metadata.get('section_header', '')
                },
                'relevance_score': score
            })
        
        # Calculate latency
        latency_ms = int((time.time() - start_time) * 1000)
        
        # Emit metrics (non-blocking)
        emit_metrics('KnowledgeRetrievalCount', 1, 'Count', query_type)
        emit_metrics('KnowledgeRetrievalLatency', latency_ms, 'Milliseconds', query_type)
        emit_metrics('KnowledgeRetrievalResultCount', len(results), 'Count', query_type)
        
        if relevance_scores:
            avg_relevance = sum(relevance_scores) / len(relevance_scores)
            emit_metrics('KnowledgeRetrievalRelevanceScore', avg_relevance, 'None', query_type)
        
        if len(results) == 0:
            emit_metrics('KnowledgeRetrievalZeroResults', 1, 'Count', query_type)
        
        # Log structured event (non-blocking)
        log_structured(
            event_type='retrieval_success',
            query=query,
            result_count=len(results),
            latency_ms=latency_ms,
            relevance_scores=relevance_scores,
            incident_id=incident_id
        )
        
        return {'results': results}
    
    except Exception as e:
        # Graceful degradation: return empty results on error
        error_msg = str(e)
        latency_ms = int((time.time() - start_time) * 1000)
        
        # Emit error metrics (non-blocking)
        emit_metrics('KnowledgeRetrievalErrors', 1, 'Count', query_type, {'ErrorType': 'RetrievalFailure'})
        emit_metrics('KnowledgeRetrievalZeroResults', 1, 'Count', query_type)
        
        # Log structured error (non-blocking)
        log_structured(
            event_type='retrieval_error',
            query=query,
            result_count=0,
            latency_ms=latency_ms,
            relevance_scores=[],
            incident_id=incident_id,
            error=error_msg
        )
        
        print(f"Knowledge retrieval error: {error_msg}")
        return {'results': []}


# ============================================================================
# LAMBDA HANDLER
# ============================================================================

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler for Knowledge Retrieval action group.
    
    Phase 7.5: Extracts incident_id from event for logging (not metrics).
    
    Args:
        event: Bedrock Agent action group event
        context: Lambda context
    
    Returns:
        Action group response with knowledge chunks and citations
    """
    print(f"Knowledge retrieval invoked: {json.dumps(event)}")
    
    action_group = event.get('actionGroup')
    api_path = event.get('apiPath')
    parameters = event.get('parameters', [])
    
    # Extract incident_id from event (for logging, not metrics)
    incident_id = event.get('sessionAttributes', {}).get('incident_id')
    
    if api_path == '/retrieve':
        # Extract parameters
        query = next((p['value'] for p in parameters if p['name'] == 'query'), None)
        max_results = int(next((p['value'] for p in parameters if p['name'] == 'max_results'), 5))
        
        if not query:
            return {
                'messageVersion': '1.0',
                'response': {
                    'actionGroup': action_group,
                    'apiPath': api_path,
                    'httpMethod': 'POST',
                    'httpStatusCode': 400,
                    'responseBody': {
                        'application/json': {
                            'body': json.dumps({'error': 'Missing required parameter: query'})
                        }
                    }
                }
            }
        
        result = retrieve_knowledge(query, max_results, incident_id)
        
        return {
            'messageVersion': '1.0',
            'response': {
                'actionGroup': action_group,
                'apiPath': api_path,
                'httpMethod': 'POST',
                'httpStatusCode': 200,
                'responseBody': {
                    'application/json': {
                        'body': json.dumps(result)
                    }
                }
            }
        }
    
    return {
        'messageVersion': '1.0',
        'response': {
            'actionGroup': action_group,
            'apiPath': api_path,
            'httpMethod': 'POST',
            'httpStatusCode': 404,
            'responseBody': {
                'application/json': {
                    'body': json.dumps({'error': f'Unknown API path: {api_path}'})
                }
            }
        }
    }
