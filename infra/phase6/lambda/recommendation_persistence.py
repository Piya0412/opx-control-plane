"""
Phase 8.7: Advisory Recommendation Persistence

PURPOSE:
- Persist agent recommendations to DynamoDB
- Enable CLI inspection and audit
- Fail-open design (non-blocking)

SAFETY:
- Never blocks agent execution
- Errors are logged, not raised
- Metrics emitted on success/failure
"""

import json
import time
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone
from decimal import Decimal
import boto3
from botocore.exceptions import ClientError

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# AWS clients
dynamodb = boto3.resource('dynamodb')
cloudwatch = boto3.client('cloudwatch')


def convert_floats_to_decimal(obj: Any) -> Any:
    """
    Recursively convert float values to Decimal for DynamoDB compatibility.
    
    Args:
        obj: Object to convert (dict, list, or primitive)
    
    Returns:
        Object with floats converted to Decimal
    """
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: convert_floats_to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats_to_decimal(item) for item in obj]
    else:
        return obj


def build_recommendation(
    incident_id: str,
    execution_id: str,
    agent_name: str,
    agent_type: str,
    output: Dict[str, Any],
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Transform agent output into recommendation schema.
    
    Args:
        incident_id: Incident ID
        execution_id: LangGraph execution ID (session_id)
        agent_name: Agent name (e.g., "signal-intelligence")
        agent_type: Agent category (e.g., "signal", "consensus")
        output: Agent output dictionary
        metadata: Execution metadata (cost, tokens, duration)
    
    Returns:
        Recommendation document ready for DynamoDB
    """
    timestamp = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    
    # Generate deterministic recommendation ID
    recommendation_id = generate_recommendation_id(incident_id, agent_name, timestamp)
    
    # Calculate TTL (90 days from now)
    ttl = int(time.time()) + (90 * 24 * 60 * 60)
    
    # Build recommendation document
    recommendation = {
        'recommendationId': recommendation_id,
        'incidentId': incident_id,
        'executionId': execution_id,
        'agentName': agent_name,
        'agentType': agent_type,
        'timestamp': timestamp,
        'recommendation': convert_floats_to_decimal(output.get('recommendation', {})),
        'confidence': Decimal(str(output.get('confidence', 0.0))),
        'reasoning': output.get('reasoning', ''),
        'citations': convert_floats_to_decimal(output.get('citations', [])),
        'metadata': convert_floats_to_decimal(metadata or {}),
        'status': 'GENERATED',
        'approved': False,  # Reserved for Phase 9
        'ttl': ttl
    }
    
    return recommendation


def generate_recommendation_id(incident_id: str, agent_name: str, timestamp: str) -> str:
    """
    Generate deterministic recommendation ID.
    
    Format: rec-{incidentId}-{agentName}-{timestamp}
    
    Args:
        incident_id: Incident ID
        agent_name: Agent name
        timestamp: ISO 8601 timestamp
    
    Returns:
        Recommendation ID
    """
    return f"rec-{incident_id}-{agent_name}-{timestamp}"


def persist_recommendations(
    incident_id: str,
    execution_id: str,
    agent_outputs: Dict[str, Dict[str, Any]],
    consensus: Optional[Dict[str, Any]] = None,
    table_name: Optional[str] = None
) -> None:
    """
    Persist agent recommendations to DynamoDB.
    
    This is FAIL-OPEN: Errors are logged but do not block execution.
    
    Args:
        incident_id: Incident ID
        execution_id: LangGraph execution ID
        agent_outputs: Dictionary of agent outputs {agent_name: output}
        consensus: Consensus recommendation (optional)
        table_name: DynamoDB table name (defaults to env var)
    """
    import os
    
    table_name = table_name or os.environ.get('RECOMMENDATIONS_TABLE')
    
    if not table_name:
        logger.warning("RECOMMENDATIONS_TABLE not set, skipping persistence")
        return
    
    try:
        table = dynamodb.Table(table_name)
        recommendations = []
        
        # Transform each agent output
        for agent_name, output in agent_outputs.items():
            # Determine agent type from name
            agent_type = _get_agent_type(agent_name)
            
            rec = build_recommendation(
                incident_id=incident_id,
                execution_id=execution_id,
                agent_name=agent_name,
                agent_type=agent_type,
                output=output,
                metadata=output.get('metadata', {})
            )
            recommendations.append(rec)
        
        # Add consensus recommendation if provided
        if consensus:
            consensus_rec = build_recommendation(
                incident_id=incident_id,
                execution_id=execution_id,
                agent_name='consensus',
                agent_type='consensus',
                output=consensus,
                metadata=consensus.get('metadata', {})
            )
            recommendations.append(consensus_rec)
        
        # Batch write recommendations (up to 25 items per batch)
        batch_write_recommendations(table, recommendations)
        
        # Emit success metric
        emit_metric('RecommendationsPersisted', len(recommendations))
        
        logger.info(f"Successfully persisted {len(recommendations)} recommendations for {incident_id}")
        
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        
        if error_code == 'ProvisionedThroughputExceededException':
            logger.warning(f"DynamoDB throttled while persisting recommendations: {e}")
            emit_metric('RecommendationPersistenceThrottled', 1)
        else:
            logger.error(f"Failed to persist recommendations: {e}")
            emit_metric('RecommendationPersistenceFailure', 1)
    
    except Exception as e:
        logger.error(f"Unexpected error persisting recommendations: {e}")
        emit_metric('RecommendationPersistenceFailure', 1)


def batch_write_recommendations(table, recommendations: List[Dict[str, Any]]) -> None:
    """
    Batch write recommendations to DynamoDB.
    
    Handles batches of up to 25 items (DynamoDB limit).
    
    Args:
        table: DynamoDB table resource
        recommendations: List of recommendation documents
    """
    # DynamoDB batch write limit is 25 items
    batch_size = 25
    
    for i in range(0, len(recommendations), batch_size):
        batch = recommendations[i:i + batch_size]
        
        with table.batch_writer() as writer:
            for rec in batch:
                writer.put_item(Item=rec)


def emit_metric(metric_name: str, value: float, unit: str = 'Count') -> None:
    """
    Emit CloudWatch metric.
    
    Args:
        metric_name: Metric name
        value: Metric value
        unit: Metric unit (default: Count)
    """
    try:
        cloudwatch.put_metric_data(
            Namespace='OPX/Recommendations',
            MetricData=[
                {
                    'MetricName': metric_name,
                    'Value': value,
                    'Unit': unit,
                    'Timestamp': datetime.now(timezone.utc)
                }
            ]
        )
    except Exception as e:
        # Don't fail on metric emission errors
        logger.warning(f"Failed to emit metric {metric_name}: {e}")


def _get_agent_type(agent_name: str) -> str:
    """
    Determine agent type from agent name.
    
    Args:
        agent_name: Agent name
    
    Returns:
        Agent type category
    """
    type_mapping = {
        'signal-intelligence': 'signal',
        'historical-pattern': 'historical',
        'change-intelligence': 'change',
        'risk-blast-radius': 'risk',
        'knowledge-rag': 'knowledge',
        'response-strategy': 'response',
        'consensus': 'consensus'
    }
    
    return type_mapping.get(agent_name, 'unknown')
