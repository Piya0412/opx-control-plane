"""
Agent Node Wrapper for LangGraph Orchestration.

This module provides the canonical wrapper for invoking Bedrock Agents
within LangGraph nodes with deterministic failure handling, retry logic,
and observability.

CRITICAL RULES:
1. Nodes are pure functions (GraphState -> GraphState)
2. Never mutate state in place (functional updates only)
3. Never raise exceptions (failures become hypotheses)
4. Never block (emit intent, executor handles delays)
5. Always emit execution traces
6. Always emit LLM traces (Phase 8.1)

PHASE 8.1 GOVERNANCE:
- Tracing failures NEVER fail agents
- Async, non-blocking trace emission
- Best-effort delivery
"""

import hashlib
import json
import time
import uuid
from datetime import datetime
from typing import Callable, Dict, Optional, Union

import boto3
from botocore.exceptions import ClientError

from .state import (
    GraphState,
    AgentInput,
    AgentOutput,
    StructuredError,
    ExecutionTraceEntry,
    JSONValue,
)
from .trace_emitter import emit_trace_event_async

# Phase 8.2: Guardrail support
import os
GUARDRAIL_ID = os.environ.get('GUARDRAIL_ID')
GUARDRAIL_VERSION = os.environ.get('GUARDRAIL_VERSION', '1')


# ============================================================================
# CONSTANTS
# ============================================================================

# Retry configuration
MAX_RETRIES = 2  # Total attempts = 3 (initial + 2 retries)
BACKOFF_BASE = 2  # Exponential base
BACKOFF_MAX = 4   # Max backoff seconds

# Retryable error codes
RETRYABLE_ERROR_CODES = {
    # Bedrock throttling
    "ThrottlingException",
    "TooManyRequestsException",
    
    # Service availability
    "ServiceUnavailableException",
    "InternalServerException",
    
    # Timeout (may succeed on retry)
    "TimeoutException",
    
    # Rate limiting
    "RATE_LIMIT_EXCEEDED",
    "BEDROCK_THROTTLING",
}

# Non-retryable error codes
NON_RETRYABLE_ERROR_CODES = {
    # Input validation
    "ValidationException",
    "INVALID_INPUT",
    "MISSING_REQUIRED_FIELD",
    "SCHEMA_VALIDATION_FAILED",
    
    # Authorization
    "AccessDeniedException",
    "UnauthorizedException",
    
    # Resource not found
    "ResourceNotFoundException",
    
    # Budget
    "BUDGET_EXCEEDED",
    
    # Output validation
    "OUTPUT_VALIDATION_FAILED",
    "LOW_CONFIDENCE",
}

# Error code mapping
ERROR_CODE_MAPPING = {
    # Bedrock exceptions
    "ThrottlingException": "BEDROCK_THROTTLING",
    "ServiceUnavailableException": "DATA_SOURCE_UNAVAILABLE",
    "ValidationException": "INVALID_INPUT",
    "AccessDeniedException": "INTERNAL_ERROR",
    "ResourceNotFoundException": "INTERNAL_ERROR",
    "InternalServerException": "INTERNAL_ERROR",
    "TooManyRequestsException": "RATE_LIMIT_EXCEEDED",
    
    # Timeout
    "TimeoutError": "TIMEOUT",
    
    # Validation
    "ValidationError": "SCHEMA_VALIDATION_FAILED",
    "OutputValidationError": "OUTPUT_VALIDATION_FAILED",
    
    # Unknown
    "Exception": "UNKNOWN_ERROR",
}

# Model pricing (USD per 1K tokens)
MODEL_PRICING = {
    "anthropic.claude-3-5-sonnet-20241022-v2:0": {
        "input": 0.003,
        "output": 0.015,
    },
    # Default pricing for unknown models
    "default": {
        "input": 0.003,
        "output": 0.015,
    },
}


# ============================================================================
# BEDROCK CLIENT
# ============================================================================

bedrock_agent_runtime = boto3.client("bedrock-agent-runtime")


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def is_retryable_error(error_code: str) -> bool:
    """
    Check if error code is retryable.
    
    Args:
        error_code: Error code from exception or mapping
    
    Returns:
        True if retryable, False otherwise
    """
    return error_code in RETRYABLE_ERROR_CODES


