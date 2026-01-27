"""
Knowledge Retrieval Action Group for Bedrock Agent.

Phase 7.4: Integrate Bedrock Knowledge Base with Knowledge RAG Agent.

CRITICAL RULES:
1. Vector-only search (no HYBRID - determinism requirement)
2. Read-only access (no ingestion)
3. Graceful degradation (return empty results on error)
4. Citation format: [Source: {source_file}, lines {start_line}-{end_line}]
"""

import json
import os
from typing import Any, Dict, List

import boto3
from botocore.exceptions import ClientError

# ============================================================================
# CONFIGURATION
# ============================================================================

KNOWLEDGE_BASE_ID = os.environ.get('KNOWLEDGE_BASE_ID', '')

# Bedrock Agent Runtime client
bedrock_agent_runtime = boto3.client('bedrock-agent-runtime')


# ============================================================================
# KNOWLEDGE RETRIEVAL
# ============================================================================

def retrieve_knowledge(query: str, max_results: int = 5) -> Dict[str, Any]:
    """
    Query Bedrock Knowledge Base and return relevant chunks with citations.
    
    Args:
        query: Natural language query
        max_results: Maximum number of results (default: 5)
    
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
    - Uses VECTOR search only (no HYBRID - determinism requirement)
    - Graceful degradation: returns empty results on error
    - Error logged to CloudWatch, not returned to agent
    """
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
        
        return {'results': results}
    
    except Exception as e:
        # Graceful degradation: return empty results on error
        # Log error to CloudWatch instead of returning it
        print(f"Knowledge retrieval error: {str(e)}")
        return {
            'results': []
        }


# ============================================================================
# LAMBDA HANDLER
# ============================================================================

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler for Knowledge Retrieval action group.
    
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
        
        result = retrieve_knowledge(query, max_results)
        
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
