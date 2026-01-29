"""
Phase 8.1: Redaction Tests

Tests PII redaction logic.
"""

import pytest
from src.tracing.redaction import redact_pii, sanitize_variables, redact_trace


class TestRedactPII:
    """Test PII redaction patterns."""
    
    def test_redact_email(self):
        """Test email redaction."""
        text = "Contact me at user@example.com for details"
        redacted, was_redacted = redact_pii(text)
        
        assert redacted == "Contact me at [EMAIL_REDACTED] for details"
        assert was_redacted is True
    
    def test_redact_phone(self):
        """Test phone number redaction."""
        text = "Call 555-123-4567 for support"
        redacted, was_redacted = redact_pii(text)
        
        assert redacted == "Call [PHONE_REDACTED] for support"
        assert was_redacted is True
    
    def test_redact_ssn(self):
        """Test SSN redaction."""
        text = "SSN: 123-45-6789"
        redacted, was_redacted = redact_pii(text)
        
        assert redacted == "SSN: [SSN_REDACTED]"
        assert was_redacted is True
    
    def test_redact_aws_account(self):
        """Test AWS account ID redaction."""
        text = "Account: 123456789012"
        redacted, was_redacted = redact_pii(text)
        
        assert redacted == "Account: [AWS_ACCOUNT_REDACTED]"
        assert was_redacted is True
    
    def test_redact_aws_key(self):
        """Test AWS access key redaction."""
        text = "Key: AKIAIOSFODNN7EXAMPLE"
        redacted, was_redacted = redact_pii(text)
        
        assert redacted == "Key: [AWS_KEY_REDACTED]"
        assert was_redacted is True
    
    def test_redact_ip_address(self):
        """Test IP address redaction."""
        text = "Server at 192.168.1.100"
        redacted, was_redacted = redact_pii(text)
        
        assert redacted == "Server at [IP_REDACTED]"
        assert was_redacted is True
    
    def test_redact_multiple_pii(self):
        """Test multiple PII patterns in one text."""
        text = "Call 555-123-4567 or email user@example.com"
        redacted, was_redacted = redact_pii(text)
        
        assert "[PHONE_REDACTED]" in redacted
        assert "[EMAIL_REDACTED]" in redacted
        assert was_redacted is True
    
    def test_no_pii(self):
        """Test text with no PII."""
        text = "This is a normal message with no sensitive data"
        redacted, was_redacted = redact_pii(text)
        
        assert redacted == text
        assert was_redacted is False
    
    def test_empty_text(self):
        """Test empty text."""
        redacted, was_redacted = redact_pii("")
        
        assert redacted == ""
        assert was_redacted is False
    
    def test_none_text(self):
        """Test None text."""
        redacted, was_redacted = redact_pii(None)
        
        assert redacted is None
        assert was_redacted is False


class TestSanitizeVariables:
    """Test variable sanitization."""
    
    def test_sanitize_string_variables(self):
        """Test sanitization of string variables."""
        variables = {
            "query": "Analyze metrics",
            "threshold": "95%"
        }
        
        sanitized, was_redacted = sanitize_variables(variables)
        
        assert sanitized["query"] == "Analyze metrics"
        assert sanitized["threshold"] == "95%"
        assert was_redacted is False
    
    def test_sanitize_with_pii(self):
        """Test sanitization with PII in variables."""
        variables = {
            "email": "user@example.com",
            "message": "Normal text"
        }
        
        sanitized, was_redacted = sanitize_variables(variables)
        
        assert sanitized["email"] == "[EMAIL_REDACTED]"
        assert sanitized["message"] == "Normal text"
        assert was_redacted is True
    
    def test_sanitize_non_string_variables(self):
        """Test sanitization of non-string variables."""
        variables = {
            "count": 42,
            "enabled": True,
            "data": {"key": "value"}
        }
        
        sanitized, was_redacted = sanitize_variables(variables)
        
        assert sanitized["count"] == "42"
        assert sanitized["enabled"] == "true"
        assert '"key": "value"' in sanitized["data"]
        assert was_redacted is False
    
    def test_truncate_long_variables(self):
        """Test truncation of long variables."""
        long_text = "x" * 5000  # Exceeds MAX_VARIABLE_LENGTH
        variables = {"data": long_text}
        
        sanitized, was_redacted = sanitize_variables(variables)
        
        assert len(sanitized["data"]) < len(long_text)
        assert "[TRUNCATED]" in sanitized["data"]
        assert was_redacted is True
    
    def test_empty_variables(self):
        """Test empty variables."""
        sanitized, was_redacted = sanitize_variables({})
        
        assert sanitized == {}
        assert was_redacted is False
    
    def test_none_variables(self):
        """Test None variables."""
        sanitized, was_redacted = sanitize_variables(None)
        
        assert sanitized == {}
        assert was_redacted is False


class TestRedactTrace:
    """Test full trace redaction."""
    
    def test_redact_trace_with_pii(self):
        """Test redaction of trace with PII."""
        trace_data = {
            "traceId": "trace-123",
            "timestamp": "2026-01-29T12:00:00Z",
            "agentId": "signal-intelligence",
            "incidentId": "INC-001",
            "executionId": "exec-123",
            "model": "anthropic.claude-3-sonnet",
            "modelVersion": "20240229",
            "prompt": {
                "text": "Analyze metrics for user@example.com",
                "tokens": 100,
                "template": "signal-analysis",
                "variables": {
                    "email": "admin@company.com",
                    "threshold": "95%"
                }
            },
            "response": {
                "text": "Contact 555-123-4567 for escalation",
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
        
        redacted_trace, was_redacted = redact_trace(trace_data)
        
        # Verify PII redacted
        assert "[EMAIL_REDACTED]" in redacted_trace["prompt"]["text"]
        assert "[EMAIL_REDACTED]" in redacted_trace["prompt"]["variables"]["email"]
        assert "[PHONE_REDACTED]" in redacted_trace["response"]["text"]
        assert was_redacted is True
        
        # Verify non-PII preserved
        assert redacted_trace["traceId"] == "trace-123"
        assert redacted_trace["cost"]["total"] == 0.0015
        assert redacted_trace["prompt"]["tokens"] == 100
    
    def test_redact_trace_without_pii(self):
        """Test redaction of trace without PII."""
        trace_data = {
            "traceId": "trace-456",
            "timestamp": "2026-01-29T12:00:00Z",
            "agentId": "signal-intelligence",
            "incidentId": "INC-002",
            "executionId": "exec-456",
            "model": "anthropic.claude-3-sonnet",
            "modelVersion": "20240229",
            "prompt": {
                "text": "Analyze system metrics",
                "tokens": 50,
                "template": "signal-analysis",
                "variables": {
                    "threshold": "95%"
                }
            },
            "response": {
                "text": "Metrics are within normal range",
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
        
        redacted_trace, was_redacted = redact_trace(trace_data)
        
        # Verify no redaction occurred
        assert redacted_trace["prompt"]["text"] == "Analyze system metrics"
        assert redacted_trace["response"]["text"] == "Metrics are within normal range"
        assert was_redacted is False
