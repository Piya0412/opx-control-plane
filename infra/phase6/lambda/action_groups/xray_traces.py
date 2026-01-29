#!/usr/bin/env python3
"""
Phase 6 Week 5 Task 3: X-Ray Traces Action Group

Tool: analyze-traces
AWS Service: X-Ray
API: GetTraceSummaries

CONSTRAINTS:
- Max 5 traces
- Duration summaries only (no subsegments)
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
)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Analyze X-Ray traces for incident correlation.
    
    Input:
        {
            "incident_id": "string",
            "start_time": "ISO-8601",
            "end_time": "ISO-8601",
            "filters": {
                "service_name": "my-service",
                "error_only": true
            },
            "limit": 5
        }
    
    Output:
        {
            "status": "SUCCESS | PARTIAL | FAILED",
            "data": [
                {
                    "trace_id": "1-abc-123",
                    "duration_ms": 1234,
                    "response_time_ms": 1200,
                    "has_error": true,
                    "has_fault": false,
                    "http_status": 500,
                    "timestamp": "ISO-8601"
                }
            ],
            "source": "xray",
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
        limit = min(event.get('limit', 5), 5)  # Cap at 5
        
        # Validate time window
        if not validate_time_window(start_time, end_time):
            return failed_response(
                source='xray',
                duration_ms=guard.elapsed_ms(),
                error=ValueError('Invalid time window'),
            )
        
        # Parse timestamps
        start_dt = parse_iso_timestamp(start_time)
        end_dt = parse_iso_timestamp(end_time)
        
        # Extract filter configuration
        service_name = filters.get('service_name')
        error_only = filters.get('error_only', False)
        
        # Create X-Ray client
        xray = get_aws_client('xray')
        
        # Build filter expression
        filter_expression = None
        if error_only:
            filter_expression = 'error = true OR fault = true'
        if service_name:
            service_filter = f'service(id(name: "{service_name}"))'
            filter_expression = service_filter if not filter_expression else f'{filter_expression} AND {service_filter}'
        
        # Get trace summaries
        kwargs = {
            'StartTime': start_dt,
            'EndTime': end_dt,
            'Sampling': False,
        }
        
        if filter_expression:
            kwargs['FilterExpression'] = filter_expression
        
        response = xray.get_trace_summaries(**kwargs)
        
        # Check timeout
        if guard.is_timeout():
            return partial_response(
                data=[],
                source='xray',
                duration_ms=guard.elapsed_ms(),
                reason='Timeout exceeded',
            )
        
        # Parse trace summaries
        results = []
        for summary in response.get('TraceSummaries', [])[:limit]:
            trace_data = {
                'trace_id': summary.get('Id', 'unknown'),
                'duration_ms': int(summary.get('Duration', 0) * 1000),
                'response_time_ms': int(summary.get('ResponseTime', 0) * 1000),
                'has_error': summary.get('HasError', False),
                'has_fault': summary.get('HasFault', False),
                'has_throttle': summary.get('HasThrottle', False),
                'timestamp': summary.get('StartTime', '').isoformat() if hasattr(summary.get('StartTime', ''), 'isoformat') else str(summary.get('StartTime', '')),
            }
            
            # Extract HTTP status if available
            if 'Http' in summary:
                trace_data['http_status'] = summary['Http'].get('HttpStatus')
                trace_data['http_method'] = summary['Http'].get('HttpMethod')
                trace_data['http_url'] = summary['Http'].get('HttpURL')
            
            results.append(trace_data)
        
        # Sort by timestamp (deterministic)
        results = sort_by_timestamp(results, timestamp_key='timestamp')
        
        # Truncate to limit
        results = truncate_data(results, max_items=limit)
        
        return success_response(
            data=results,
            source='xray',
            duration_ms=guard.elapsed_ms(),
            metadata={
                'incident_id': incident_id,
                'trace_count': len(results),
                'error_only': error_only,
            },
        )
    
    except Exception as e:
        return failed_response(
            source='xray',
            duration_ms=guard.elapsed_ms(),
            error=e,
        )
