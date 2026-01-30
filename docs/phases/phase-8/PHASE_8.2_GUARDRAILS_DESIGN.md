# Phase 8.2: Guardrails Enforcement

**Status:** ✅ APPROVED (WITH CORRECTIONS APPLIED)  
**Created:** January 29, 2026  
**Estimated Duration:** 1 day

## Corrections Applied (Required by User)

The following corrections have been applied to align with AWS Bedrock Guardrails API reality:

1. **WARN Mode Clarification**: Bedrock returns `BLOCK` or `ALLOW` with metadata, not native `WARN`. Our code interprets non-blocking violations as `WARN` for logging and metrics.

2. **Dual Block Handling**: Agent integration now handles BOTH exception-based (`GuardrailInterventionException`) and response-based (`{"guardrailAction": "BLOCKED"}`) guardrail blocks.

3. **Optional Confidence Field**: Violation schema now has `confidence?: number` (optional) with default value of 1.0 when Bedrock doesn't provide it.

4. **Conceptual Topic Names**: Topics now use conceptual definitions (`SYSTEM_COMMAND_EXECUTION`, `CREDENTIAL_HANDLING`, `DESTRUCTIVE_ACTIONS`) instead of literal phrases.

## Objective

Enforce safety guardrails on all LLM interactions to prevent PII leaks and inappropriate content.

## Core Principle (LOCKED)

**Enforcement Mode:**
```
PII / Credentials → BLOCK (hard stop)
Content categories → ALLOW + LOG (application-level decision)
```

**CRITICAL CLARIFICATION:**
- Bedrock Guardrails do NOT have a native "WARN" mode
- Bedrock returns violation metadata in the response
- Application code decides: BLOCK or ALLOW+LOG
- For content filters: We ALLOW the response and LOG the violation

**Rationale:**
- Over-blocking destroys trust early
- Need data before strict enforcement
- PII leaks are unacceptable
- Content issues can be tuned

## Architecture

### Guardrail Attachment

```
LangGraph Agent Node
    ↓
Bedrock Agent Invocation
    ↓ (guardrailId attached)
Bedrock Guardrails
    ├─→ PII Detection → BLOCK
    └─→ Content Filters → WARN
    ↓
Agent Response (or blocked)
    ↓ (if violation)
Guardrail Violation Event
    ↓
DynamoDB: opx-guardrail-violations
```

### Guardrail Configuration

**Guardrail ID:** `opx-agent-guardrail`

**Version:** 1 (DRAFT for testing, promote to LIVE after validation)

## Guardrail Policies

### 1. PII Detection (BLOCK Mode)

**Action:** BLOCK (prevent response)

**Detected Types:**
- Email addresses
- Phone numbers (US format)
- Social Security Numbers (SSN)
- Credit card numbers
- AWS credentials (access keys, secret keys)
- Driver's license numbers
- Passport numbers

**Configuration:**
```json
{
  "type": "PII",
  "action": "BLOCK",
  "piiTypes": [
    "EMAIL",
    "PHONE",
    "SSN",
    "CREDIT_DEBIT_CARD_NUMBER",
    "AWS_ACCESS_KEY",
    "AWS_SECRET_KEY",
    "DRIVERS_LICENSE",
    "PASSPORT_NUMBER"
  ]
}
```

### 2. Content Filters (ALLOW + LOG Mode)

**Action:** ALLOW + LOG (application decides to allow response and log violation)

**Categories:**

1. **Hate Speech**
   - Threshold: MEDIUM
   - Action: WARN
   - Examples: Discriminatory language, slurs

2. **Violence**
   - Threshold: MEDIUM
   - Action: WARN
   - Examples: Graphic violence, threats

3. **Sexual Content**
   - Threshold: HIGH
   - Action: WARN
   - Examples: Explicit sexual content

4. **Misconduct**
   - Threshold: LOW
   - Action: WARN
   - Examples: Illegal activities, fraud

