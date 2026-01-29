"""
Phase 8.2: Unit Tests for Guardrail Handler

Tests guardrail violation logging with confidence defaults and dual block handling.
"""

import pytest
import os
import sys
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tracing.guardrail_handler import handle_guardrail_violation_sync


@pytest.fixture
def mock_dynamodb():
    """Mock DynamoDB table."""
    with patch('tracing.guardrail_handler.violations_table') as mock_table:
        yield mock_table


@pytest.fixture
def mock_cloudwatch():
    """Mock CloudWatch client."""
    with patch('tracing.guardrail_handler.cloudwatch') as mock_cw:
        yield mock_cw


@pytest.fixture
def mock_env():
    """Mock environment variables."""
    with patch.dict(os.environ, {
        'GUARDRAIL_VIOLATIONS_TABLE': 'test-violations-table',
        'GUARDRAIL_ID': 'test-guardrail-id'
    }):
        yield


def test_pii_violation_with_confidence(mock_dynamodb, mock_cloudwatch, mock_env):
    """Test PII violation logging with confidence provided."""
    
    violation = {
        'type': 'PII',
        'action': 'BLOCK',
        'category': 'EMAIL',
        'confidence': 0.95
    }
    
    response = {
        'model': 'claude-3-sonnet'
    }
    
    handle_guardrail_violation_sync(
        agent_id='signal-intelligence',
        incident_id='INC-001',
        execution_id='exec-456',
        trace_id='trace-123',
        violation=violation,
        input_text='My email is user@example.com',
        response=response
    )
    
    # Verify DynamoDB put_item called
    assert mock_dynamodb.put_item.called
    item = mock_dynamodb.put_item.call_args[1]['Item']
    
    # Verify violation structure
    assert item['agentId'] == 'signal-intelligence'
    assert item['incidentId'] == 'INC-001'
    assert item['executionId'] == 'exec-456'
    assert item['traceId'] == 'trace-123'
    assert item['violation']['type'] == 'PII'
    assert item['violation']['action'] == 'BLOCK'
    assert item['violation']['category'] == 'EMAIL'
    assert item['violation']['confidence'] == 0.95
    assert item['response']['blocked'] is True
    
    # Verify CloudWatch metric emitted
    assert mock_cloudwatch.put_metric_data.called
    metric_data = mock_cloudwatch.put_metric_data.call_args[1]['MetricData'][0]
    assert metric_data['MetricName'] == 'ViolationCount'
    assert metric_data['Value'] == 1
    
    # Verify dimensions (no incidentId!)
    dimensions = {d['Name']: d['Value'] for d in metric_data['Dimensions']}
    assert dimensions['AgentId'] == 'signal-intelligence'
    assert dimensions['ViolationType'] == 'PII'
    assert dimensions['Action'] == 'BLOCK'
    assert 'IncidentId' not in dimensions


def test_pii_violation_without_confidence(mock_dynamodb, mock_cloudwatch, mock_env):
    """Test PII violation logging when confidence is absent (defaults to 1.0)."""
    
    violation = {
        'type': 'PII',
        'action': 'BLOCK',
        'category': 'SSN'
        # No confidence field
    }
    
    response = {}
    
    handle_guardrail_violation_sync(
        agent_id='historical-incident',
        incident_id='INC-002',
        execution_id='exec-012',
        trace_id='trace-789',
        violation=violation,
        input_text='My SSN is 123-45-6789',
        response=response
    )
    
    # Verify confidence defaults to 1.0
    item = mock_dynamodb.put_item.call_args[1]['Item']
    assert item['violation']['confidence'] == 1.0


def test_content_violation_warn_mode(mock_dynamodb, mock_cloudwatch, mock_env):
    """Test content filter violation in WARN mode (not blocked)."""
    
    violation = {
        'type': 'CONTENT',
        'action': 'WARN',
        'category': 'HATE',
        'threshold': 'MEDIUM',
        'confidence': 0.75
    }
    
    response = {
        'traceId': 'trace-345',
        'executionId': 'exec-678',
        'output': 'This response contains mild profanity'
    }
    
    handle_guardrail_violation_sync(
        agent_id='response-strategy',
        incident_id='INC-003',
        violation=violation,
        input_text='Input with mild profanity',
        response=response
    )
    
    # Verify not blocked
    item = mock_dynamodb.put_item.call_args[1]['Item']
    assert item['violation']['action'] == 'WARN'
    assert item['response']['blocked'] is False
    assert item['response']['retryAllowed'] is True
    
    # Verify metric shows WARN action
    metric_data = mock_cloudwatch.put_metric_data.call_args[1]['MetricData'][0]
    dimensions = {d['Name']: d['Value'] for d in metric_data['Dimensions']}
    assert dimensions['Action'] == 'WARN'