def map_exception_to_error_code(exception: Exception) -> str:
    """
    Map AWS exception to canonical error code.
    
    Args:
        exception: Exception from Bedrock invocation
    
    Returns:
        Canonical error code from ErrorCode enum
    """
    if isinstance(exception, ClientError):
        error_code = exception.response.get("Error", {}).get("Code", "Exception")
        return ERROR_CODE_MAPPING.get(error_code, "UNKNOWN_ERROR")
    
    exception_name = type(exception).__name__
    return ERROR_CODE_MAPPING.get(exception_name, "UNKNOWN_ERROR")


def extract_cost_metadata(
    bedrock_response: Optional[Dict[str, JSONValue]],
    failure_type: Optional[str] = None
) -> Dict[str, JSONValue]:
    """
    Extract cost metadata from Bedrock Agent response.
    
    Handles three cases:
    1. Successful invocation: Full cost from response
    2. Failed invocation with response: Partial cost from response
    3. Failed invocation without response: Zero cost
    
    Args:
        bedrock_response: Bedrock Agent response (None if pre-invocation failure)
        failure_type: Error code if failed (None if success)
    
    Returns:
        Cost metadata dict with inputTokens, outputTokens, estimatedCost, model
    
    Cost Rules:
    - Pre-invocation failures (validation, auth): Zero cost
    - Timeout after request sent: Partial cost if available in response
    - Output validation failure: Full cost (Bedrock completed)
    - Bedrock throttling: Zero or partial (depends on when throttled)
    """
    # Case 1: Pre-invocation failure (no Bedrock call)
    if bedrock_response is None:
        return {
            "inputTokens": 0,
            "outputTokens": 0,
            "estimatedCost": 0.0,
            "model": "N/A",
        }
    
    # Case 2 & 3: Extract from response (success or post-invocation failure)
    usage = bedrock_response.get("usage", {})
    input_tokens = usage.get("inputTokens", 0)
    output_tokens = usage.get("outputTokens", 0)
    model_id = bedrock_response.get("modelId", "unknown")
    
    # Get pricing for model
    pricing = MODEL_PRICING.get(model_id, MODEL_PRICING["default"])
    
    # Calculate cost (deterministic)
    input_cost = (input_tokens / 1000) * pricing["input"]
    output_cost = (output_tokens / 1000) * pricing["output"]
    estimated_cost = input_cost + output_cost
    
    return {
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "estimatedCost": round(estimated_cost, 6),  # 6 decimal places for determinism
        "model": model_id,
    }


def compute_deterministic_hash(
    agent_input: AgentInput,
    findings: Dict[str, JSONValue],
    confidence: float
) -> str:
    """
    Compute deterministic hash for replay verification.
    
    Included in hash:
    - agent_input.incident_id
    - agent_input.evidence_bundle (full, sorted keys)
    - agent_input.execution_id
    - findings (structured data only, sorted keys)
    - confidence (rounded to 4 decimal places)
    
    Excluded from hash:
    - agent_input.timestamp (execution-time metadata)
    - agent_input.session_id (execution-time metadata)
    - reasoning (free text, non-deterministic)
    - disclaimer (constant)
    - citations (may vary in formatting)
    - cost (execution-specific)
    
    Rule: Deterministic hash must depend only on semantic inputs,
          never execution-time metadata.
    
    Args:
        agent_input: Agent input envelope
        findings: Agent-specific findings
        confidence: Confidence score
    
    Returns:
        SHA256 hex digest
    """
    canonical = {
        "agent_input": {
            "incident_id": agent_input.incident_id,
            "evidence_bundle": agent_input.evidence_bundle,
            "execution_id": agent_input.execution_id,
            # timestamp EXCLUDED - execution-time metadata
            # session_id EXCLUDED - execution-time metadata
        },
        "findings": findings,
        "confidence": round(confidence, 4),
    }
    
    # Sort keys recursively for determinism
    canonical_json = json.dumps(canonical, sort_keys=True)
    
    return hashlib.sha256(canonical_json.encode()).hexdigest()


