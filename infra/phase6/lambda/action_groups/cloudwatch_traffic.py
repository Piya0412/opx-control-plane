#!/usr/bin/env python3
"""
Phase 6 Week 5 Task 3: CloudWatch Traffic Metrics Action Group

Tool: query-traffic-metrics
AWS Service: CloudWatch
API: GetMetricData

CONSTRAINTS:
- Metrics: RequestCount, 4XX/5XX error rate, Latency (p95)
- Timeout: 2 seconds
"""

from typing import Any, Dict
from datetime import datetime
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
    Query CloudWatch for traffic metrics.
    
    Input:
        {
            "incident_id": "string",
            "start_time": "ISO-8601",
            "end_time": "ISO-8601",
            "filters": {
                "load_balancer": "app/my-alb/abc123",
                "target_group": "targetgroup/my-tg/xyz789"
            },
            "limit": 20
        }
    
    Output:
        {
            "status": "SUCCESS | PARTIAL | FAILED",
            "data": [
                {
                    "timestamp": "ISO-8601",
                    "request_count": 1000,
                    "error_4xx_rate": 0.02,
                    "error_5xx_rate": 0.01,
                    "latency_p95_ms": 250
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
        
        # Extract filter configuration
        load_balancer = filters.get('load_balancer')
        target_group = filters.get('target_group')
        namespace = filters.get('namespace', 'AWS/ApplicationELB')
        
        # Build dimensions
        dimensions = []
        if load_balancer:
            dimensions.append({'Name': 'LoadBalancer', 'Value': load_balancer})
        if target_group:
            dimensions.append({'Name': 'TargetGroup', 'Value': target_group})
        
        # Create CloudWatch client
        cloudwatch = get_aws_client('cloudwatch')
        
        # Build metric queries
        metric_queries = [
            {
                'Id': 'request_count',
                'MetricStat': {
                    'Metric': {
                        'Namespace': namespace,
                        'MetricName': 'RequestCount',
                        'Dimensions': dimensions,
                    },
                    'Period': 60,
                    'Stat': 'Sum',
                },
                'ReturnData': True,
            },
            {
                'Id': 'error_4xx',
                'MetricStat': {
                    'Metric': {
                        'Namespace': namespace,
                        'MetricName': 'HTTPCode_Target_4XX_Count',
                        'Dimensions': dimensions,
                    },
                    'Period': 60,
                    'Stat': 'Sum',
                },
                'ReturnData': True,
            },
            {
                'Id': 'error_5xx',
                'MetricStat': {
                    'Metric': {
                        'Namespace': namespace,
                        'MetricName': 'HTTPCode_Target_5XX_Count',
                        'Dimensions': dimensions,
                    },
                    'Period': 60,
                    'Stat': 'Sum',
                },
                'ReturnData': True,
            },
            {
                'Id': 'latency_p95',
                'MetricStat': {
                    'Metric': {
                        'Namespace': namespace,
                        'MetricName': 'TargetResponseTime',
                        'Dimensions': dimensions,
                    },
                    'Period': 60,
                    'Stat': 'p95',
                },
                'ReturnData': True,
            },
        ]
        
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
        
        # Parse results and combine by timestamp
        metric_results = response.get('MetricDataResults', [])
        
        # Build a map of timestamp -> metrics
        timestamp_map = {}
        
        for result in metric_results:
            metric_id = result.get('Id', '')
            timestamps = result.get('Timestamps', [])
            values = result.get('Values', [])
            
            for ts, val in zip(timestamps, values):
                ts_str = ts.isoformat() if isinstance(ts, datetime) else str(ts)
                
                if ts_str not in timestamp_map:
                    timestamp_map[ts_str] = {
                        'timestamp': ts_str,
                        'request_count': 0,
                        'error_4xx_count': 0,
                        'error_5xx_count': 0,
                        'latency_p95_ms': 0,
                    }
                
                if metric_id == 'request_count':
                    timestamp_map[ts_str]['request_count'] = int(val)
                elif metric_id == 'error_4xx':
                    timestamp_map[ts_str]['error_4xx_count'] = int(val)
                elif metric_id == 'error_5xx':
                    timestamp_map[ts_str]['error_5xx_count'] = int(val)
                elif metric_id == 'latency_p95':
                    timestamp_map[ts_str]['latency_p95_ms'] = int(val * 1000)  # Convert to ms
        
        # Convert to list and calculate error rates
        results = []
        for data_point in timestamp_map.values():
            request_count = data_point['request_count']
            
            if request_count > 0:
                data_point['error_4xx_rate'] = data_point['error_4xx_count'] / request_count
                data_point['error_5xx_rate'] = data_point['error_5xx_count'] / request_count
            else:
                data_point['error_4xx_rate'] = 0.0
                data_point['error_5xx_rate'] = 0.0
            
            # Remove raw counts (keep rates only)
            del data_point['error_4xx_count']
            del data_point['error_5xx_count']
            
            results.append(data_point)
        
        # Sort by timestamp (deterministic)
        results = sort_by_timestamp(results, timestamp_key='timestamp')
        
        # Truncate to limit
        results = truncate_data(results, max_items=limit)
        
        return success_response(
            data=results,
            source='cloudwatch',
            duration_ms=guard.elapsed_ms(),
            metadata={
                'incident_id': incident_id,
                'namespace': namespace,
                'datapoint_count': len(results),
            },
        )
    
    except Exception as e:
        return failed_response(
            source='cloudwatch',
            duration_ms=guard.elapsed_ms(),
            error=e,
        )
