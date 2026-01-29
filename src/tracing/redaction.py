"""
PII Redaction for LLM Traces (Phase 8.1)

CRITICAL: This must run BEFORE storage/logging, AFTER cost computation.

Redaction Order:
1. Cost computation (uses raw tokens)
2. Redaction (this module)
3. Storage (DynamoDB)
"""

import re
import json
from typing import Dict, Tuple

# PII patterns to redact
PII_PATTERNS = {
    'email': (
        r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
        '[EMAIL_REDACTED]'
    ),
    'phone': (
        r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b',
        '[PHONE_REDACTED]'
    ),
    'ssn': (
        r'\b\d{3}-\d{2}-\d{4}\b',
        '[SSN_REDACTED]'
    ),
    'aws_account': (
        r'\b\d{12}\b',
        '[AWS_ACCOUNT_REDACTED]'
    ),
    'aws_access_key': (
        r'AKIA[0-9A-Z]{16}',
        '[AWS_KEY_REDACTED]'
    ),
    'ip_address': (
        r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b',
        '[IP_REDACTED]'
    ),
}

def redact_pii(text: str) -> Tuple[str, bool]:
    """
    Redact PII from text.
    
    Args:
        text: Text to redact
        
    Returns:
        Tuple of (redacted_text, was_redacted)
        
    Example:
        >>> redact_pii("Email me at user@example.com")
        ("Email me at [EMAIL_REDACTED]", True)
    """
    if not text:
        return text, False
    
    redacted = text
    was_redacted = False
    
    for pattern_name, (pattern, replacement) in PII_PATTERNS.items():
        if re.search(pattern, redacted):
            redacted = re.sub(pattern, replacement, redacted)
            was_redacted = True
    
    return redacted, was_redacted


def sanitize_variables(variables: Dict) -> Dict[str, str]:
    """
    Convert variables to safe string format.
    
    CRITICAL STEPS:
    1. Stringify all values (prevent object/credential leakage)
    2. Redact PII from each value
    3. Truncate to 2KB per variable (prevent storage bloat)
    
    Args:
        variables: Dictionary of prompt variables
        
    Returns:
        Dictionary with sanitized string values
        
    Example:
        >>> sanitize_variables({"email": "user@example.com", "count": 42})
        {"email": "[EMAIL_REDACTED]", "count": "42"}
    """
    if not variables:
        return {}
    
    sanitized = {}
    MAX_VAR_LENGTH = 2048  # 2KB per variable
    
    for key, value in variables.items():
        # Step 1: Stringify
        if isinstance(value, str):
            str_value = value
        else:
            try:
                str_value = json.dumps(value, default=str)
            except (TypeError, ValueError):
                str_value = str(value)
        
        # Step 2: Redact PII
        redacted_value, _ = redact_pii(str_value)
        
        # Step 3: Truncate
        if len(redacted_value) > MAX_VAR_LENGTH:
            redacted_value = redacted_value[:MAX_VAR_LENGTH] + "...[TRUNCATED]"
        
        sanitized[key] = redacted_value
    
    return sanitized


def redact_trace_data(trace_data: Dict) -> Tuple[Dict, bool]:
    """
    Redact PII from complete trace data.
    
    Args:
        trace_data: Trace event data
        
    Returns:
        Tuple of (redacted_trace_data, was_redacted)
    """
    redacted_trace = trace_data.copy()
    any_redacted = False
    
    # Redact prompt text
    if 'prompt' in redacted_trace and 'text' in redacted_trace['prompt']:
        redacted_prompt, prompt_redacted = redact_pii(redacted_trace['prompt']['text'])
        redacted_trace['prompt']['text'] = redacted_prompt
        any_redacted = any_redacted or prompt_redacted
    
    # Redact response text
    if 'response' in redacted_trace and 'text' in redacted_trace['response']:
        redacted_response, response_redacted = redact_pii(redacted_trace['response']['text'])
        redacted_trace['response']['text'] = redacted_response
        any_redacted = any_redacted or response_redacted
    
    # Sanitize prompt variables
    if 'prompt' in redacted_trace and 'variables' in redacted_trace['prompt']:
        original_vars = redacted_trace['prompt']['variables']
        sanitized_vars = sanitize_variables(original_vars)
        redacted_trace['prompt']['variables'] = sanitized_vars
        # Check if any variable was redacted
        for key in original_vars:
            if key in sanitized_vars and original_vars[key] != sanitized_vars[key]:
                any_redacted = True
                break
    
    return redacted_trace, any_redacted
