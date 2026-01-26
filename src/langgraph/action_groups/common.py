#!/usr/bin/env python3
"""
Phase 6 Week 5 Task 3: Common Action Group Utilities

Provides:
- AWS client factory (region-locked)
- Timeout guard
- Deterministic sorting helpers
- Safe response builders

CRITICAL RULES:
- All tools complete ≤ 2 seconds
- Return partial data on failure
- Deterministic output ordering
- No exceptions escape
"""

import time
from datetime import datetime
from typing import Any, Dict, List, Optional
import boto3
import os


# ============================================================================
# AWS CLIENT FACTORY
# ============================================================================

def get_aws_client(service_name: str, region: Optional[str] = None):
    """
    Create AWS service client with region lock.
    
    Args:
        service_name: AWS service (e.g., 'cloudwatch', 'logs', 'xray')
        region: AWS region (defaults to Lambda's region)
    
    Returns:
        Boto3 client
    """
    if region is None:
        region = os.environ.get('AWS_REGION', 'us-east-1')
    
    return boto3.client(service_name, region_name=region)


# ============================================================================
# TIMEOUT GUARD
# ============================================================================

class TimeoutGuard:
    """
    Enforces 2-second hard timeout on tool execution.
    
    Usage:
        guard = TimeoutGuard()
        result = aws_call()
        duration_ms = guard.elapsed_ms()
    """
    
    def __init__(self, max_duration_ms: int = 2000):
        self.start_time = time.monotonic()
        self.max_duration_ms = max_duration_ms
    
    def elapsed_ms(self) -> int:
        """Return elapsed time in milliseconds."""
        return int((time.monotonic() - self.start_time) * 1000)
    
    def is_timeout(self) -> bool:
        """Check if timeout exceeded."""
        return self.elapsed_ms() >= self.max_duration_ms
    
    def remaining_ms(self) -> int:
        """Return remaining time in milliseconds."""
        return max(0, self.max_duration_ms - self.elapsed_ms())


# ============================================================================
# DETERMINISTIC SORTING
# ============================================================================

def sort_by_timestamp(items: List[Dict], timestamp_key: str = 'timestamp') -> List[Dict]:
    """
    Sort items by timestamp (ascending, deterministic).
    
    Args:
        items: List of dictionaries
        timestamp_key: Key containing timestamp
    
    Returns:
        Sorted list
    """
    return sorted(items, key=lambda x: x.get(timestamp_key, ''))


def sort_by_name(items: List[Dict], name_key: str = 'name') -> List[Dict]:
    """
    Sort items by name (alphabetical, deterministic).
    
    Args:
        items: List of dictionaries
        name_key: Key containing name
    
    Returns:
        Sorted list
    """
    return sorted(items, key=lambda x: x.get(name_key, ''))


def sort_by_score(items: List[Dict], score_key: str = 'score', descending: bool = True) -> List[Dict]:
    """
    Sort items by score (deterministic).
    
    Args:
        items: List of dictionaries
        score_key: Key containing score
        descending: Sort order (default: highest first)
    
    Returns:
        Sorted list
    """
    return sorted(items, key=lambda x: x.get(score_key, 0), reverse=descending)


# ============================================================================
# SAFE RESPONSE BUILDERS
# ============================================================================

def success_response(
    data: List[Dict],
    source: str,
    duration_ms: int,
    metadata: Optional[Dict] = None,
) -> Dict[str, Any]:
    """
    Build SUCCESS response.
    
    Args:
        data: Result data
        source: AWS service name
        duration_ms: Execution duration
        metadata: Optional metadata
    
    Returns:
        Standardized response
    """
    response = {
        'status': 'SUCCESS',
        'data': data,
        'source': source,
        'queried_at': datetime.utcnow().isoformat(),
        'duration_ms': duration_ms,
        'error': None,
    }
    
    if metadata:
        response['metadata'] = metadata
    
    return response


def partial_response(
    data: List[Dict],
    source: str,
    duration_ms: int,
    reason: str,
) -> Dict[str, Any]:
    """
    Build PARTIAL response (timeout or incomplete data).
    
    Args:
        data: Partial result data
        source: AWS service name
        duration_ms: Execution duration
        reason: Why partial
    
    Returns:
        Standardized response
    """
    return {
        'status': 'PARTIAL',
        'data': data,
        'source': source,
        'queried_at': datetime.utcnow().isoformat(),
        'duration_ms': duration_ms,
        'error': reason,
    }


def failed_response(
    source: str,
    duration_ms: int,
    error: Exception,
) -> Dict[str, Any]:
    """
    Build FAILED response (error occurred).
    
    Args:
        source: AWS service name
        duration_ms: Execution duration
        error: Exception that occurred
    
    Returns:
        Standardized response
    """
    return {
        'status': 'FAILED',
        'data': [],
        'source': source,
        'queried_at': datetime.utcnow().isoformat(),
        'duration_ms': duration_ms,
        'error': f"{type(error).__name__}: {str(error)}",
    }


# ============================================================================
# BOUNDED OUTPUT HELPERS
# ============================================================================

def truncate_data(data: List[Dict], max_items: int = 20) -> List[Dict]:
    """
    Truncate data to max items (bounded output).
    
    Args:
        data: List of items
        max_items: Maximum items to return
    
    Returns:
        Truncated list
    """
    return data[:max_items]


def truncate_string(s: str, max_length: int = 1000) -> str:
    """
    Truncate string to max length.
    
    Args:
        s: String to truncate
        max_length: Maximum length
    
    Returns:
        Truncated string
    """
    if len(s) <= max_length:
        return s
    return s[:max_length] + '...[truncated]'


# ============================================================================
# TIME WINDOW HELPERS
# ============================================================================

def parse_iso_timestamp(timestamp: str) -> datetime:
    """
    Parse ISO-8601 timestamp.
    
    Args:
        timestamp: ISO-8601 string
    
    Returns:
        datetime object
    """
    # Handle both with and without microseconds
    for fmt in ['%Y-%m-%dT%H:%M:%S.%fZ', '%Y-%m-%dT%H:%M:%SZ', '%Y-%m-%dT%H:%M:%S']:
        try:
            return datetime.strptime(timestamp.replace('+00:00', 'Z'), fmt)
        except ValueError:
            continue
    
    # Fallback: use fromisoformat
    return datetime.fromisoformat(timestamp.replace('Z', '+00:00'))


def validate_time_window(start_time: str, end_time: str) -> bool:
    """
    Validate time window is reasonable.
    
    Args:
        start_time: ISO-8601 start
        end_time: ISO-8601 end
    
    Returns:
        True if valid
    """
    try:
        start = parse_iso_timestamp(start_time)
        end = parse_iso_timestamp(end_time)
        
        # Must be chronological
        if start >= end:
            return False
        
        # Must be within 30 days
        delta = end - start
        if delta.days > 30:
            return False
        
        return True
    
    except Exception:
        return False