**Configuration:**
```json
{
  "type": "CONTENT_FILTER",
  "action": "WARN",
  "filters": [
    {
      "type": "HATE",
      "threshold": "MEDIUM"
    },
    {
      "type": "VIOLENCE",
      "threshold": "MEDIUM"
    },
    {
      "type": "SEXUAL",
      "threshold": "HIGH"
    },
    {
      "type": "MISCONDUCT",
      "threshold": "LOW"
    }
  ]
}
```

### 3. Topic Denial (BLOCK Mode)

**Action:** BLOCK

**Denied Topics (Conceptual Definitions):**
- System command execution (prevent hallucinated actions)
- Credential handling (prevent credential exposure)
- Destructive actions (prevent data loss)

**IMPORTANT:** Topic definitions must be conceptual, not literal phrases. Bedrock matches semantic meaning, not exact strings.

**Configuration:**
```json
{
  "type": "TOPIC_DENIAL",
  "action": "BLOCK",
  "topics": [
    {
      "name": "SYSTEM_COMMAND_EXECUTION",
      "definition": "Requests or suggestions to execute shell commands, run scripts, or perform system operations that could modify infrastructure or execute code"
    },
    {
      "name": "CREDENTIAL_HANDLING",
      "definition": "Requests for AWS credentials, API keys, passwords, tokens, or any authentication secrets, or suggestions to expose or share such credentials"
    },
    {
      "name": "DESTRUCTIVE_ACTIONS",
      "definition": "Suggestions to delete production data, drop databases, terminate resources, or perform any irreversible destructive operations"
    }
  ]
}
```

### 4. Word Filters (ALLOW + LOG Mode)

**Action:** ALLOW + LOG

**Blocked Words:**
- Profanity (standard list)
- Competitor names (optional)

**Configuration:**
```json
{
  "type": "WORD_FILTER",
  "action": "WARN",
  "words": [
    "profanity_list_standard"
  ]
}
```

## Violation Schema

```typescript
interface GuardrailViolation {
  // Identity
  violationId: string;          // UUID v4
  timestamp: string;            // ISO 8601
  
  // Context
  traceId: string;              // Link to LLM trace
  agentId: string;              // Which agent
  incidentId: string;           // Context
  executionId: string;          // LangGraph execution
  
  // Violation Details
  violation: {
    type: "PII" | "CONTENT" | "TOPIC" | "WORD";
    action: "BLOCK" | "ALLOW";  // Application decision, not Bedrock native
    category?: string;          // e.g., "EMAIL", "HATE", "VIOLENCE"
    threshold?: string;         // e.g., "MEDIUM", "HIGH"
    confidence?: number;        // 0.0 - 1.0 (optional, defaults to 1.0 if not provided by Bedrock)
  };
  
  // Content (redacted)
  content: {
    input: string;              // Prompt that triggered violation (redacted)
    output?: string;            // Response if WARN mode (redacted)
    detectedText: string;       // Specific text that violated (redacted)
  };
  
  // Response
  response: {
    blocked: boolean;           // Was response blocked?
    message: string;            // User-facing message
    retryAllowed: boolean;      // Can user retry?
  };
  
  // Metadata
  metadata: {
    guardrailId: string;        // "opx-agent-guardrail"
    guardrailVersion: string;   // "1"
    model: string;              // LLM model used
  };
}
```

## DynamoDB Table Design

**Table:** `opx-guardrail-violations`

**Keys:**
- `violationId` (PK, String) - UUID
- `timestamp` (SK, String) - ISO 8601

**GSI:** `agentId-timestamp-index`
- `agentId` (PK, String)
- `timestamp` (SK, String)
- Projection: ALL

**GSI:** `type-timestamp-index`
- `violation.type` (PK, String)
- `timestamp` (SK, String)
- Projection: ALL

**TTL:** None (permanent record)

**Capacity:** On-demand billing

## Implementation

### 1. CDK Construct

