"""
Unit tests for PII redaction (Phase 8.1)

Tests the redaction logic for LLM traces to ensure PII is properly removed.
"""

import pytest
from tracing.redaction import redact_pii, sanitize_variables, redact_trace_data


class TestRedactPII:
    """Test PII redaction from text"""

    def test_redact_email(self):
        """Test that email addresses are redacted"""
        text = "Contact me at user@example.com"
        redacted, was_redacted = redact_pii(text)
        assert redacted == "Contact me at [EMAIL_REDACTED]"
        assert was_redacted is True

    def test_redact_multiple_pii(self):
        """Test that multiple PII types are redacted"""
        text = "Call 555-123-4567 or email user@example.com"
        redacted, was_redacted = redact_pii(text)
        assert "[PHONE_REDACTED]" in redacted
        assert "[EMAIL_REDACTED]" in redacted
        assert was_redacted is True

    def test_no_pii(self):
        """Test that text without PII is unchanged"""
        text = "This is a normal message"
        redacted, was_redacted = redact_pii(text)
        assert redacted == text
        assert was_redacted is False

    def test_redact_ssn(self):
        """Test that SSN is redacted"""
        text = "My SSN is 123-45-6789"
        redacted, was_redacted = redact_pii(text)
        assert "[SSN_REDACTED]" in redacted
        assert "123-45-6789" not in redacted
        assert was_redacted is True

    def test_redact_aws_account(self):
        """Test that AWS account IDs are redacted"""
        text = "Account: 123456789012"
        redacted, was_redacted = redact_pii(text)
        assert "[AWS_ACCOUNT_REDACTED]" in redacted
        assert "123456789012" not in redacted
        assert was_redacted is True

    def test_redact_aws_key(self):
        """Test that AWS access keys are redacted"""
        text = "Key: AKIAIOSFODNN7EXAMPLE"
        redacted, was_redacted = redact_pii(text)
        assert "[AWS_KEY_REDACTED]" in redacted
        assert "AKIAIOSFODNN7EXAMPLE" not in redacted
        assert was_redacted is True

    def test_redact_ip_address(self):
        """Test that IP addresses are redacted"""
        text = "Server at 192.168.1.1"
        redacted, was_redacted = redact_pii(text)
        assert "[IP_REDACTED]" in redacted
        assert "192.168.1.1" not in redacted
        assert was_redacted is True

    def test_empty_text(self):
        """Test that empty text is handled"""
        text = ""
        redacted, was_redacted = redact_pii(text)
        assert redacted == ""
        assert was_redacted is False

    def test_none_text(self):
        """Test that None is handled"""
        text = None
        redacted, was_redacted = redact_pii(text)
        assert redacted is None
        assert was_redacted is False


class TestSanitizeVariables:
    """Test variable sanitization"""

    def test_stringify_dict(self):
        """Test that dict values are stringified"""
        variables = {"config": {"key": "value"}}
        sanitized = sanitize_variables(variables)
        assert isinstance(sanitized["config"], str)
        assert "key" in sanitized["config"]

    def test_stringify_list(self):
        """Test that list values are stringified"""
        variables = {"items": [1, 2, 3]}
        sanitized = sanitize_variables(variables)
        assert isinstance(sanitized["items"], str)
        assert "1" in sanitized["items"]

    def test_stringify_number(self):
        """Test that number values are stringified"""
        variables = {"count": 42}
        sanitized = sanitize_variables(variables)
        assert isinstance(sanitized["count"], str)
        assert sanitized["count"] == "42"

    def test_redact_pii_in_variables(self):
        """Test that PII is redacted from variables"""
        variables = {
            "email": "user@example.com",
            "phone": "555-123-4567"
        }
        sanitized = sanitize_variables(variables)
        assert "[EMAIL_REDACTED]" in sanitized["email"]
        assert "[PHONE_REDACTED]" in sanitized["phone"]

    def test_truncate_large_variable(self):
        """Test that large variables are truncated"""
        large_value = "a" * 3000  # 3KB of 'a' characters (won't match PII patterns)
        variables = {"large": large_value}
        sanitized = sanitize_variables(variables)
        assert len(sanitized["large"]) <= 2048 + len("...[TRUNCATED]")
        assert "[TRUNCATED]" in sanitized["large"]

    def test_empty_variables(self):
        """Test that empty dict is handled"""
        variables = {}
        sanitized = sanitize_variables(variables)
        assert sanitized == {}

    def test_none_variables(self):
        """Test that None is handled"""
        variables = None
        sanitized = sanitize_variables(variables)
        assert sanitized == {}

    def test_string_variable_unchanged(self):
        """Test that string variables are passed through"""
        variables = {"message": "hello world"}
        sanitized = sanitize_variables(variables)
        assert sanitized["message"] == "hello world"


class TestRedactTraceData:
    """Test full trace data redaction"""

    def test_redact_prompt_and_response(self):
        """Test that both prompt and response are redacted"""
        trace_data = {
            "prompt": {
                "text": "Email user@example.com",
                "tokens": 10
            },
            "response": {
                "text": "Call 555-123-4567",
                "tokens": 5
            }
        }
        redacted, was_redacted = redact_trace_data(trace_data)
        assert "[EMAIL_REDACTED]" in redacted["prompt"]["text"]
        assert "[PHONE_REDACTED]" in redacted["response"]["text"]
        assert was_redacted is True

    def test_sanitize_prompt_variables(self):
        """Test that prompt variables are sanitized"""
        trace_data = {
            "prompt": {
                "text": "Query",
                "variables": {
                    "email": "user@example.com",
                    "count": 42
                }
            }
        }
        redacted, was_redacted = redact_trace_data(trace_data)
        assert "[EMAIL_REDACTED]" in redacted["prompt"]["variables"]["email"]
        assert redacted["prompt"]["variables"]["count"] == "42"
        assert was_redacted is True

    def test_no_pii_in_trace(self):
        """Test that traces without PII are unchanged"""
        trace_data = {
            "prompt": {
                "text": "Normal query",
                "tokens": 5
            },
            "response": {
                "text": "Normal response",
                "tokens": 5
            }
        }
        redacted, was_redacted = redact_trace_data(trace_data)
        assert redacted["prompt"]["text"] == "Normal query"
        assert redacted["response"]["text"] == "Normal response"
        assert was_redacted is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
