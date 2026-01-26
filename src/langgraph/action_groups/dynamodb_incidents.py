#!/usr/bin/env python3
"""
Phase 6 Week 5 Task 3: DynamoDB Incidents Action Group

Tool: search-incidents
AWS Service: DynamoDB
Table: opx-incident-events

CONSTRAINTS:
- Query GSI on incident signature hash
- Limit: 5 similar incidents
- Deterministic: Sorted by similarity_score DESC
- Timeout: 2 seconds
"""

from typing import Any, Dict
from .common import (
    get_aws_client,
    TimeoutGuard,
    success_response,
    partial_response,
    failed_response,
    sort_by_score,
    truncate_data,
)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Search for similar past incidents in DynamoDB.
    
    Input:
        {
            "incident_id": "string",
            "filters": {
                "signature_hash": "abc123",
                "service": "api-gateway",
                "min_similarity": 0.7
            },
            "limit": 5
        }
    
    Output:
        {
            "status": "SUCCESS | PARTIAL | FAILED",
            "data": [
                {
                    "incident_id": "INC-2024-001",
                    "signature_hash": "abc123",
                    "service": "api-gateway",
                    "similarity_score": 0.95,
                    "resolution_status": "RESOLVED",
                    "created_at": "ISO-8601"
                }
            ],
            "source": "dynamodb",
            "queried_at": "ISO-8601",
            "duration_ms": 123,
            "error": null
        }
    """
    guard = TimeoutGuard(max_duration_ms=2000)
    
    try:
        # Extract parameters
        incident_id = event.get('incident_id')
        filters = event.get('filters', {})
        limit = min(event.get('limit', 5), 5)  # Cap at 5
        
        # Extract filter configuration
        signature_hash = filters.get('signature_hash')
        service = filters.get('service')
        min_similarity = filters.get('min_similarity', 0.7)
        
        if not signature_hash:
            return failed_response(
                source='dynamodb',
                duration_ms=guard.elapsed_ms(),
                error=ValueError('signature_hash is required'),
            )
        
        # Create DynamoDB client
        dynamodb = get_aws_client('dynamodb')
        
        # Query GSI on signature hash
        # Note: Actual table/GSI names would come from environment variables
        table_name = 'opx-incident-events-dev'
        index_name = 'signature-hash-index'
        
        query_params = {
            'TableName': table_name,
            'IndexName': index_name,
            'KeyConditionExpression': 'signature_hash = :hash',
            'ExpressionAttributeValues': {
                ':hash': {'S': signature_hash},
            },
            'Limit': limit * 2,  # Get more to filter
            'ScanIndexForward': False,  # Most recent first
        }
        
        # Add service filter if provided
        if service:
            query_params['FilterExpression'] = 'service = :service'
            query_params['ExpressionAttributeValues'][':service'] = {'S': service}
        
        response = dynamodb.query(**query_params)
        
        # Check timeout
        if guard.is_timeout():
            return partial_response(
                data=[],
                source='dynamodb',
                duration_ms=guard.elapsed_ms(),
                reason='Timeout exceeded',
            )
        
        # Parse results
        results = []
        for item in response.get('Items', []):
            # Skip current incident
            item_incident_id = item.get('incident_id', {}).get('S', '')
            if item_incident_id == incident_id:
                continue
            
            # Calculate similarity score (simplified - would use actual algorithm)
            similarity_score = 0.9  # Placeholder
            
            if similarity_score < min_similarity:
                continue
            
            incident_data = {
                'incident_id': item_incident_id,
                'signature_hash': item.get('signature_hash', {}).get('S', ''),
                'service': item.get('service', {}).get('S', ''),
                'similarity_score': similarity_score,
                'resolution_status': item.get('status', {}).get('S', 'UNKNOWN'),
                'created_at': item.get('created_at', {}).get('S', ''),
            }
            
            results.append(incident_data)
        
        # Sort by similarity score (deterministic, descending)
        results = sort_by_score(results, score_key='similarity_score', descending=True)
        
        # Truncate to limit
        results = truncate_data(results, max_items=limit)
        
        return success_response(
            data=results,
            source='dynamodb',
            duration_ms=guard.elapsed_ms(),
            metadata={
                'incident_id': incident_id,
                'signature_hash': signature_hash,
                'match_count': len(results),
            },
        )
    
    except Exception as e:
        return failed_response(
            source='dynamodb',
            duration_ms=guard.elapsed_ms(),
            error=e,
        )