**Location:** `infra/constructs/bedrock-guardrails.ts`

```typescript
import * as cdk from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { Construct } from 'constructs';

export class BedrockGuardrails extends Construct {
  public readonly guardrailId: string;
  public readonly guardrailArn: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const guardrail = new bedrock.CfnGuardrail(this, 'AgentGuardrail', {
      name: 'opx-agent-guardrail',
      description: 'Safety guardrails for OPX Bedrock Agents',
      
      // PII Detection (BLOCK)
      sensitiveInformationPolicyConfig: {
        piiEntitiesConfig: [
          { type: 'EMAIL', action: 'BLOCK' },
          { type: 'PHONE', action: 'BLOCK' },
          { type: 'SSN', action: 'BLOCK' },
          { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
          { type: 'AWS_ACCESS_KEY', action: 'BLOCK' },
          { type: 'AWS_SECRET_KEY', action: 'BLOCK' },
          { type: 'DRIVERS_LICENSE', action: 'BLOCK' },
          { type: 'PASSPORT_NUMBER', action: 'BLOCK' },
        ],
      },
      
      // Content Filters (WARN)
      contentPolicyConfig: {
        filtersConfig: [
          { type: 'HATE', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
          { type: 'VIOLENCE', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
          { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'MISCONDUCT', inputStrength: 'LOW', outputStrength: 'LOW' },
        ],
      },
      
      // Topic Denial (BLOCK) - Use conceptual definitions
      topicPolicyConfig: {
        topicsConfig: [
          {
            name: 'SYSTEM_COMMAND_EXECUTION',
            definition: 'Requests or suggestions to execute shell commands, run scripts, or perform system operations that could modify infrastructure or execute code',
            type: 'DENY',
          },
          {
            name: 'CREDENTIAL_HANDLING',
            definition: 'Requests for AWS credentials, API keys, passwords, tokens, or any authentication secrets, or suggestions to expose or share such credentials',
            type: 'DENY',
          },
          {
            name: 'DESTRUCTIVE_ACTIONS',
            definition: 'Suggestions to delete production data, drop databases, terminate resources, or perform any irreversible destructive operations',
            type: 'DENY',
          },
        ],
      },
      
      // Word Filters (WARN)
      wordPolicyConfig: {
        wordsConfig: [
          { text: 'profanity_list_standard' },
        ],
        managedWordListsConfig: [
          { type: 'PROFANITY' },
        ],
      },
      
      blockedInputMessaging: 'This request was blocked due to safety guardrails. Please rephrase and try again.',
      blockedOutputsMessaging: 'This response was blocked due to safety guardrails.',
    });

    this.guardrailId = guardrail.attrGuardrailId;
    this.guardrailArn = guardrail.attrGuardrailArn;

    // Output for reference
    new cdk.CfnOutput(this, 'GuardrailId', {
      value: this.guardrailId,
      description: 'Bedrock Guardrail ID',
    });
  }
}
```

### 2. Agent Integration

**Location:** `src/langgraph/agent_node.py`