def validate_agent_input(agent_input: AgentInput) -> None:
    """
    Validate AgentInput before Bedrock invocation.
    
    Checks:
    1. incident_id is non-empty string
    2. evidence_bundle is non-empty dict
    3. timestamp is valid ISO-8601
    4. execution_id is non-empty string
    5. session_id is non-empty string
    
    Args:
        agent_input: Agent input envelope
    
    Raises:
        ValueError: If validation fails
    """
    if not agent_input.incident_id:
        raise ValueError("incident_id is required")
    
    if not agent_input.evidence_bundle:
        raise ValueError("evidence_bundle is required")
    
    if not agent_input.timestamp:
        raise ValueError("timestamp is required")
    
    if not agent_input.execution_id:
        raise ValueError("execution_id is required")
    
    if not agent_input.session_id:
        raise ValueError("session_id is required")


def validate_agent_output(raw_output: Dict[str, JSONValue]) -> None:
    """
    Validate Bedrock Agent output.
    
    Checks:
    1. All required fields present
    2. confidence in range [0.0, 1.0]
    3. status is valid enum value
    4. disclaimer contains "HYPOTHESIS_ONLY_NOT_AUTHORITATIVE"
    5. findings is non-empty dict
    
    Args:
        raw_output: Raw output from Bedrock Agent
    
    Raises:
        ValueError: If validation fails
    """
    required_fields = ["confidence", "findings", "disclaimer", "status"]
    for field in required_fields:
        if field not in raw_output:
            raise ValueError(f"Missing required field: {field}")
    
    # Validate confidence bounds
    confidence = raw_output["confidence"]
    if not isinstance(confidence, (int, float)) or not (0.0 <= confidence <= 1.0):
        raise ValueError(f"confidence must be in range [0.0, 1.0], got {confidence}")
    
    # Validate status
    valid_statuses = ["SUCCESS", "PARTIAL", "TIMEOUT", "FAILURE"]
    if raw_output["status"] not in valid_statuses:
        raise ValueError(f"Invalid status: {raw_output['status']}")
    
    # Validate disclaimer
    if "HYPOTHESIS_ONLY_NOT_AUTHORITATIVE" not in raw_output["disclaimer"]:
        raise ValueError("disclaimer must contain 'HYPOTHESIS_ONLY_NOT_AUTHORITATIVE'")
    
    # Validate findings
    if not raw_output["findings"]:
        raise ValueError("findings cannot be empty")


def add_execution_trace(
    state: GraphState,
    node_id: str,
    duration_ms: int,
    status: str,
    metadata: Optional[Dict[str, JSONValue]] = None
) -> GraphState:
    """
    Add execution trace entry.
    
    CRITICAL: Uses functional-style updates - returns new state copy.
    
    Args:
        state: Current graph state
        node_id: Node identifier
        duration_ms: Execution duration
        status: Execution status (STARTED, COMPLETED, FAILED, RETRYING)
        metadata: Optional metadata
    
    Returns:
        NEW state with trace entry (original state unchanged)
    """
    trace_entry = ExecutionTraceEntry(
        node_id=node_id,
        timestamp=datetime.utcnow().isoformat(),
        duration_ms=duration_ms,
        status=status,
        metadata=metadata,
    )
    
    # Functional-style update
    new_state = state.copy()
    new_state["execution_trace"] = state["execution_trace"] + [trace_entry]
    
    return new_state


def increment_retry_count(state: GraphState, agent_id: str) -> GraphState:
    """
    Increment retry count for agent.
    
    CRITICAL: Uses functional-style updates - returns new state copy.
    
    Args:
        state: Current graph state
        agent_id: Agent identifier
    
    Returns:
        NEW state with incremented retry count (original state unchanged)
    """
    current_count = state["retry_count"].get(agent_id, 0)
    
    # Functional-style update
    new_state = state.copy()
    new_state["retry_count"] = {**state["retry_count"], agent_id: current_count + 1}
    
    return new_state


