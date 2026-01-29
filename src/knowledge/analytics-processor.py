"""
Phase 7.5: Knowledge Base Analytics Processor

Runs daily to analyze query patterns and identify knowledge gaps.

CRITICAL: This Lambda processes analytics exhaust only.
- NOT authoritative
- NOT replayed
- NOT used for operational decisions
"""

import json
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List
from collections import Counter
import hashlib

import boto3
from boto3.dynamodb.conditions import Key

# ============================================================================
# CONFIGURATION
# ============================================================================

METRICS_TABLE_NAME = os.environ.get('METRICS_TABLE_NAME', 'opx-knowledge-retrieval-metrics')
ANALYTICS_BUCKET = os.environ.get('ANALYTICS_BUCKET', 'opx-knowledge-corpus')
ANALYTICS_PREFIX = 'analytics/'

# AWS clients
dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')

metrics_table = dynamodb.Table(METRICS_TABLE_NAME)


# ============================================================================
# QUERY ANALYSIS
# ============================================================================

def get_yesterdays_queries() -> List[Dict[str, Any]]:
    """
    Retrieve all queries from yesterday.
    
    Returns:
        List of query records
    """
    yesterday = (datetime.utcnow() - timedelta(days=1)).strftime('%Y-%m-%d')
    
    # Scan table for yesterday's queries
    # Note: This is analytics, not operational - scan is acceptable
    response = metrics_table.scan(
        FilterExpression=Key('date_query_hash').begins_with(yesterday)
    )
    
    return response.get('Items', [])


def identify_zero_result_queries(queries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Identify queries that returned zero results (knowledge gaps).
    
    Args:
        queries: List of query records
    
    Returns:
        List of zero-result queries with frequency
    """
    zero_result_queries = [q for q in queries if q.get('result_count', 0) == 0]
    
    # Count frequency
    query_counter = Counter(q.get('query_text', '') for q in zero_result_queries)
    
    # Format results
    results = [
        {
            'query': query,
            'frequency': count,
            'category': 'knowledge_gap'
        }
        for query, count in query_counter.most_common(10)
    ]
    
    return results


def identify_low_relevance_queries(queries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Identify queries with low average relevance (< 0.5).
    
    Args:
        queries: List of query records
    
    Returns:
        List of low-relevance queries
    """
    low_relevance_queries = []
    
    for q in queries:
        avg_relevance = q.get('avg_relevance_score', 0.0)
        if avg_relevance > 0 and avg_relevance < 0.5:
            low_relevance_queries.append({
                'query': q.get('query_text', ''),
                'avg_relevance': avg_relevance,
                'result_count': q.get('result_count', 0),
                'category': 'low_relevance'
            })
    
    # Sort by relevance (lowest first)
    low_relevance_queries.sort(key=lambda x: x['avg_relevance'])
    
    return low_relevance_queries[:10]


def analyze_document_usage(queries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Analyze which documents are most/least cited.
    
    Args:
        queries: List of query records
    
    Returns:
        Document usage statistics
    """
    document_citations = Counter()
    
    for q in queries:
        citations = q.get('citations', [])
        if isinstance(citations, list):
            for citation in citations:
                if isinstance(citation, dict):
                    doc_id = citation.get('source_file', 'unknown')
                    if doc_id != 'unknown':
                        document_citations[doc_id] += 1
    
    # Format results
    most_cited = [
        {'document': doc, 'citation_count': count}
        for doc, count in document_citations.most_common(10)
    ]
    
    return most_cited


# ============================================================================
# REPORT GENERATION
# ============================================================================

def generate_analytics_report(queries: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Generate daily analytics report.
    
    Args:
        queries: List of query records
    
    Returns:
        Analytics report
    """
    report_date = (datetime.utcnow() - timedelta(days=1)).strftime('%Y-%m-%d')
    
    # Calculate summary statistics
    total_queries = len(queries)
    zero_result_count = sum(1 for q in queries if q.get('result_count', 0) == 0)
    avg_latency = sum(q.get('latency_ms', 0) for q in queries) / total_queries if total_queries > 0 else 0
    
    relevance_scores = [q.get('avg_relevance_score', 0) for q in queries if q.get('avg_relevance_score', 0) > 0]
    avg_relevance = sum(relevance_scores) / len(relevance_scores) if relevance_scores else 0
    
    # Generate report
    report = {
        'report_date': report_date,
        'generated_at': datetime.utcnow().isoformat() + 'Z',
        'summary': {
            'total_queries': total_queries,
            'zero_result_count': zero_result_count,
            'zero_result_rate': (zero_result_count / total_queries * 100) if total_queries > 0 else 0,
            'avg_latency_ms': int(avg_latency),
            'avg_relevance_score': round(avg_relevance, 3)
        },
        'knowledge_gaps': identify_zero_result_queries(queries),
        'low_relevance_queries': identify_low_relevance_queries(queries),
        'document_usage': analyze_document_usage(queries)
    }
    
    return report


def upload_report_to_s3(report: Dict[str, Any]) -> str:
    """
    Upload analytics report to S3.
    
    Args:
        report: Analytics report
    
    Returns:
        S3 key
    """
    report_date = report['report_date']
    s3_key = f"{ANALYTICS_PREFIX}{report_date}/analytics-report.json"
    
    s3.put_object(
        Bucket=ANALYTICS_BUCKET,
        Key=s3_key,
        Body=json.dumps(report, indent=2),
        ContentType='application/json'
    )
    
    return s3_key


# ============================================================================
# LAMBDA HANDLER
# ============================================================================

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler for daily analytics processing.
    
    Args:
        event: EventBridge scheduled event
        context: Lambda context
    
    Returns:
        Execution summary
    """
    print(f"Analytics processor started: {json.dumps(event)}")
    
    try:
        # Retrieve yesterday's queries
        queries = get_yesterdays_queries()
        print(f"Retrieved {len(queries)} queries from yesterday")
        
        if len(queries) == 0:
            print("No queries to analyze")
            return {
                'statusCode': 200,
                'body': json.dumps({'message': 'No queries to analyze'})
            }
        
        # Generate analytics report
        report = generate_analytics_report(queries)
        print(f"Generated analytics report: {json.dumps(report['summary'])}")
        
        # Upload to S3
        s3_key = upload_report_to_s3(report)
        print(f"Uploaded report to s3://{ANALYTICS_BUCKET}/{s3_key}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Analytics report generated successfully',
                's3_key': s3_key,
                'summary': report['summary']
            })
        }
    
    except Exception as e:
        print(f"Analytics processor error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