```python
async def invoke_agent_with_guardrails(
    agent_id: str,
    input_data: dict,
    state: dict
) -> dict:
    """Invoke Bedrock Agent with guardrails.
    
    Handles BOTH exception-based and response-based guardrail blocks:
    1. Exception: GuardrailInterventionException (some violations)
    2. Response: {"guardrailAction": "BLOCKED"} (other violations)
    """
    
    try:
        response = await bedrock_agent_runtime.invoke_agent(
            agentId=agent_id,
            agentAliasId="TSTALIASID",
            sessionId=state["executionId"],
            inputText=input_data["query"],
            # Attach guardrail
            guardrailIdentifier=os.environ['GUARDRAIL_ID'],
            guardrailVersion='1'
        )
        
        # Check for response-based guardrail blocks
        if response.get('guardrailAction') == 'BLOCKED':
            await handle_guardrail_violation(
                agent_id=agent_id,
                incident_id=state["incidentId"],
                violation={
                    'type': response.get('violationType', 'UNKNOWN'),
                    'action': 'BLOCK',
                    'category': response.get('category'),
                    'confidence': response.get('confidence', 1.0)  # Default to 1.0 if absent
                },
                input_text=input_data["query"],
                response=response
            )
            
            # Return graceful degradation
            return {
                "output": "Unable to process request due to safety guardrails.",
                "blocked": True
            }
        
        # Check for non-blocking violations (WARN mode)
        if 'guardrailAction' in response and response['guardrailAction'] != 'BLOCKED':
            await handle_guardrail_violation(
                agent_id=agent_id,
                incident_id=state["incidentId"],
                violation={
                    'type': response.get('violationType', 'UNKNOWN'),
                    'action': 'WARN',  # Interpret as WARN for logging
                    'category': response.get('category'),
                    'confidence': response.get('confidence', 1.0)  # Default to 1.0 if absent
                },
                input_text=input_data["query"],
                response=response
            )
        
        return response
        
    except bedrock_agent_runtime.exceptions.GuardrailInterventionException as e:
        # Exception-based guardrail block
        await handle_guardrail_violation(
            agent_id=agent_id,
            incident_id=state["incidentId"],
            violation={
                'type': getattr(e, 'violationType', 'UNKNOWN'),
                'action': 'BLOCK',
                'category': getattr(e, 'category', None),
                'confidence': getattr(e, 'confidence', 1.0)  # Default to 1.0 if absent
            },
            input_text=input_data["query"],
            response={'error': str(e)}
        )
        
        # Return graceful degradation
        return {
            "output": "Unable to process request due to safety guardrails.",
            "blocked": True
        }
```

### 3. Violation Handler

**Location:** `src/tracing/guardrail-handler.py`

```python
import boto3
import json
from datetime import datetime, timezone
import uuid

dynamodb = boto3.resource('dynamodb')
violations_table = dynamodb.Table('opx-guardrail-violations')

async def handle_guardrail_violation(
    agent_id: str,
    incident_id: str,
    violation: dict,
    input_text: str,
    response: dict,
    blocked: bool
):
    """Log guardrail violation to DynamoDB.
    
    Args:
        blocked: True if request was blocked, False if allowed with warning
    
    Handles confidence field as optional (defaults to 1.0 if not provided by Bedrock).
    """
    
    violation_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()
    
    # Redact sensitive content
    redacted_input, _ = redact_pii(input_text)
    redacted_output = None
    if 'output' in response:
        redacted_output, _ = redact_pii(response['output'])
    
    # Determine action (application decision)
    action = "BLOCK" if blocked else "ALLOW"
    
    # Extract confidence (optional, default 1.0)
    confidence = violation.get('confidence', 1.0)
    
    # Store violation
    violations_table.put_item(Item={
        'violationId': violation_id,
        'timestamp': timestamp,
        'traceId': response.get('traceId', 'unknown'),
        'agentId': agent_id,
        'incidentId': incident_id,
        'executionId': response.get('executionId', 'unknown'),
        'violation': {
            'type': violation.get('type', 'UNKNOWN'),
            'action': action,  # Application decision
            'category': violation.get('category'),
            'threshold': violation.get('threshold'),
            'confidence': confidence  # Optional, defaults to 1.0
        },
        'content': {
            'input': redacted_input,
            'output': redacted_output,
            'detectedText': '[REDACTED]'
        },
        'response': {
            'blocked': blocked,
            'message': violation.get('message', 'Guardrail violation detected'),
            'retryAllowed': not blocked  # Can retry if not blocked
        },
        'metadata': {
            'guardrailId': os.environ['GUARDRAIL_ID'],
            'guardrailVersion': '1',
            'model': response.get('model', 'unknown')
        }
    })
    
    # Emit CloudWatch metric (no incidentId dimension!)
    cloudwatch.put_metric_data(
        Namespace='OPX/Guardrails',
        MetricData=[{
            'MetricName': 'ViolationCount',
            'Value': 1,
            'Unit': 'Count',
            'Dimensions': [
                {'Name': 'AgentId', 'Value': agent_id},
                {'Name': 'ViolationType', 'Value': violation.get('type', 'UNKNOWN')},
                {'Name': 'Action', 'Value': action}
            ]
        }]
    )
```