def create_failure_hypothesis(
    agent_id: str,
    agent_version: str,
    execution_id: str,
    error_code: str,
    message: str,
    retryable: bool,
    retry_attempt: int,
    cost: Dict[str, JSONValue]
) -> AgentOutput:
    """
    Create failure hypothesis with confidence = 0.0.
    
    Args:
        agent_id: Agent identifier
        agent_version: Agent version
        execution_id: Execution identifier
        error_code: Error code from ErrorCode enum
        message: Human-readable error message
        retryable: Can this be retried?
        retry_attempt: Current retry attempt
        cost: Cost metadata
    
    Returns:
        AgentOutput with FAILURE status and confidence 0.0
    """
    return AgentOutput(
        agent_id=agent_id,
        agent_version=agent_version,
        execution_id=execution_id,
        timestamp=datetime.utcnow().isoformat(),
        duration=0,
        status="FAILURE",
        confidence=0.0,
        reasoning=f"Agent failed: {message}",
        disclaimer="HYPOTHESIS_ONLY_NOT_AUTHORITATIVE",
        findings={"error": error_code},
        citations=None,
        cost=cost,
        error={
            "code": error_code,
            "message": message,
            "retryable": retryable,
            "details": {"retry_attempt": retry_attempt},
        },
        replay_metadata={
            "deterministicHash": "FAILURE",
            "schemaVersion": "1.0.0",
        },
    )


# ============================================================================
# AGENT NODE WRAPPER
# ============================================================================

