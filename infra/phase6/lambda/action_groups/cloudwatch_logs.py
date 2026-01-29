#!/usr/bin/env python3
"""
Phase 6 Week 5 Task 3: CloudWatch Logs Action Group

Tool: search-logs
AWS Service: CloudWatch Logs
API: StartQuery → GetQueryResults

CONSTRAINTS:
- Timeout: 1.5 seconds
- Max 10 log entries
- Filtered by incident time window
- Failure mode: Timeout → return PARTIAL with empty data
"""

from typing import Any, Dict
import time
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
    Search CloudWatch Logs for incident-related entries.
    
    Input:
        {
            "incident_id": "string",
            "start_time": "ISO-8601",
            "end_time": "ISO-8601",
            "filters": {
                "log_group": "/aws/lambda/my-function",
                "filter_pattern": "ERROR",
                "fields": ["@timestamp", "@message"]
            },
            "limit": 10
        }
    
    Output:
        {
            "status": "SUCCESS | PARTIAL | FAILED",
            "data": [
                {
                    "timestamp": "ISO-8601",
                    "message": "ERROR: Connection timeout",
                    "log_stream": "2024/01/26/[$LATEST]abc123"
                }
            ],
            "source": "cloudwatch-logs",
            "queried_at": "ISO-8601",
            "duration_ms": 123,
            "error": null
        }
    """
    guard = TimeoutGuard(max_duration_ms=1500)  # 1.5 seconds
    
    try:
        # Extract parameters
        incident_id = event.get('incident_id')
        start_time = event.get('start_time')
        end_time = event.get('end_time')
        filters = event.get('filters', {})
        limit = min(event.get('limit', 10), 10)  # Cap at 10
        
        # Validate time window
        if not validate_time_window(start_time, end_time):
            return failed_response(
                source='cloudwatch-logs',
                duration_ms=guard.elapsed_ms(),
                error=ValueError('Invalid time window'),
            )
        
        # Parse timestamps (convert to milliseconds)
        start_dt = parse_iso_timestamp(start_time)
        end_dt = parse_iso_timestamp(end_time)
        start_ms = int(start_dt.timestamp() * 1000)
        end_ms = int(end_dt.timestamp() * 1000)
        
        # Extract log configuration
        log_group = filters.get('log_group', '/aws/lambda/*')
        filter_pattern = filters.get('filter_pattern', '')
        fields = filters.get('fields', ['@timestamp', '@message'])
        
        # Create CloudWatch Logs client
        logs = get_aws_client('logs')
        
        # Build query
        query_string = f"fields {', '.join(fields)} | limit {limit}"
        if filter_pattern:
            query_string = f"filter @message like /{filter_pattern}/ | {query_string}"
        
        # Start query
        start_query_response = logs.start_query(
            logGroupName=log_group,
            startTime=start_ms,
            endTime=end_ms,
            queryString=query_string,
            limit=limit,
        )
        
        query_id = start_query_response['queryId']
        
        # Poll for results (with timeout)
        results = []
        while not guard.is_timeout():
            get_results_response = logs.get_query_results(queryId=query_id)
            
            status = get_results_response['status']
            
            if status == 'Complete':
                # Parse results
                for result in get_results_response.get('results', []):
                    log_entry = {}
                    for field in result:
                        field_name = field['field']
                        field_value = field['value']
                        
                        # Map field names
                        if field_name == '@timestamp':
                            log_entry['timestamp'] = field_value
                        elif field_name == '@message':
                            log_entry['message'] = truncate_string(field_value, max_length=500)
                        elif field_name == '@logStream':
                            log_entry['log_stream'] = field_value
                        else:
                            log_entry[field_name] = field_value
                    
                    results.append(log_entry)
                
                break
            
            elif status in ['Failed', 'Cancelled']:
                return failed_response(
                    source='cloudwatch-logs',
                    duration_ms=guard.elapsed_ms(),
                    error=Exception(f'Query {status.lower()}'),
                )
            
            # Still running, wait briefly
            time.sleep(0.1)
        
        # Check if we timed out
        if guard.is_timeout() and not results:
            return partial_response(
                data=[],
                source='cloudwatch-logs',
                duration_ms=guard.elapsed_ms(),
                reason='Query timeout',
            )
        
        # Sort by timestamp (deterministic)
        results = sort_by_timestamp(results, timestamp_key='timestamp')
        
        # Truncate to limit
        results = truncate_data(results, max_items=limit)
        
        return success_response(
            data=results,
            source='cloudwatch-logs',
            duration_ms=guard.elapsed_ms(),
            metadata={
                'incident_id': incident_id,
                'log_group': log_group,
                'entry_count': len(results),
            },
        )
    
    except Exception as e:
        return failed_response(
            source='cloudwatch-logs',
            duration_ms=guard.elapsed_ms(),
            error=e,
        )