def test_topic_denial_violation(mock_dynamodb, mock_cloudwatch, mock_env):
    """Test topic denial violation (BLOCK mode)."""
    
    violation = {
        'type': 'TOPIC',
        'action': 'BLOCK',
        'category': 'SYSTEM_COMMAND_EXECUTION',
        'confidence': 0.99
    }
    
    response = {
        'traceId': 'trace-901',
        'executionId': 'exec-234'
    }
    
    handle_guardrail_violation_sync(
        agent_id='execution-proposal',
        incident_id='INC-004',
        violation=violation,
        input_text='Execute rm -rf /production',
        response=response
    )
    
    # Verify blocked
    item = mock_dynamodb.put_item.call_args[1]['Item']
    assert item['violation']['type'] == 'TOPIC'
    assert item['violation']['action'] == 'BLOCK'
    assert item['response']['blocked'] is True


def test_pii_redaction(mock_dynamodb, mock_cloudwatch, mock_env):
    """Test that PII is redacted before storage."""
    
    violation = {
        'type': 'PII',
        'action': 'BLOCK',
        'category': 'EMAIL'
    }
    
    response = {'traceId': 'trace-567'}
    
    handle_guardrail_violation_sync(
        agent_id='signal-intelligence',
        incident_id='INC-005',
        violation=violation,
        input_text='Contact me at john.doe@example.com',
        response=response
    )
    
    # Verify input is redacted
    item = mock_dynamodb.put_item.call_args[1]['Item']
    assert 'john.doe@example.com' not in item['content']['input']
    assert '[EMAIL]' in item['content']['input']
    
    # Verify detected text is always redacted
    assert item['content']['detectedText'] == '[REDACTED]'


def test_dynamodb_failure_non_blocking(mock_dynamodb, mock_cloudwatch, mock_env, capfd):
    """Test that DynamoDB failures don't raise exceptions (non-blocking)."""
    
    # Make DynamoDB fail
    mock_dynamodb.put_item.side_effect = Exception("DynamoDB error")
    
    violation = {
        'type': 'PII',
        'action': 'BLOCK'
    }
    
    # Should not raise exception
    handle_guardrail_violation_sync(
        agent_id='test-agent',
        incident_id='INC-006',
        violation=violation,
        input_text='test input',
        response={}
    )
    
    # Verify error logged
    captured = capfd.readouterr()
    assert 'ERROR: Failed to log guardrail violation' in captured.out


def test_cloudwatch_failure_non_blocking(mock_dynamodb, mock_cloudwatch, mock_env, capfd):
    """Test that CloudWatch failures don't raise exceptions (non-blocking)."""
    
    # Make CloudWatch fail
    mock_cloudwatch.put_metric_data.side_effect = Exception("CloudWatch error")
    
    violation = {
        'type': 'CONTENT',
        'action': 'WARN'
    }
    
    # Should not raise exception
    handle_guardrail_violation_sync(
        agent_id='test-agent',
        incident_id='INC-007',
        violation=violation,
        input_text='test input',
        response={}
    )
    
    # Verify error logged
    captured = capfd.readouterr()
    assert 'ERROR: Failed to emit guardrail metric' in captured.out


def test_missing_optional_fields(mock_dynamodb, mock_cloudwatch, mock_env):
    """Test handling of missing optional fields."""
    
    # Minimal violation with only required fields
    violation = {
        'type': 'UNKNOWN',
        'action': 'BLOCK'
        # No category, threshold, confidence
    }
    
    # Minimal response
    response = {}
    
    handle_guardrail_violation_sync(
        agent_id='test-agent',
        incident_id='INC-008',
        violation=violation,
        input_text='test',
        response=response
    )
    
    # Verify defaults applied
    item = mock_dynamodb.put_item.call_args[1]['Item']
    assert item['violation']['confidence'] == 1.0
    assert item['violation']['category'] is None
    assert item['violation']['threshold'] is None
    assert item['traceId'] == 'unknown'
    assert item['executionId'] == 'unknown'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