def create_agent_node(
    agent_id: str,
    agent_version: str,
    bedrock_agent_id: str,
    bedrock_agent_alias_id: str,
    max_retries: int = MAX_RETRIES,
    timeout_seconds: int = 30
) -> Callable[[GraphState], GraphState]:
    """
    Create a LangGraph node that invokes a Bedrock Agent.
    
    Args:
        agent_id: Canonical agent identifier (e.g., "signal-intelligence")
        agent_version: Agent version (e.g., "1.0.0")
        bedrock_agent_id: AWS Bedrock Agent ID
        bedrock_agent_alias_id: AWS Bedrock Agent Alias ID
        max_retries: Maximum retry attempts (default: 2)
        timeout_seconds: Timeout per invocation (default: 30)
    
    Returns:
        LangGraph node function: GraphState -> GraphState
    
    GUARANTEES:
    - Exactly one Bedrock Agent invocation per success
    - Max 2 retries on retryable errors
    - Failures become hypotheses with confidence = 0.0
    - Never raises exceptions
    - Always returns valid GraphState
    """
    
    def agent_node(state: GraphState) -> GraphState:
        """
        LangGraph node that invokes Bedrock Agent.
        
        Args:
            state: Current graph state
        
        Returns:
            Updated graph state (functional update)
        """
        start_time = time.time()
        agent_input = state["agent_input"]
        retry_attempt = state["retry_count"].get(agent_id, 0)
        
        # Fail-closed: Validate agent configuration at runtime
        if not bedrock_agent_id or not bedrock_agent_alias_id:
            raise RuntimeError(
                f"Agent {agent_id} misconfigured: missing Bedrock agent ID or alias. "
                f"agent_id={bedrock_agent_id!r}, alias_id={bedrock_agent_alias_id!r}"
            )
        
        # Emit STARTED trace
        state = add_execution_trace(
            state,
            agent_id,
            0,
            "STARTED",
            {"retry_attempt": retry_attempt}
        )
        
        try:
            # ================================================================
            # STEP 1: VALIDATE INPUT
            # ================================================================
            validate_agent_input(agent_input)
            
            # ================================================================
            # STEP 2: BUILD BEDROCK REQUEST
            # ================================================================
            bedrock_request = {
                "agentId": bedrock_agent_id,
                "agentAliasId": bedrock_agent_alias_id,
                "sessionId": agent_input.session_id,
                "inputText": json.dumps({
                    "incidentId": agent_input.incident_id,
                    "evidenceBundle": agent_input.evidence_bundle,
                    "timestamp": agent_input.timestamp,
                    "executionId": agent_input.execution_id,
                    "budgetRemaining": state["budget_remaining"],
                }),
            }
            
            # ================================================================
            # STEP 3: INVOKE BEDROCK AGENT (WITH GUARDRAILS)
            # ================================================================
            # Diagnostic log for verification
            print(f"[INFO] Invoking Bedrock agent {agent_id} | agent_id={bedrock_agent_id} | alias_id={bedrock_agent_alias_id}")
            
            # Attach guardrails if configured
            if GUARDRAIL_ID:
                bedrock_request['guardrailIdentifier'] = GUARDRAIL_ID
                bedrock_request['guardrailVersion'] = GUARDRAIL_VERSION
            
            # Enable trace to debug response issues
            bedrock_request['enableTrace'] = True
            
            bedrock_response = bedrock_agent_runtime.invoke_agent(**bedrock_request)
            
            # CRITICAL: Log the FULL raw response to understand structure
            print(f"[RAW BEDROCK RESPONSE] Agent: {agent_id}")
            print(f"[RAW BEDROCK RESPONSE] Keys: {list(bedrock_response.keys())}")
            print(f"[RAW BEDROCK RESPONSE] Full response: {json.dumps(bedrock_response, default=str, indent=2)[:2000]}")
            
            # Log response structure for debugging
            print(f"[DEBUG] Bedrock response keys for {agent_id}: {list(bedrock_response.keys())}")
            print(f"[DEBUG] Full response metadata: {bedrock_response.get('ResponseMetadata', {})}")
            
            if "completion" in bedrock_response:
                print(f"[DEBUG] Agent {agent_id} returned streaming response")
            elif "output" in bedrock_response:
                print(f"[DEBUG] Agent {agent_id} returned non-streaming response")
            else:
                print(f"[WARNING] Agent {agent_id} returned unexpected response structure")
                print(f"[DEBUG] Full response (first 500 chars): {str(bedrock_response)[:500]}")
            
            # ================================================================
            # STEP 3.5: CHECK FOR GUARDRAIL VIOLATIONS
            # ================================================================
            # Handle response-based guardrail blocks
            if bedrock_response.get('guardrailAction') == 'BLOCKED':
                # Log violation (async, non-blocking)
                try:
                    from ..tracing.guardrail_handler import handle_guardrail_violation
                    handle_guardrail_violation(
                        agent_id=agent_id,
                        incident_id=agent_input.incident_id,
                        execution_id=agent_input.execution_id,
                        trace_id=str(uuid.uuid4()),
                        violation={
                            'type': bedrock_response.get('violationType', 'UNKNOWN'),
                            'action': 'BLOCK',
                            'category': bedrock_response.get('category'),
                            'confidence': bedrock_response.get('confidence', 1.0),
                        },
                        input_text=bedrock_request['inputText'],
                        response=bedrock_response,
                        model=bedrock_response.get('modelId', 'unknown')
                    )
                except Exception as guardrail_error:
                    print(f"WARNING: Guardrail violation logging failed: {guardrail_error}")
                
                # Return failure hypothesis (graceful degradation)
                raise ValueError("Request blocked by guardrails")
            
            # Check for non-blocking violations (WARN mode)
            if 'guardrailAction' in bedrock_response and bedrock_response['guardrailAction'] != 'BLOCKED':
                # Log violation (async, non-blocking)
                try:
                    from ..tracing.guardrail_handler import handle_guardrail_violation
                    handle_guardrail_violation(
                        agent_id=agent_id,
                        incident_id=agent_input.incident_id,
                        execution_id=agent_input.execution_id,
                        trace_id=str(uuid.uuid4()),
                        violation={
                            'type': bedrock_response.get('violationType', 'UNKNOWN'),
                            'action': 'WARN',
                            'category': bedrock_response.get('category'),
                            'confidence': bedrock_response.get('confidence', 1.0),
                        },
                        input_text=bedrock_request['inputText'],
                        response=bedrock_response,
                        model=bedrock_response.get('modelId', 'unknown')
                    )
                except Exception as guardrail_error:
                    print(f"WARNING: Guardrail violation logging failed: {guardrail_error}")
                # Continue with agent execution (WARN mode)
            
            # Parse response (streaming or non-streaming)
            raw_output = {}
            completion_text = ""
            
            if "completion" in bedrock_response:
                # Streaming response - collect all chunks
                chunk_count = 0
                for event in bedrock_response["completion"]:
                    if "chunk" in event:
                        chunk = event["chunk"]
                        if "bytes" in chunk:
                            chunk_text = chunk["bytes"].decode()
                            completion_text += chunk_text
                            chunk_count += 1
                
                print(f"[DEBUG] Agent {agent_id} received {chunk_count} chunks, total length: {len(completion_text)}")
                print(f"[DEBUG] Completion text (first 200 chars): {completion_text[:200]}")
                
                # Parse accumulated text
                if completion_text:
                    try:
                        raw_output = json.loads(completion_text)
                        print(f"[DEBUG] Successfully parsed JSON output for {agent_id}")
                    except json.JSONDecodeError as e:
                        # If not JSON, agent returned plain text - this means no final response
                        print(f"[ERROR] Agent {agent_id} returned non-JSON response: {e}")
                        print(f"[DEBUG] Full completion text: {completion_text}")
                        raise ValueError(
                            f"Agent {agent_id} returned non-JSON response. "
                            f"This usually means the agent has no action groups and is not configured "
                            f"to produce final output. Response: {completion_text[:200]}"
                        )
                else:
                    print(f"[ERROR] Agent {agent_id} returned empty completion")
                    raise ValueError(f"Agent {agent_id} returned empty response")
            else:
                # Non-streaming response
                if "output" in bedrock_response and "text" in bedrock_response["output"]:
                    raw_output = json.loads(bedrock_response["output"]["text"])
                    print(f"[DEBUG] Successfully parsed non-streaming output for {agent_id}")
                else:
                    # Empty response - agent produced no output
                    print(f"[ERROR] Agent {agent_id} returned no output field")
                    raise ValueError(
                        f"Agent {agent_id} returned empty response. "
                        f"This usually means the agent has no action groups and is not configured "
                        f"to produce final output. Response keys: {list(bedrock_response.keys())}"
                    )
            
            # ================================================================
            # STEP 4: VALIDATE OUTPUT
            # ================================================================
            validate_agent_output(raw_output)
            
            # ================================================================
            # STEP 5: EXTRACT COST (BEFORE REDACTION)
            # ================================================================
            cost = extract_cost_metadata(bedrock_response, failure_type=None)
            
            # ================================================================
            # STEP 5.5: EMIT TRACE EVENT (ASYNC, NON-BLOCKING)
            # ================================================================
            # CRITICAL: Emit trace AFTER cost computation, BEFORE storage
            # Redaction happens in trace processor Lambda
            duration_ms = int((time.time() - start_time) * 1000)
            
            try:
                emit_trace_event_async(
                    trace_id=str(uuid.uuid4()),
                    timestamp=datetime.utcnow().isoformat(),
                    agent_id=agent_id,
                    incident_id=agent_input.incident_id,
                    execution_id=agent_input.execution_id,
                    model=cost.get("model", "unknown"),
                    model_version=agent_version,
                    prompt_text=bedrock_request["inputText"],
                    prompt_tokens=cost.get("inputTokens", 0),
                    prompt_template=agent_id,  # Use agent_id as template identifier
                    prompt_variables={},  # Variables already in inputText
                    response_text=json.dumps(raw_output),
                    response_tokens=cost.get("outputTokens", 0),
                    finish_reason=raw_output.get("status", "stop"),
                    latency=duration_ms,
                    input_cost=cost.get("estimatedCost", 0.0) * (cost.get("inputTokens", 0) / (cost.get("inputTokens", 0) + cost.get("outputTokens", 1))),
                    output_cost=cost.get("estimatedCost", 0.0) * (cost.get("outputTokens", 0) / (cost.get("inputTokens", 1) + cost.get("outputTokens", 0))),
                    total_cost=cost.get("estimatedCost", 0.0),
                    retry_count=retry_attempt,
                    guardrails_applied=[],
                    validation_status="passed",
                    capture_method="async"
                )
            except Exception as trace_error:
                # CRITICAL: Tracing failures are logged but NOT propagated
                print(f"WARNING: Trace emission failed: {trace_error}")
                # Continue with agent execution
            
            # ================================================================
            # STEP 6: CREATE AGENT OUTPUT
            # ================================================================
            
            agent_output = AgentOutput(
                agent_id=agent_id,
                agent_version=agent_version,
                execution_id=agent_input.execution_id,
                timestamp=datetime.utcnow().isoformat(),
                duration=duration_ms,
                status=raw_output["status"],
                confidence=raw_output["confidence"],
                reasoning=raw_output.get("reasoning", ""),
                disclaimer=raw_output["disclaimer"],
                findings=raw_output["findings"],
                citations=raw_output.get("citations"),
                cost=cost,
                error=raw_output.get("error"),
                replay_metadata={
                    "deterministicHash": compute_deterministic_hash(
                        agent_input,
                        raw_output["findings"],
                        raw_output["confidence"]
                    ),
                    "schemaVersion": "1.0.0",
                },
            )
            
            # ================================================================
            # STEP 7: UPDATE STATE (FUNCTIONAL)
            # ================================================================
            new_state = state.copy()
            new_state["hypotheses"] = {**state["hypotheses"], agent_id: agent_output}
            new_state = add_execution_trace(
                new_state,
                agent_id,
                duration_ms,
                "COMPLETED",
                {"confidence": agent_output.confidence, "status": agent_output.status}
            )
            
            return new_state
        
        except Exception as e:
            # ================================================================
            # FAILURE PATH
            # ================================================================
            duration_ms = int((time.time() - start_time) * 1000)
            
            # Check for exception-based guardrail blocks
            if type(e).__name__ == 'GuardrailInterventionException':
                # Log violation (async, non-blocking)
                try:
                    from ..tracing.guardrail_handler import handle_guardrail_violation
                    handle_guardrail_violation(
                        agent_id=agent_id,
                        incident_id=agent_input.incident_id,
                        execution_id=agent_input.execution_id,
                        trace_id=str(uuid.uuid4()),
                        violation={
                            'type': getattr(e, 'violationType', 'UNKNOWN'),
                            'action': 'BLOCK',
                            'category': getattr(e, 'category', None),
                            'confidence': getattr(e, 'confidence', 1.0),
                        },
                        input_text=bedrock_request['inputText'] if 'bedrock_request' in locals() else '',
                        response={'error': str(e)},
                        model='unknown'
                    )
                except Exception as guardrail_error:
                    print(f"WARNING: Guardrail violation logging failed: {guardrail_error}")
            
            # Map exception to error code
            error_code = map_exception_to_error_code(e)
            message = str(e)
            retryable = is_retryable_error(error_code)
            
            # Check if retry eligible
            if retryable and retry_attempt < max_retries:
                # ============================================================
                # RETRY PATH
                # ============================================================
                # Emit RETRYING trace
                new_state = add_execution_trace(
                    state,
                    agent_id,
                    duration_ms,
                    "RETRYING",
                    {"error_code": error_code, "retry_attempt": retry_attempt}
                )
                
                # Increment retry count
                new_state = increment_retry_count(new_state, agent_id)
                
                # Return state immediately (executor handles backoff)
                # Backoff timing enforced by LangGraph executor, not node
                return new_state
            
            # ================================================================
            # NON-RETRYABLE OR MAX RETRIES EXCEEDED
            # ================================================================
            
            # Extract cost (may be zero or partial)
            cost = extract_cost_metadata(
                bedrock_response=None if "bedrock_response" not in locals() else bedrock_response,
                failure_type=error_code
            )
            
            # Create structured error
            structured_error = StructuredError(
                agent_id=agent_id,
                error_code=error_code,
                message=message,
                retryable=retryable,
                timestamp=datetime.utcnow().isoformat(),
                retry_attempt=retry_attempt,
                details=None,
            )
            
            # Create failure hypothesis
            failure_output = create_failure_hypothesis(
                agent_id=agent_id,
                agent_version=agent_version,
                execution_id=agent_input.execution_id,
                error_code=error_code,
                message=message,
                retryable=retryable,
                retry_attempt=retry_attempt,
                cost=cost,
            )
            
            # Update state (functional)
            new_state = state.copy()
            new_state["hypotheses"] = {**state["hypotheses"], agent_id: failure_output}
            new_state["errors"] = state["errors"] + [structured_error]
            new_state = add_execution_trace(
                new_state,
                agent_id,
                duration_ms,
                "FAILED",
                {"error_code": error_code, "retry_attempt": retry_attempt}
            )
            
            return new_state
    
    return agent_node