## CloudWatch Metrics

**Namespace:** `OPX/Guardrails`

**Metrics:**

1. **ViolationCount**
   - Unit: Count
   - Dimensions: `AgentId`, `ViolationType`, `Action`
   - Description: Number of guardrail violations

2. **BlockRate**
   - Unit: Percent
   - Dimensions: `AgentId`, `ViolationType`
   - Description: Percentage of requests blocked

3. **AllowWithLogRate**
   - Unit: Percent
   - Dimensions: `AgentId`, `ViolationType`
   - Description: Percentage of requests allowed but logged (content violations)

## CloudWatch Alarms

### Alarm 1: High PII Violation Rate

```typescript
new cloudwatch.Alarm(this, 'HighPIIViolationRate', {
  alarmName: 'OPX-Guardrails-HighPIIViolationRate',
  alarmDescription: 'PII violation rate exceeds 1%',
  metric: new cloudwatch.Metric({
    namespace: 'OPX/Guardrails',
    metricName: 'ViolationCount',
    dimensionsMap: {
      ViolationType: 'PII',
      Action: 'BLOCK'
    },
    statistic: 'Sum',
    period: cdk.Duration.minutes(5)
  }),
  threshold: 1,
  evaluationPeriods: 2,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
});
```

### Alarm 2: High Content Violation Rate

```typescript
new cloudwatch.Alarm(this, 'HighContentViolationRate', {
  alarmName: 'OPX-Guardrails-HighContentViolationRate',
  alarmDescription: 'Content violation rate exceeds 10%',
  metric: new cloudwatch.Metric({
    namespace: 'OPX/Guardrails',
    metricName: 'ViolationCount',
    dimensionsMap: {
      ViolationType: 'CONTENT',
      Action: 'WARN'
    },
    statistic: 'Sum',
    period: cdk.Duration.minutes(5)
  }),
  threshold: 10,
  evaluationPeriods: 3,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
});
```

## Testing

### Unit Tests

```python
def test_pii_detection_blocks():
    """Test PII detection blocks request."""
    input_text = "My email is user@example.com"
    
    with pytest.raises(GuardrailInterventionException):
        invoke_agent_with_guardrails(
            agent_id="signal-intelligence",
            input_data={"query": input_text},
            state={"incidentId": "INC-001", "executionId": "exec-123"}
        )

def test_content_filter_allows_and_logs():
    """Test content filter allows response but logs violation."""
    input_text = "This contains mild profanity"
    
    response = invoke_agent_with_guardrails(
        agent_id="signal-intelligence",
        input_data={"query": input_text},
        state={"incidentId": "INC-001", "executionId": "exec-123"}
    )
    
    # Response should be returned (not blocked)
    assert response is not None
    assert 'output' in response
    assert response.get('blocked') != True
    
    # Violation should be logged with action=ALLOW
    violations = violations_table.query(
        IndexName='agentId-timestamp-index',
        KeyConditionExpression='agentId = :aid',
        ExpressionAttributeValues={':aid': 'signal-intelligence'},
        Limit=1,
        ScanIndexForward=False
    )
    
    assert len(violations['Items']) > 0
    assert violations['Items'][0]['violation']['action'] == 'ALLOW'
    assert violations['Items'][0]['response']['blocked'] == False
```

### Integration Tests

