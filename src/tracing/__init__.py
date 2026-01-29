"""
Phase 8.1: Tracing Module

Python exports for trace processing.
"""

from .redaction import redact_pii, redact_trace_data, sanitize_variables
from .trace_emitter import (
    emit_trace_event,
    calculate_cost,
    create_trace_id,
    extract_model_version
)

__all__ = [
    'redact_pii',
    'redact_trace_data',
    'sanitize_variables',
    'emit_trace_event',
    'calculate_cost',
    'create_trace_id',
    'extract_model_version'
]
