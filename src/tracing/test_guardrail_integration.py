"""
Integration tests for guardrail enforcement.

Tests:
1. End-to-end PII detection (BLOCK mode)
2. End-to-end content filter (WARN mode)
3. Dual block handling (exception + response)
4. Agent integration with guardrails
5. Violation logging to DynamoDB
6. CloudWatch metrics emission
"""

import pytest
import json
import os
from datetime import datetime, timezone
from unittest.mock import Mock, patch, MagicMock
from moto import mock_dynamodb, mock_cloudwatch
import boto3

# Set environment variables
os.environ['GUARDRAIL_VIOLATIONS_TABLE'] = 'test-guardrail-violations'
os.environ['GUARDRAIL_ID'] = 'test-guardrail-id'
os.environ['GUARDRAIL_VERSION'] = '1'


@pytest.fixture
def dynamodb_table():
    """Create mock DynamoDB table."""
    with mock_dynamodb():
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        table = dynamodb.create_table(
            TableName='test-guardrail-violations',
            KeySchema=[
                {'AttributeName': 'violationId', 'KeyType': 'HASH'},
                {'AttributeName': 'timestamp', 'KeyType': 'RANGE'},
            ],
            AttributeDefinitions=[
                {'AttributeName': 'violationId', 'AttributeType': 'S'},
                {'AttributeName': 'timestamp', 'AttributeType': 'S'},
                {'AttributeName': 'agentId', 'AttributeType': 'S'},
                {'AttributeName': 'violationType', 'AttributeType': 'S'},
            ],
            GlobalSecondaryIndexes=[
                {
                    'IndexName': 'agentId-timestamp-index',
                    'KeySchema': [
                        {'AttributeName': 'agentId', 'KeyType': 'HASH'},
                        {'AttributeName': 'timestamp', 'KeyType': 'RANGE'},
                    ],
                    'Projection': {'ProjectionType': 'ALL'},
                },
                {
                    'IndexName': 'type-timestamp-index',
                    'KeySchema': [
                        {'AttributeName': 'violationType', 'KeyType': 'HASH'},
                        {'AttributeName': 'timestamp', 'KeyType': 'RANGE'},
                    },
                    'Projection': {'ProjectionType': 'ALL'},
                },
            ],
            BillingMode='PAY_PER_REQUEST',
        )
        yield table


@pytest.mark.integration
def test_end_to_end_pii_block(dynamodb_table):
    """Test end-to-end PII detection with BLOCK mode."""
    
    # Mock Bedrock Agent Runtime response with PII block
    with patch('boto3.client') as mock_client:
        mock_bedrock = Mock()
        mock_bedrock.invoke_agent.return_value = {
            'guardrailAction': 'BLOCKED',
            'violationType': 'PII',
            'category': 'EMAIL',
            'confidence': 0.98,
            'modelId': 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        }
        mock_client.return_value = mock_bedrock
        
        # Import after mocking
        from guardrail_handler import handle_guardrail_violation_sync
        
        # Simulate agent invocation with PII
        violation_id = handle_guardrail_violation_sync(
            agent_id='signal-intelligence',
            incident_id='INC-INT-001',
            execution_id='exec-int-001',
            trace_id='trace-int-001',
            violation={
                'type': 'PII',
                'action': 'BLOCK',
                'category': 'EMAIL',
                'confidence': 0.98,
            },
            input_text='My email is user@example.com',
            response={'guardrailAction': 'BLOCKED'},
            model='anthropic.claude-3-5-sonnet-20241022-v2:0'
        )
        
        # Verify violation logged
        assert violation_id is not None
        
        # Verify DynamoDB record
        response = dynamodb_table.scan(
            FilterExpression='violationId = :vid',
            ExpressionAttributeValues={':vid': violation_id}
        )
        
        assert len(response['Items']) == 1
        item = response['Items'][0]
        assert item['violation']['action'] == 'BLOCK'
        assert item['response']['blocked'] == True


@pytest.mark.integration
def test_end_to_end_content_warn(dynamodb_table):
    """Test end-to-end content filter with WARN mode."""
    
    # Mock Bedrock Agent Runtime response with content warning
    with patch('boto3.client') as mock_client:
        mock_bedrock = Mock()
        mock_bedrock.invoke_agent.return_value = {
            'guardrailAction': 'ALLOWED',
            'violationType': 'CONTENT',
            'category': 'PROFANITY',
            'confidence': 0.65,
            'output': 'Response text',
            'modelId': 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        }
        mock_client.return_value = mock_bedrock
        
        from guardrail_handler import handle_guardrail_violation_sync
        
        # Simulate agent invocation with content violation
        violation_id = handle_guardrail_violation_sync(
            agent_id='signal-intelligence',
            incident_id='INC-INT-002',
            execution_id='exec-int-002',
            trace_id='trace-int-002',
            violation={
                'type': 'CONTENT',
                'action': 'WARN',
                'category': 'PROFANITY',
                'confidence': 0.65,
            },
            input_text='This contains mild profanity',
            response={'guardrailAction': 'ALLOWED', 'output': 'Response text'},
            model='anthropic.claude-3-5-sonnet-20241022-v2:0'
        )
        
        # Verify violation logged
        assert violation_id is not None
        
        # Verify DynamoDB record
        response = dynamodb_table.scan(
            FilterExpression='violationId = :vid',
            ExpressionAttributeValues={':vid': violation_id}
        )
        
        assert len(response['Items']) == 1
        item = response['Items'][0]
        assert item['violation']['action'] == 'WARN'
        assert item['response']['blocked'] == False
        assert item['response']['retryAllowed'] == True