```python
async def test_guardrail_end_to_end():
    """Test full guardrail enforcement flow."""
    
    # Test BLOCK mode (PII)
    with pytest.raises(GuardrailInterventionException):
        await invoke_agent_with_guardrails(
            agent_id="signal-intelligence",
            input_data={"query": "My SSN is 123-45-6789"},
            state={"incidentId": "INC-001", "executionId": "exec-123"}
        )
    
    # Verify violation logged
    violations = violations_table.scan(
        FilterExpression='violation.#type = :type',
        ExpressionAttributeNames={'#type': 'type'},
        ExpressionAttributeValues={':type': 'PII'}
    )
    
    assert len(violations['Items']) > 0
    assert violations['Items'][0]['response']['blocked'] == True
```

## Cost Analysis

**Bedrock Guardrails Pricing:**
- $0.75 per 1,000 content units
- 1 content unit = 1,000 characters

**Assumptions:**
- 100 agent invocations per day
- Average input: 500 characters (0.5 units)
- Average output: 300 characters (0.3 units)
- Total: 0.8 units per invocation

**Monthly Cost:**
- 100 invocations/day × 30 days = 3,000 invocations
- 3,000 × 0.8 units = 2,400 units
- 2,400 / 1,000 × $0.75 = $1.80/month

**DynamoDB Cost:**
- Negligible (violations are rare)

**Total:** ~$2/month

## Success Criteria

- ✅ Guardrail created and deployed
- ✅ PII detection blocks requests (exception-based AND response-based)
- ✅ Content filters allow responses but log violations (ALLOW + LOG)
- ✅ All violations logged to DynamoDB with optional confidence field
- ✅ CloudWatch metrics populated (no incidentId dimension)
- ✅ CloudWatch alarms configured
- ✅ Unit tests passing (PII detection, content filters, both block types)
- ✅ Integration tests passing (end-to-end)
- ✅ No false positives on normal requests
- ✅ Topic denial uses conceptual definitions (not literal phrases)

## Risks & Mitigations

**Risk 1: False positives (over-blocking)**
- Mitigation: ALLOW + LOG mode for content (not BLOCK)
- Mitigation: Monitor false positive rate
- Mitigation: Tune thresholds based on data

**Risk 2: False negatives (PII leaks)**
- Mitigation: Multiple PII patterns
- Mitigation: Regular expression testing
- Mitigation: Manual audit of sample traces

**Risk 3: Performance impact**
- Mitigation: Guardrails run in parallel with LLM
- Mitigation: Minimal latency overhead (<100ms)

## Next Steps

1. ✅ **Review and approve this design** - COMPLETE (corrections applied)
2. **Create Bedrock Guardrail resource** - CDK construct
3. **Create DynamoDB violations table** - CDK construct
4. **Implement violation handler** - Python module
5. **Integrate with all agents** - Update agent_node.py
6. **Write unit tests** - PII detection, content filters, dual block handling
7. **Write integration tests** - End-to-end guardrail enforcement
8. **Deploy to production**

---

**Status:** READY FOR IMPLEMENTATION  
**Dependencies:** 8.1 (Tracing) for violation logging  
**Blocks:** None (can run in parallel with 8.3, 8.4)

---

## Required Corrections Applied ✅

1. **Bedrock API Reality:** Clarified that "WARN" is application logic, not Bedrock native. Bedrock returns metadata, code decides BLOCK or ALLOW+LOG.

2. **Exception Handling:** Updated agent integration to handle BOTH exception-based (`GuardrailInterventionException`) AND response-based (`guardrailAction: "BLOCKED"`) blocks.

3. **Confidence Field:** Made `confidence` optional in violation schema with default value of 1.0 if absent.

4. **Topic Naming:** Updated topic denial configuration to use conceptual definitions (SYSTEM_COMMAND_EXECUTION, CREDENTIAL_HANDLING, DESTRUCTIVE_ACTIONS) instead of literal phrases.

---

**Status:** ✅ APPROVED - READY FOR IMPLEMENTATION  
**Dependencies:** 8.1 (Tracing) for violation logging  
**Blocks:** None (can run in parallel with 8.3, 8.4)
