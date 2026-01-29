#!/usr/bin/env python3
"""
Phase 6 Week 5 Task 3: CloudTrail Deployments Action Group

Tool: query-deployments
AWS Service: CloudTrail
API: LookupEvents

CONSTRAINTS:
- Filter: EventSource = ecs.amazonaws.com, eks.amazonaws.com
- Time-bounded to incident window
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


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Query CloudTrail for deployment events.
    
    Input:
        {
            "incident_id": "string",
            "start_time": "ISO-8601",
            "end_time": "ISO-8601",
            "filters": {
                "service": "ecs",  # or "eks"
                "cluster": "my-cluster"
            },
            "limit": 10
        }
    
    Output:
        {
            "status": "SUCCESS | PARTIAL | FAILED",
            "data": [
                {
                    "event_name": "UpdateService",
                    "event_source": "ecs.amazonaws.com",
                    "event_time": "ISO-8601",
                    "username": "admin",
                    "resource_name": "my-service",
                    "resource_type": "AWS::ECS::Service"
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
        
        # Extract filter configuration
        service = filters.get('service', 'ecs')  # ecs or eks
        
        # Map service to event source
        event_source_map = {
            'ecs': 'ecs.amazonaws.com',
            'eks': 'eks.amazonaws.com',
        }
        event_source = event_source_map.get(service, 'ecs.amazonaws.com')
        
        # Create CloudTrail client
        cloudtrail = get_aws_client('cloudtrail')
        
        # Lookup events
        response = cloudtrail.lookup_events(
            LookupAttributes=[
                {
                    'AttributeKey': 'EventSource',
                    'AttributeValue': event_source,
                },
            ],
            StartTime=start_dt,
            EndTime=end_dt,
            MaxResults=limit,
        )
        
        # Check timeout
        if guard.is_timeout():
            return partial_response(
                data=[],
                source='cloudtrail',
                duration_ms=guard.elapsed_ms(),
                reason='Timeout exceeded',
            )
        
        # Parse events
        results = []
        for event in response.get('Events', []):
            event_data = {
                'event_name': event.get('EventName', 'Unknown'),
                'event_source': event.get('EventSource', ''),
                'event_time': event.get('EventTime', '').isoformat() if hasattr(event.get('EventTime', ''), 'isoformat') else str(event.get('EventTime', '')),
                'username': event.get('Username', 'Unknown'),
            }
            
            # Extract resource information
            resources = event.get('Resources', [])
            if resources:
                resource = resources[0]
                event_data['resource_name'] = resource.get('ResourceName', '')
                event_data['resource_type'] = resource.get('ResourceType', '')
            
            # Truncate cloud trail event (can be large)
            cloud_trail_event = event.get('CloudTrailEvent', '')
            if cloud_trail_event:
                event_data['event_details'] = truncate_string(cloud_trail_event, max_length=500)
            
            results.append(event_data)
        
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
                'event_source': event_source,
                'event_count': len(results),
            },
        )
    
    except Exception as e:
        return failed_response(
            source='cloudtrail',
            duration_ms=guard.elapsed_ms(),
            error=e,
        )
