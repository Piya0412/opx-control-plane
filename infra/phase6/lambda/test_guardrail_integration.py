"""
Phase 8.2: Integration Tests for Guardrail Integration

Tests end-to-end guardrail enforcement with dual block handling.
"""

import pytest
import os
from unittest.mock import Mock, patch, MagicMock
from guardrail_integration import invoke_agent_with_guardrails


@pytest.fixture
def mock_bedrock_agent():
    """Mock Bedrock Agent Runtime client."""
    with patch('guardrail_integration.bedrock_agent_runtime') as mock_client:
        yield mock_client


@pytest.fixture
def mock_violation_handler():
    """Mock guardrail violation handler."""
    with patch('guardrail_integration.handle_guardrail_violation_sync') as mock_handler:
        yield mock_handler


@pytest.fixture
def mock_env():
    """Mock environment variables."""
    with patch.dict(os.environ, {
        'GUARDRAIL_ID': 'test-guardrail-123',
        'AGENT_ALIAS_ID': 'TSTALIASID'
    }):
        yield


def test_successful_invocation_no_violation(mock_bedrock_agent, mock_violation_handler, mock_env):
    """Test successful agent invocation with no guardrail violations."""
    
    # Mock successful response with no violations
    mock_bedrock_agent.invoke_agent.return_value = {
        'output': 'This is a safe response',
        'traceId': 'trace-123'
    }
    
    state = {
        'incidentId': 'INC-001',
        'executionId': 'exec-456'
    }
    
    result = invoke_agent_with_guardrails(
        agent_id='signal-intelligence',
        input_data={'query': 'What is the status?'},
        state=state
    )
    
    # Verify agent invoked with guardrail
    assert mock_bedrock_agent.invoke_agent.called
    call_args = mock_bedrock_agent.invoke_agent.call_args[1]
    assert call_args['guardrailIdentifier'] == 'test-guardrail-123'
    assert call_args['guardrailVersion'] == '1'
    
    # Verify no violation logged
    assert not mock_violation_handler.called
    
    # Verify response returned
    assert result['output'] == 'This is a safe response'
    assert 'blocked' not in result or not result.get('blocked')


def test_response_based_block(mock_bedrock_agent, mock_violation_handler, mock_env):
    """Test response-based guardrail block (guardrailAction: BLOCKED)."""
    
    # Mock response with guardrailAction: BLOCKED
    mock_bedrock_agent.invoke_agent.return_value = {
        'guardrailAction': 'BLOCKED',
        'violationType': 'PII',
        'category': 'EMAIL',
        'confidence': 0.95,
        'traceId': 'trace-789'
    }
    
    state = {
        'incidentId': 'INC-002',
        'executionId': 'exec-012'
    }
    
    result = invoke_agent_with_guardrails(
        agent_id='historical-incident',
        input_data={'query': 'My email is user@example.com'},
        state=state
    )
    
    # Verify violation logged
    assert mock_violation_handler.called
    call_args = mock_violation_handler.call_args[1]
    assert call_args['agent_id'] == 'historical-incident'
    assert call_args['incident_id'] == 'INC-002'
    assert call_args['violation']['type'] == 'PII'
    assert call_args['violation']['action'] == 'BLOCK'
    assert call_args['violation']['confidence'] == 0.95
    
    # Verify graceful degradation returned
    assert result['blocked'] is True
    assert 'safety guardrails' in result['output']
    assert result['guardrailAction'] == 'BLOCKED'


def test_response_based_block_without_confidence(mock_bedrock_agent, mock_violation_handler, mock_env):
    """Test response-based block when confidence is absent (defaults to 1.0)."""
    
    # Mock response without confidence field
    mock_bedrock_agent.invoke_agent.return_value = {
        'guardrailAction': 'BLOCKED',
        'violationType': 'TOPIC',
        'category': 'SYSTEM_COMMAND_EXECUTION'
        # No confidence field
    }
    
    state = {
        'incidentId': 'INC-003',
        'executionId': 'exec-345'
    }
    
    result = invoke_agent_with_guardrails(
        agent_id='execution-proposal',
        input_data={'query': 'Execute rm -rf /'},
        state=state
    )
    
    # Verify confidence defaults to 1.0
    call_args = mock_violation_handler.call_args[1]
    assert call_args['violation']['confidence'] == 1.0


