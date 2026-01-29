"""
Phase 8.1: Trace Processor Tests

Tests trace processor Lambda handler.
"""

import pytest
import json
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timedelta


@pytest.fixture
def mock_dynamodb_table():
    """Mock DynamoDB table."""
    with patch('boto3.resource') as mock_resource:
        mock_table = MagicMock()
        mock_resource.return_value.Table.return_value = mock_table
        yield mock_table


@pytest.fixture
def sample_eventbridge_event():
    """Sample EventBridge event (native format)."""
    return {
        "version": "0",
        "id": "event-123",
        "detail-type": "LLMTraceEvent",
        "source": "opx.langgraph",
        "account": "123456789012",
        "time": "2026-01-29T12:00:00Z",
        "region": "us-east-1",
        "detail": {
            "traceId": "trace-123",
            "timestamp": "2026-01-29T12:00:00Z",
            "agentId": "signal-intelligence",
            "incidentId": "INC-001",
            "executionId": "exec-123",
            "model": "anthropic.claude-3-sonnet",
            "modelVersion": "20240229",
            "prompt": {
                "text": "Analyze metrics",
                "tokens": 100,
                "template": "signal-analysis",
                "variables": {
                    "threshold": "95%"
                }
            },
            "response": {
                "text": "Metrics are normal",
                "tokens": 50,
                "finishReason": "stop",
                "latency": 1500
            },
            "cost": {
                "inputCost": 0.001,
                "outputCost": 0.0005,
                "total": 0.0015
            },
            "metadata": {
                "retryCount": 0,
                "guardrailsApplied": [],
                "validationStatus": "passed",
                "captureMethod": "async"
            }
        }
    }


class TestTraceProcessor:
    """Test trace processor Lambda handler."""
    
    def test_process_eventbridge_event(self, mock_dynamodb_table, sample_eventbridge_event):
        """Test processing native EventBridge event."""
        from src.tracing.trace_processor import handler
        
        response = handler(sample_eventbridge_event, None)
        
        # Verify success response
        assert response['statusCode'] == 200
        
        # Verify DynamoDB put_item called
        mock_dynamodb_table.put_item.assert_called_once()
        
        # Verify trace data structure
        call_args = mock_dynamodb_table.put_item.call_args
        item = call_args[1]['Item']
        
        assert item['traceId'] == 'trace-123'
        assert item['agentId'] == 'signal-intelligence'
        assert item['incidentId'] == 'INC-001'
        assert item['traceVersion'] == 'v1'
        assert 'ttl' in item
    
    def test_process_event_with_pii(self, mock_dynamodb_table):
        """Test processing event with PII."""
        from src.tracing.trace_processor import handler
        
        event = {
            "detail-type": "LLMTraceEvent",
            "source": "opx.langgraph",
            "detail": {
                "traceId": "trace-456",
                "timestamp": "2026-01-29T12:00:00Z",
                "agentId": "signal-intelligence",
                "incidentId": "INC-002",
                "executionId": "exec-456",
                "model": "anthropic.claude-3-sonnet",
                "modelVersion": "20240229",
                "prompt": {
                    "text": "Contact user@example.com",
                    "tokens": 50,
                    "template": "signal-analysis",
                    "variables": {}
                },
                "response": {
                    "text": "Call 555-123-4567",
                    "tokens": 30,
                    "finishReason": "stop",
                    "latency": 1000
                },
                "cost": {
                    "inputCost": 0.0005,
                    "outputCost": 0.0003,
                    "total": 0.0008
                },
                "metadata": {
                    "retryCount": 0,
                    "guardrailsApplied": [],
                    "validationStatus": "passed",
                    "captureMethod": "async"
                }
            }
        }
        
        response = handler(event, None)
        
        # Verify success
        assert response['statusCode'] == 200
        
        # Verify PII redacted
        call_args = mock_dynamodb_table.put_item.call_args
        item = call_args[1]['Item']
        
        assert '[EMAIL_REDACTED]' in item['prompt']['text']
        assert '[PHONE_REDACTED]' in item['response']['text']
        assert item['metadata']['redactionApplied'] is True
    
    def test_graceful_failure(self, mock_dynamodb_table):
        """Test graceful failure when DynamoDB fails."""
        from src.tracing.trace_processor import handler
        
        # Mock DynamoDB failure
        mock_dynamodb_table.put_item.side_effect = Exception("DynamoDB unavailable")
        
        event = {
            "detail-type": "LLMTraceEvent",
            "source": "opx.langgraph",
            "detail": {
                "traceId": "trace-789",
                "timestamp": "2026-01-29T12:00:00Z",
                "agentId": "signal-intelligence",
                "incidentId": "INC-003",
                "executionId": "exec-789",
                "model": "anthropic.claude-3-sonnet",
                "modelVersion": "20240229",
                "prompt": {
                    "text": "Analyze metrics",
                    "tokens": 100,
                    "template": "signal-analysis",
                    "variables": {}
                },
                "response": {
                    "text": "Metrics normal",
                    "tokens": 50,
                    "finishReason": "stop",
                    "latency": 1500
                },
                "cost": {
                    "inputCost": 0.001,
                    "outputCost": 0.0005,
                    "total": 0.0015
                },
                "metadata": {
                    "retryCount": 0,
                    "guardrailsApplied": [],
                    "validationStatus": "passed",
                    "captureMethod": "async"
                }
            }
        }
        
        # CRITICAL: Handler must return success even on failure
        response = handler(event, None)
        
        assert response['statusCode'] == 200
        assert 'error' in json.loads(response['body'])
    
    def test_ttl_calculation(self, mock_dynamodb_table, sample_eventbridge_event):
        """Test TTL is set to 90 days."""
        from src.tracing.trace_processor import handler
        
        before_time = datetime.now() + timedelta(days=90)
        
        handler(sample_eventbridge_event, None)
        
        after_time = datetime.now() + timedelta(days=90)
        
        # Verify TTL is approximately 90 days from now
        call_args = mock_dynamodb_table.put_item.call_args
        item = call_args[1]['Item']
        ttl = item['ttl']
        
        assert before_time.timestamp() <= ttl <= after_time.timestamp()
