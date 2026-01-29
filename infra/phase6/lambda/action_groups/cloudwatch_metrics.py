#!/usr/bin/env python3
"""
Phase 6 Week 5 Task 3: CloudWatch Metrics Action Group

Tool: query-metrics
AWS Service: CloudWatch
API: GetMetricData

CONSTRAINTS:
- Max 3 metrics per call
- Period ≥ 60s
- Max 20 datapoints total
- Timeout: 2 seconds
- Deterministic: Metrics sorted by name, timestamps ascending
"""

from typing import Any, Dict
from datetime import datetime, timedelta
from .common import (
    get_aws_client,
    TimeoutGuard,
    success_response,
    partial_response,
    failed_response,
    sort_by_name,
    sort_by_timestamp,
    truncate_data,
    parse_iso_timestamp,
    validate_time_window,
)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Query CloudWatch metrics for incident analysis.
    
    Input:
        {
            "incident_id": "string",
            "start_time": "ISO-8601",
            "end_time": "ISO-8601",
            "filters": {
                "namespace": "AWS/EC2",
                "metric_names": ["CPUUtilization", "NetworkIn"],
                "dimensions": [{"Name": "InstanceId", "Value": "i-123"}]
            },
            "limit": 20
        }
    
    Output:
        {
            "status": "SUCCESS | PARTIAL | FAILED",
            "data": [
                {
                    "metric": "CPUUtilization",
                    "namespace": "AWS/EC2",
                    "datapoints": [
                        {"timestamp": "ISO-8601", "value": 95.5, "unit": "Percent"}
                    ]
                }
            ],
            "source": "cloudwatch",
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
        limit = min(event.get('limit', 20), 20)  # Cap at 20
        
        # Validate time window
        if not validate_time_window(start_time, end_time):
            return failed_response(
                source='cloudwatch',
                duration_ms=guard.elapsed_ms(),
                error=ValueError('Invalid time window'),
            )
        
        # Parse timestamps
        start_dt = parse_iso_timestamp(start_time)
        end_dt = parse_iso_timestamp(end_time)
        
        # Extract metric configuration
        namespace = filters.get('namespace', 'AWS/EC2')
        metric_names = filters.get('metric_names', ['CPUUtilization'])[:3]  # Max 3
        dimensions = filters.get('dimensions', [])
        
        # Create CloudWatch client
        cloudwatch = get_aws_client('cloudwatch')
        
        # Build metric queries (max 3)
        metric_queries = []
        for idx, metric_name in enumerate(metric_names):
            metric_queries.append({
                'Id': f'm{idx}',
                'MetricStat': {
                    'Metric': {
                        'Namespace': namespace,
                        'MetricName': metric_name,
                        'Dimensions': dimensions,
                    },
                    'Period': 60,  # Minimum 60 seconds
                    'Stat': 'Average',
                },
                'ReturnData': True,
            })
        
        # Query metrics
        response = cloudwatch.get_metric_data(
            MetricDataQueries=metric_queries,
            StartTime=start_dt,
            EndTime=end_dt,
            MaxDatapoints=limit,
        )
        
        # Check timeout
        if guard.is_timeout():
            return partial_response(
                data=[],
                source='cloudwatch',
                duration_ms=guard.elapsed_ms(),
                reason='Timeout exceeded',
            )
        
        # Parse results
        results = []
        for result in response.get('MetricDataResults', []):
            metric_data = {
                'metric': result.get('Label', 'Unknown'),
                'namespace': namespace,
                'datapoints': [],
            }
            
            # Combine timestamps and values
            timestamps = result.get('Timestamps', [])
            values = result.get('Values', [])
            
            for ts, val in zip(timestamps, values):
                metric_data['datapoints'].append({
                    'timestamp': ts.isoformat() if isinstance(ts, datetime) else str(ts),
                    'value': float(val),
                    'unit': 'None',
                })
            
            # Sort datapoints by timestamp (deterministic)
            metric_data['datapoints'] = sort_by_timestamp(
                metric_data['datapoints'],
                timestamp_key='timestamp',
            )
            
            results.append(metric_data)
        
        # Sort metrics by name (deterministic)
        results = sort_by_name(results, name_key='metric')
        
        # Truncate to limit
        results = truncate_data(results, max_items=limit)
        
        return success_response(
            data=results,
            source='cloudwatch',
            duration_ms=guard.elapsed_ms(),
            metadata={
                'incident_id': incident_id,
                'namespace': namespace,
                'metric_count': len(results),
            },
        )
    
    except Exception as e:
        return failed_response(
            source='cloudwatch',
            duration_ms=guard.elapsed_ms(),
            error=e,
        )
