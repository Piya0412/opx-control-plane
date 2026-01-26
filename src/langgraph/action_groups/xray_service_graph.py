#!/usr/bin/env python3
"""
Phase 6 Week 5 Task 3: X-Ray Service Graph Action Group

Tool: query-service-graph
AWS Service: X-Ray
API: GetServiceGraph

CONSTRAINTS:
- Output: Services, edges, error rates
- Timeout: 2 seconds
"""

from typing import Any, Dict
from .common import (
    get_aws_client,
    TimeoutGuard,
    success_response,
    partial_response,
    failed_response,
    sort_by_name,
    truncate_data,
    parse_iso_timestamp,
    validate_time_window,
)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Query X-Ray service graph for dependency analysis.
    
    Input:
        {
            "incident_id": "string",
            "start_time": "ISO-8601",
            "end_time": "ISO-8601",
            "filters": {
                "service_name": "my-service"
            },
            "limit": 20
        }
    
    Output:
        {
            "status": "SUCCESS | PARTIAL | FAILED",
            "data": {
                "services": [
                    {
                        "name": "api-gateway",
                        "type": "AWS::ApiGateway",
                        "request_count": 1000,
                        "error_rate": 0.05,
                        "fault_rate": 0.01,
                        "response_time_p95": 250
                    }
                ],
                "edges": [
                    {
                        "source": "api-gateway",
                        "target": "lambda-function",
                        "request_count": 950,
                        "error_rate": 0.02
                    }
                ]
            },
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
        limit = min(event.get('limit', 20), 20)  # Cap at 20
        
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
        
        # Create X-Ray client
        xray = get_aws_client('xray')
        
        # Get service graph
        response = xray.get_service_graph(
            StartTime=start_dt,
            EndTime=end_dt,
        )
        
        # Check timeout
        if guard.is_timeout():
            return partial_response(
                data={'services': [], 'edges': []},
                source='xray',
                duration_ms=guard.elapsed_ms(),
                reason='Timeout exceeded',
            )
        
        # Parse services
        services = []
        for service in response.get('Services', []):
            # Extract summary statistics
            summary_stats = service.get('SummaryStatistics', {})
            
            service_data = {
                'name': service.get('Name', 'Unknown'),
                'type': service.get('Type', 'Unknown'),
                'request_count': summary_stats.get('TotalCount', 0),
                'error_rate': summary_stats.get('ErrorStatistics', {}).get('ThrottleCount', 0) / max(summary_stats.get('TotalCount', 1), 1),
                'fault_rate': summary_stats.get('FaultStatistics', {}).get('TotalCount', 0) / max(summary_stats.get('TotalCount', 1), 1),
                'response_time_p95': summary_stats.get('TotalResponseTime', 0),
            }
            
            # Extract state (if available)
            if 'State' in service:
                service_data['state'] = service['State']
            
            services.append(service_data)
        
        # Sort services by name (deterministic)
        services = sort_by_name(services, name_key='name')
        
        # Truncate services
        services = truncate_data(services, max_items=limit)
        
        # Parse edges (connections between services)
        edges = []
        for service in response.get('Services', []):
            source_name = service.get('Name', 'Unknown')
            
            for edge in service.get('Edges', []):
                edge_summary = edge.get('SummaryStatistics', {})
                
                edge_data = {
                    'source': source_name,
                    'target': edge.get('ReferenceId', 'Unknown'),
                    'request_count': edge_summary.get('TotalCount', 0),
                    'error_rate': edge_summary.get('ErrorStatistics', {}).get('ThrottleCount', 0) / max(edge_summary.get('TotalCount', 1), 1),
                }
                
                edges.append(edge_data)
        
        # Truncate edges
        edges = truncate_data(edges, max_items=limit * 2)
        
        # Return structured graph data
        graph_data = {
            'services': services,
            'edges': edges,
        }
        
        return success_response(
            data=[graph_data],  # Wrap in list for consistency
            source='xray',
            duration_ms=guard.elapsed_ms(),
            metadata={
                'incident_id': incident_id,
                'service_count': len(services),
                'edge_count': len(edges),
            },
        )
    
    except Exception as e:
        return failed_response(
            source='xray',
            duration_ms=guard.elapsed_ms(),
            error=e,
        )
