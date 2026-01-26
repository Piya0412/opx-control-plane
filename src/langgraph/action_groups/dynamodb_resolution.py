#!/usr/bin/env python3
"""
Phase 6 Week 5 Task 3: DynamoDB Resolution Summary Action Group

Tool: get-resolution-summary
AWS Service: DynamoDB
Table: opx-post-incident-summaries

CONSTRAINTS:
- Query exact incident_id match
- Timeout: 2 seconds
"""

from typing import Any, Dict
from .common import (
    get_aws_client,
    TimeoutGuard,
    success_response,
    failed_response,
    truncate_string,
)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Get resolution summary for a specific incident.
    
    Input:
        {
            "incident_id": "INC-2024-001"
        }
    
    Output:
        {
            "status": "SUCCESS | FAILED",
            "data": [
                {
                    "incident_id": "INC-2024-001",
                    "resolution_summary": "Restarted service, issue resolved",
                    "root_cause": "Memory leak in cache layer",
                    "actions_taken": ["Restart service", "Clear cache"],
                    "resolution_time_minutes": 45,
                    "resolved_at": "ISO-8601"
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
        
        if not incident_id:
            return failed_response(
                source='dynamodb',
                duration_ms=guard.elapsed_ms(),
                error=ValueError('incident_id is required'),
            )
        
        # Create DynamoDB client
        dynamodb = get_aws_client('dynamodb')
        
        # Get item by incident_id
        table_name = 'opx-resolution-summaries-dev'
        
        response = dynamodb.get_item(
            TableName=table_name,
            Key={
                'incident_id': {'S': incident_id},
            },
        )
        
        # Check timeout
        if guard.is_timeout():
            return failed_response(
                source='dynamodb',
                duration_ms=guard.elapsed_ms(),
                error=Exception('Timeout exceeded'),
            )
        
        # Parse result
        item = response.get('Item')
        
        if not item:
            # No resolution summary found
            return success_response(
                data=[],
                source='dynamodb',
                duration_ms=guard.elapsed_ms(),
                metadata={
                    'incident_id': incident_id,
                    'found': False,
                },
            )
        
        # Extract resolution data
        resolution_data = {
            'incident_id': item.get('incident_id', {}).get('S', ''),
            'resolution_summary': truncate_string(
                item.get('resolution_summary', {}).get('S', ''),
                max_length=1000,
            ),
            'root_cause': truncate_string(
                item.get('root_cause', {}).get('S', ''),
                max_length=500,
            ),
            'actions_taken': [],
            'resolution_time_minutes': int(item.get('resolution_time_minutes', {}).get('N', 0)),
            'resolved_at': item.get('resolved_at', {}).get('S', ''),
        }
        
        # Parse actions_taken list
        actions_list = item.get('actions_taken', {}).get('L', [])
        for action in actions_list:
            action_text = action.get('S', '')
            if action_text:
                resolution_data['actions_taken'].append(truncate_string(action_text, max_length=200))
        
        return success_response(
            data=[resolution_data],
            source='dynamodb',
            duration_ms=guard.elapsed_ms(),
            metadata={
                'incident_id': incident_id,
                'found': True,
            },
        )
    
    except Exception as e:
        return failed_response(
            source='dynamodb',
            duration_ms=guard.elapsed_ms(),
            error=e,
        )