def test_exception_based_block(mock_bedrock_agent, mock_violation_handler, mock_env):
    """Test exception-based guardrail block (GuardrailInterventionException)."""
    
    # Mock exception
    exception = Exception("GuardrailInterventionException")
    exception.__class__.__name__ = 'GuardrailInterventionException'
    exception.violationType = 'PII'
    exception.category = 'SSN'
    exception.confidence = 0.99
    
    mock_bedrock_agent.invoke_agent.side_effect = exception
    mock_bedrock_agent.exceptions.GuardrailInterventionException = type(exception)
    
    state = {
        'incidentId': 'INC-004',
        'executionId': 'exec-678'
    }
    
    result = invoke_agent_with_guardrails(
        agent_id='change-intelligence',
        input_data={'query': 'My SSN is 123-45-6789'},
        state=state
    )
    
    # Verify violation logged
    assert mock_violation_handler.called
    call_args = mock_violation_handler.call_args[1]
    assert call_args['violation']['action'] == 'BLOCK'
    
    # Verify graceful degradation
    assert result['blocked'] is True
    assert 'safety guardrails' in result['output']


def test_warn_mode_non_blocking_violation(mock_bedrock_agent, mock_violation_handler, mock_env):
    """Test non-blocking violation (WARN mode) - response returned with logging."""
    
    # Mock response with non-blocking violation
    mock_bedrock_agent.invoke_agent.return_value = {
        'output': 'Response with mild profanity',
        'guardrailAction': 'ALLOW',
        'violationType': 'CONTENT',
        'category': 'MISCONDUCT',
        'confidence': 0.65,
        'traceId': 'trace-901'
    }
    
    state = {
        'incidentId': 'INC-005',
        'executionId': 'exec-234'
    }
    
    result = invoke_agent_with_guardrails(
        agent_id='response-strategy',
        input_data={'query': 'Input with mild profanity'},
        state=state
    )
    
    # Verify violation logged as WARN
    assert mock_violation_handler.called
    call_args = mock_violation_handler.call_args[1]
    assert call_args['violation']['action'] == 'WARN'
    assert call_args['violation']['type'] == 'CONTENT'
    
    # Verify response still returned (not blocked)
    assert result['output'] == 'Response with mild profanity'
    assert not result.get('blocked')


def test_no_guardrail_id_fallback(mock_bedrock_agent, mock_violation_handler):
    """Test fallback when GUARDRAIL_ID not set (proceeds without guardrails)."""
    
    with patch.dict(os.environ, {}, clear=True):
        mock_bedrock_agent.invoke_agent.return_value = {
            'output': 'Response without guardrails'
        }
        
        state = {
            'incidentId': 'INC-006',
            'executionId': 'exec-567'
        }
        
        result = invoke_agent_with_guardrails(
            agent_id='test-agent',
            input_data={'query': 'test query'},
            state=state
        )
        
        # Verify agent invoked without guardrail
        call_args = mock_bedrock_agent.invoke_agent.call_args[1]
        assert 'guardrailIdentifier' not in call_args
        
        # Verify no violation logged
        assert not mock_violation_handler.called
        
        # Verify response returned
        assert result['output'] == 'Response without guardrails'


def test_agent_invocation_error(mock_bedrock_agent, mock_violation_handler, mock_env):
    """Test handling of non-guardrail agent invocation errors."""
    
    # Mock non-guardrail error
    mock_bedrock_agent.invoke_agent.side_effect = Exception("Network error")
    
    state = {
        'incidentId': 'INC-007',
        'executionId': 'exec-890'
    }
    
    result = invoke_agent_with_guardrails(
        agent_id='test-agent',
        input_data={'query': 'test'},
        state=state
    )
    
    # Verify no violation logged (not a guardrail error)
    assert not mock_violation_handler.called
    
    # Verify error response
    assert 'error' in result
    assert result['blocked'] is False


def test_dual_block_handling_priority(mock_bedrock_agent, mock_violation_handler, mock_env):
    """Test that response-based blocks are checked before exception handling."""
    
    # This test verifies the order: response check → exception handling
    
    # Mock response-based block
    mock_bedrock_agent.invoke_agent.return_value = {
        'guardrailAction': 'BLOCKED',
        'violationType': 'PII'
    }
    
    state = {
        'incidentId': 'INC-008',
        'executionId': 'exec-123'
    }
    
    result = invoke_agent_with_guardrails(
        agent_id='test-agent',
        input_data={'query': 'test'},
        state=state
    )
    
    # Verify response-based block handled
    assert result['blocked'] is True
    assert mock_violation_handler.called
    
    # Verify exception handler not triggered
    call_args = mock_violation_handler.call_args[1]
    assert 'error' not in call_args['response']


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
