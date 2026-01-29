#!/usr/bin/env python3
"""
Phase 6 Week 5 Task 3: CloudTrail Config Changes Action Group

Tool: query-config-changes
AWS Service: CloudTrail
API: LookupEvents

CONSTRAINTS:
- Filter: Write-type events only
- Config-related APIs
- Timeout: 2 seconds
"""

from typing import Any, Dict
from .common import (
    get_aws_client,
    TimeoutGuard,
    success_response,
    partial_response,
    failed_response,
    sort_by_timestamp,
    truncate_data,
    parse_iso_timestamp,
    validate_time_window,
    truncate_string,
)


# Config-related event names (write operations)
CONFIG_EVENT_NAMES = [
    'PutParameter',  # SSM Parameter Store
    'UpdateParameter',
    'DeleteParameter',
    'PutSecret',  # Secrets Manager
    'UpdateSecret',
    'DeleteSecret',
    'PutBucketPolicy',  # S3
    'PutBucketVersioning',
    'UpdateFunctionConfiguration',  # Lambda
    'UpdateFunctionCode',
    'ModifyDBInstance',  # RDS
    'ModifyDBCluster',
    'UpdateService',  # ECS
    'UpdateCluster',  # EKS
]


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Query CloudTrail for configuration changes.
    
    Input:
        {
            "incident_id": "string",
            "start_time": "ISO-8601",
            "end_time": "ISO-8601",
            "filters": {
                "resource_type": "AWS::Lambda::Function"
            },
            "limit": 10
        }
    
    Output:
        {
            "status": "SUCCESS | PARTIAL | FAILED",
            "data": [
                {
                    "event_name": "UpdateFunctionConfiguration",
                    "event_source": "lambda.amazonaws.com",
                    "event_time": "ISO-8601",
                    "username": "admin",
                    "resource_name": "my-function",
                    "change_type": "UPDATE"
                }
            ],
            "source": "cloudtrail",
            "queried_at": "ISO-8601",
            "duration_ms": 123,
            "error": null
        }
    """
    guard = TimeoutGuard(max_duration_ms=2000)
    
    try:
        # Extract parameters
        incident_id = event.get('incident_id')
        start_time = event.get('start_time')
        end_time = event.get('end_time')
        filters = event.get('filters', {})
        limit = min(event.get('limit', 10), 20)  # Cap at 20
        
        # Validate time window
        if not validate_time_window(start_time, end_time):
            return failed_response(
                source='cloudtrail',
                duration_ms=guard.elapsed_ms(),
                error=ValueError('Invalid time window'),
            )
        
        # Parse timestamps
        start_dt = parse_iso_timestamp(start_time)
        end_dt = parse_iso_timestamp(end_time)
        
        # Create CloudTrail client
        cloudtrail = get_aws_client('cloudtrail')
        
        # Lookup events (filter by ReadOnly=false for write operations)
        response = cloudtrail.lookup_events(
            LookupAttributes=[
                {
                    'AttributeKey': 'ReadOnly',
                    'AttributeValue': 'false',
                },
            ],
            StartTime=start_dt,
            EndTime=end_dt,
            MaxResults=50,  # Get more to filter
        )
        
        # Check timeout
        if guard.is_timeout():
            return partial_response(
                data=[],
                source='cloudtrail',
                duration_ms=guard.elapsed_ms(),
                reason='Timeout exceeded',
            )
        
        # Parse and filter events
        results = []
        for event in response.get('Events', []):
            event_name = event.get('EventName', '')
            
            # Filter to config-related events only
            if event_name not in CONFIG_EVENT_NAMES:
                continue
            
            event_data = {
                'event_name': event_name,
                'event_source': event.get('EventSource', ''),
                'event_time': event.get('EventTime', '').isoformat() if hasattr(event.get('EventTime', ''), 'isoformat') else str(event.get('EventTime', '')),
                'username': event.get('Username', 'Unknown'),
                'change_type': 'UPDATE' if 'Update' in event_name or 'Modify' in event_name else 'CREATE' if 'Put' in event_name or 'Create' in event_name else 'DELETE',
            }
            
            # Extract resource information
            resources = event.get('Resources', [])
            if resources:
                resource = resources[0]
                event_data['resource_name'] = resource.get('ResourceName', '')
                event_data['resource_type'] = resource.get('ResourceType', '')
            
            # Truncate cloud trail event
            cloud_trail_event = event.get('CloudTrailEvent', '')
            if cloud_trail_event:
                event_data['event_details'] = truncate_string(cloud_trail_event, max_length=500)
            
            results.append(event_data)
            
            # Stop if we have enough
            if len(results) >= limit:
                break
        
        # Sort by event time (deterministic)
        results = sort_by_timestamp(results, timestamp_key='event_time')
        
        # Truncate to limit
        results = truncate_data(results, max_items=limit)
        
        return success_response(
            data=results,
            source='cloudtrail',
            duration_ms=guard.elapsed_ms(),
            metadata={
                'incident_id': incident_id,
                'change_count': len(results),
            },
        )
    
    except Exception as e:
        return failed_response(
            source='cloudtrail',
            duration_ms=guard.elapsed_ms(),
            error=e,
        )