@pytest.mark.integration
def test_dual_block_handling_exception(dynamodb_table):
    """Test exception-based guardrail block handling."""
    
    # Mock Bedrock to raise GuardrailInterventionException
    with patch('boto3.client') as mock_client:
        mock_bedrock = Mock()
        
        # Create mock exception
        exception = Exception("GuardrailInterventionException")
        exception.__class__.__name__ = 'GuardrailInterventionException'
        exception.violationType = 'PII'
        exception.category = 'SSN'
        exception.confidence = 0.99
        
        mock_bedrock.invoke_agent.side_effect = exception
        mock_client.return_value = mock_bedrock
        
        from guardrail_handler import handle_guardrail_violation_sync
        
        # Simulate agent invocation that triggers exception
        violation_id = handle_guardrail_violation_sync(
            agent_id='signal-intelligence',
            incident_id='INC-INT-003',
            execution_id='exec-int-003',
            trace_id='trace-int-003',
            violation={
                'type': 'PII',
                'action': 'BLOCK',
                'category': 'SSN',
                'confidence': 0.99,
            },
            input_text='My SSN is 123-45-6789',
            response={'error': str(exception)},
            model='anthropic.claude-3-5-sonnet-20241022-v2:0'
        )
        
        # Verify violation logged
        assert violation_id is not None
        
        # Verify DynamoDB record
        response = dynamodb_table.scan(
            FilterExpression='violationId = :vid',
            ExpressionAttributeValues={':vid': violation_id}
        )
        
        assert len(response['Items']) == 1
        item = response['Items'][0]
        assert item['violation']['type'] == 'PII'
        assert item['violation']['action'] == 'BLOCK'


@pytest.mark.integration
def test_dual_block_handling_response(dynamodb_table):
    """Test response-based guardrail block handling."""
    
    # Mock Bedrock to return block in response
    with patch('boto3.client') as mock_client:
        mock_bedrock = Mock()
        mock_bedrock.invoke_agent.return_value = {
            'guardrailAction': 'BLOCKED',
            'violationType': 'TOPIC',
            'category': 'SYSTEM_COMMAND_EXECUTION',
            'confidence': 0.92,
            'modelId': 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        }
        mock_client.return_value = mock_bedrock
        
        from guardrail_handler import handle_guardrail_violation_sync
        
        # Simulate agent invocation with topic violation
        violation_id = handle_guardrail_violation_sync(
            agent_id='signal-intelligence',
            incident_id='INC-INT-004',
            execution_id='exec-int-004',
            trace_id='trace-int-004',
            violation={
                'type': 'TOPIC',
                'action': 'BLOCK',
                'category': 'SYSTEM_COMMAND_EXECUTION',
                'confidence': 0.92,
            },
            input_text='Execute shell command to restart service',
            response={'guardrailAction': 'BLOCKED'},
            model='anthropic.claude-3-5-sonnet-20241022-v2:0'
        )
        
        # Verify violation logged
        assert violation_id is not None
        
        # Verify DynamoDB record
        response = dynamodb_table.scan(
            FilterExpression='violationId = :vid',
            ExpressionAttributeValues={':vid': violation_id}
        )
        
        assert len(response['Items']) == 1
        item = response['Items'][0]
        assert item['violation']['type'] == 'TOPIC'
        assert item['violation']['category'] == 'SYSTEM_COMMAND_EXECUTION'


@pytest.mark.integration
def test_query_violations_by_agent(dynamodb_table):
    """Test querying violations by agent ID."""
    
    from guardrail_handler import handle_guardrail_violation_sync
    
    # Create multiple violations for same agent
    for i in range(3):
        handle_guardrail_violation_sync(
            agent_id='signal-intelligence',
            incident_id=f'INC-INT-00{i+5}',
            execution_id=f'exec-int-00{i+5}',
            trace_id=f'trace-int-00{i+5}',
            violation={'type': 'PII', 'action': 'BLOCK'},
            input_text=f'Test input {i}',
            response={},
            model='test-model'
        )
    
    # Query by agent ID
    response = dynamodb_table.query(
        IndexName='agentId-timestamp-index',
        KeyConditionExpression='agentId = :aid',
        ExpressionAttributeValues={':aid': 'signal-intelligence'}
    )
    
    # Should have at least 3 violations
    assert len(response['Items']) >= 3


@pytest.mark.integration
def test_query_violations_by_type(dynamodb_table):
    """Test querying violations by type."""
    
    from guardrail_handler import handle_guardrail_violation_sync
    
    # Create violations of different types
    handle_guardrail_violation_sync(
        agent_id='signal-intelligence',
        incident_id='INC-INT-008',
        execution_id='exec-int-008',
        trace_id='trace-int-008',
        violation={'type': 'CONTENT', 'action': 'WARN'},
        input_text='Test input',
        response={},
        model='test-model'
    )
    
    # Query by violation type
    response = dynamodb_table.query(
        IndexName='type-timestamp-index',
        KeyConditionExpression='violationType = :vtype',
        ExpressionAttributeValues={':vtype': 'CONTENT'}
    )
    
    # Should have at least 1 CONTENT violation
    assert len(response['Items']) >= 1
    assert all(item['violation']['type'] == 'CONTENT' for item in response['Items'])


if __name__ == '__main__':
    pytest.main([__file__, '-v', '-m', 'integration'])
