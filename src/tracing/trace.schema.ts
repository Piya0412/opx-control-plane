/**
 * Phase 8.1: LLM Trace Schema
 * 
 * Captures all LLM interactions for audit, debugging, and compliance.
 * 
 * GOVERNANCE RULES (LOCKED):
 * - Tracing failures NEVER fail agents
 * - 100% tracing (no sampling initially)
 * - Event-driven, async only
 * - DynamoDB traces are non-authoritative
 * - TTL = 90 days
 * - PII redaction is mandatory
 */

export interface LLMTrace {
  // Identity
  traceId: string;              // UUID v4
  timestamp: string;            // ISO 8601
  traceVersion: string;         // "v1" - for future schema evolution
  
  // Context
  agentId: string;              // e.g., "signal-intelligence"
  incidentId: string;           // Context for trace (OK in DynamoDB, NOT in metrics)
  executionId: string;          // LangGraph execution ID
  
  // Model
  model: string;                // e.g., "anthropic.claude-3-sonnet-20240229-v1:0"
  modelVersion: string;         // e.g., "20240229"
  
  // Prompt (redacted before storage)
  prompt: {
    text: string;               // Full prompt (redacted)
    tokens: number;             // Input token count
    template: string;           // Prompt template ID
    variables: Record<string, string>; // Template variables (stringified, redacted, truncated)
  };
  
  // Response (redacted before storage)
  response: {
    text: string;               // Full response (redacted)
    tokens: number;             // Output token count
    finishReason: string;       // "stop", "length", "content_filter"
    latency: number;            // Response time in ms
  };
  
  // Cost (computed BEFORE redaction)
  cost: {
    inputCost: number;          // USD (input tokens * rate)
    outputCost: number;         // USD (output tokens * rate)
    total: number;              // USD (sum)
  };
  
  // Metadata
  metadata: {
    retryCount: number;         // How many retries
    guardrailsApplied: string[]; // Which guardrails fired
    validationStatus: "passed" | "failed" | "warning";
    redactionApplied: boolean;  // Was PII redacted?
    captureMethod: "sync" | "async"; // How was trace captured
  };
  
  // TTL
  ttl: number;                  // Unix timestamp (90 days from now)
}

export interface TraceEvent {
  traceId: string;
  timestamp: string;
  agentId: string;
  incidentId: string;
  executionId: string;
  model: string;
  modelVersion: string;
  prompt: {
    text: string;
    tokens: number;
    template: string;
    variables: Record<string, string>;
  };
  response: {
    text: string;
    tokens: number;
    finishReason: string;
    latency: number;
  };
  cost: {
    inputCost: number;
    outputCost: number;
    total: number;
  };
  metadata: {
    retryCount: number;
    guardrailsApplied: string[];
    validationStatus: "passed" | "failed" | "warning";
    captureMethod: "sync" | "async";
  };
}
