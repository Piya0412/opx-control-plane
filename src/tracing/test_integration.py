"""
Integration tests for LLM tracing (Phase 8.1)

Tests the end-to-end trace capture flow.
"""

import pytest
import json
from unittest.mock import patch, MagicMock


class TestTraceEmitter:
    """Test trace event emission"""

    @patch('tracing.trace_emitter.eventbridge')
    def test_emit_trace_event_success(self, mock_eventbridge):
        """Test successful trace event emission"""
        from tracing.trace_emitter import emit_trace_event
        
        # Mock successful EventBridge response
        mock_eventbridge.put_events.return_value = {
            'FailedEntryCount': 0,
            'Entries': [{'EventId': 'test-event-id'}]
        }
        
        # Emit trace event
        result = emit_trace_event(
            trace_id='test-trace-id',
            agent_id='signal-intelligence',
            incident_id='INC-001',
            execution_id='exec-123',
            prompt_text='Test prompt',
            response_text='Test response',
            prompt_tokens=10,
            response_tokens=20,
            latency=100.5,
            model='anthropic.claude-3-sonnet-20240229-v1:0',
            cost={'inputCost': 0.00003, 'outputCost': 0.0003, 'total': 0.00033}
        )
        
        assert result is True
        assert mock_eventbridge.put_events.called
        
        # Verify event structure
        call_args = mock_eventbridge.put_events.call_args
        entries = call_args[1]['Entries']
        assert len(entries) == 1
        assert entries[0]['Source'] == 'opx.langgraph'
        assert entries[0]['DetailType'] == 'LLMTraceEvent'
        
        # Verify event detail
        detail = json.loads(entries[0]['Detail'])
        assert detail['traceId'] == 'test-trace-id'
        assert detail['traceVersion'] == 'v1'
        assert detail['agentId'] == 'signal-intelligence'
        assert detail['incidentId'] == 'INC-001'

    @patch('tracing.trace_emitter.eventbridge')
    def test_emit_trace_event_failure(self, mock_eventbridge):
        """Test trace event emission failure (non-blocking)"""
        from tracing.trace_emitter import emit_trace_event
        
        # Mock EventBridge failure
        mock_eventbridge.put_events.return_value = {
            'FailedEntryCount': 1,
            'Entries': [{'ErrorCode': 'InternalFailure'}]
        }
        
        # Emit trace event
        result = emit_trace_event(
            trace_id='test-trace-id',
            agent_id='signal-intelligence',
            incident_id='INC-001',
            execution_id='exec-123',
            prompt_text='Test prompt',
            response_text='Test response',
            prompt_tokens=10,
            response_tokens=20,
            latency=100.5,
            model='anthropic.claude-3-sonnet-20240229-v1:0',
            cost={'inputCost': 0.0, 'outputCost': 0.0, 'total': 0.0}
        )
        
        # Should return False but not raise exception
        assert result is False

    @patch('tracing.trace_emitter.eventbridge')
    def test_emit_trace_event_exception(self, mock_eventbridge):
        """Test trace event emission with exception (non-blocking)"""
        from tracing.trace_emitter import emit_trace_event
        
        # Mock EventBridge exception
        mock_eventbridge.put_events.side_effect = Exception("EventBridge unavailable")
        
        # Emit trace event
        result = emit_trace_event(
            trace_id='test-trace-id',
            agent_id='signal-intelligence',
            incident_id='INC-001',
            execution_id='exec-123',
            prompt_text='Test prompt',
            response_text='Test response',
            prompt_tokens=10,
            response_tokens=20,
            latency=100.5,
            model='anthropic.claude-3-sonnet-20240229-v1:0',
            cost={'inputCost': 0.0, 'outputCost': 0.0, 'total': 0.0}
        )
        
        # Should return False but not raise exception
        assert result is False


class TestCostCalculation:
    """Test cost calculation"""

    def test_calculate_cost_sonnet(self):
        """Test cost calculation for Claude 3 Sonnet"""
        from tracing.trace_emitter import calculate_cost
        
        cost = calculate_cost(
            prompt_tokens=1000,
            response_tokens=500,
            model='anthropic.claude-3-sonnet-20240229-v1:0'
        )
        
        # Sonnet: $3/1M input, $15/1M output
        assert cost['inputCost'] == pytest.approx(0.003, rel=1e-6)
        assert cost['outputCost'] == pytest.approx(0.0075, rel=1e-6)
        assert cost['total'] == pytest.approx(0.0105, rel=1e-6)

    def test_calculate_cost_haiku(self):
        """Test cost calculation for Claude 3 Haiku"""
        from tracing.trace_emitter import calculate_cost
        
        cost = calculate_cost(
            prompt_tokens=1000,
            response_tokens=500,
            model='anthropic.claude-3-haiku-20240307-v1:0'
        )
        
        # Haiku: $0.25/1M input, $1.25/1M output
        assert cost['inputCost'] == pytest.approx(0.00025, rel=1e-6)
        assert cost['outputCost'] == pytest.approx(0.000625, rel=1e-6)
        assert cost['total'] == pytest.approx(0.000875, rel=1e-6)

    def test_calculate_cost_opus(self):
        """Test cost calculation for Claude 3 Opus"""
        from tracing.trace_emitter import calculate_cost
        
        cost = calculate_cost(
            prompt_tokens=1000,
            response_tokens=500,
            model='anthropic.claude-3-opus-20240229-v1:0'
        )
        
        # Opus: $15/1M input, $75/1M output
        assert cost['inputCost'] == pytest.approx(0.015, rel=1e-6)
        assert cost['outputCost'] == pytest.approx(0.0375, rel=1e-6)
        assert cost['total'] == pytest.approx(0.0525, rel=1e-6)


class TestModelVersion:
    """Test model version extraction"""

    def test_extract_model_version(self):
        """Test extracting version from model string"""
        from tracing.trace_emitter import extract_model_version
        
        version = extract_model_version('anthropic.claude-3-sonnet-20240229-v1:0')
        assert version == '20240229'

    def test_extract_model_version_unknown(self):
        """Test extracting version from unknown format"""
        from tracing.trace_emitter import extract_model_version
        
        version = extract_model_version('unknown-model')
        assert version == 'unknown'


class TestTraceId:
    """Test trace ID generation"""

    def test_create_trace_id(self):
        """Test trace ID creation"""
        from tracing.trace_emitter import create_trace_id
        
        trace_id = create_trace_id()
        assert isinstance(trace_id, str)
        assert len(trace_id) == 36  # UUID v4 format
        assert trace_id.count('-') == 4


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
