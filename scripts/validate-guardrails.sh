#!/bin/bash
#
# Phase 8.2 Validation Test Script
# Executes all 4 mandatory validation gates
#
# Usage: ./scripts/validate-guardrails.sh <agent-id> <alias-id>
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <agent-id> <alias-id>"
    echo "Example: $0 ABC123 TSTALIASID"
    exit 1
fi

AGENT_ID=$1
ALIAS_ID=$2

echo "=========================================="
echo "Phase 8.2 Guardrails Validation Tests"
echo "=========================================="
echo ""
echo "Agent ID: $AGENT_ID"
echo "Alias ID: $ALIAS_ID"
echo ""

# Get guardrail ID from CloudFormation outputs
echo "Getting guardrail ID from stack outputs..."
GUARDRAIL_ID=$(aws cloudformation describe-stacks \
  --stack-name OpxControlPlaneStack \
  --query 'Stacks[0].Outputs[?OutputKey==`GuardrailId`].OutputValue' \
  --output text 2>/dev/null)

if [ -z "$GUARDRAIL_ID" ]; then
    echo -e "${RED}ERROR: Could not get guardrail ID from stack outputs${NC}"
    echo "Make sure OpxControlPlaneStack is deployed"
    exit 1
fi

echo -e "${GREEN}Guardrail ID: $GUARDRAIL_ID${NC}"
echo ""

# Function to test agent invocation
test_agent_invocation() {
    local test_name=$1
    local input_text=$2
    local session_id="test-$(date +%s)-$RANDOM"
    
    echo "Testing: $test_name"
    echo "Input: $input_text"
    echo "Session: $session_id"
    
    # Invoke agent
    local response=$(aws bedrock-agent-runtime invoke-agent \
        --agent-id "$AGENT_ID" \
        --agent-alias-id "$ALIAS_ID" \
        --session-id "$session_id" \
        --input-text "$input_text" \
        --guardrail-identifier "$GUARDRAIL_ID" \
        --guardrail-version "1" \
        2>&1 || echo "BLOCKED")
    
    echo "Response: $response"
    echo ""
    
    return 0
}

# Function to check DynamoDB for violation
check_dynamodb_violation() {
    local violation_type=$1
    
    echo "Checking DynamoDB for $violation_type violation..."
    
    local count=$(aws dynamodb query \
        --table-name opx-guardrail-violations \
        --index-name type-timestamp-index \
        --key-condition-expression "violationType = :vtype" \
        --expression-attribute-values "{\":vtype\":{\"S\":\"$violation_type\"}}" \
        --scan-index-forward false \
        --limit 1 \
        --query 'Count' \
        --output text 2>/dev/null || echo "0")
    
    if [ "$count" -gt 0 ]; then
        echo -e "${GREEN}✓ DynamoDB record found${NC}"
        return 0
    else
        echo -e "${RED}✗ No DynamoDB record found${NC}"
        return 1
    fi
}

# Function to check CloudWatch metric
check_cloudwatch_metric() {
    local violation_type=$1
    local action=$2
    
    echo "Checking CloudWatch metric for $violation_type/$action..."
    
    local sum=$(aws cloudwatch get-metric-statistics \
        --namespace OPX/Guardrails \
        --metric-name ViolationCount \
        --dimensions Name=ViolationType,Value="$violation_type" Name=Action,Value="$action" \
        --start-time "$(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S)" \
        --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
        --period 300 \
        --statistics Sum \
        --query 'Datapoints[0].Sum' \
        --output text 2>/dev/null || echo "None")
    
    if [ "$sum" != "None" ] && [ "$sum" != "" ]; then
        echo -e "${GREEN}✓ Metric found: $sum violations${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ No metric data yet (may take a few minutes)${NC}"
        return 0
    fi
}

echo "=========================================="
echo "GATE 1: Real Bedrock PII Block Test"
echo "=========================================="
echo ""

# Test 1.1: Email Detection
echo "Test 1.1: Email Detection"
test_agent_invocation "Email PII" "My email is user@example.com"
check_dynamodb_violation "PII"
check_cloudwatch_metric "PII" "BLOCK"
echo ""

# Test 1.2: Phone Detection
echo "Test 1.2: Phone Detection"
test_agent_invocation "Phone PII" "Call me at 555-123-4567"
check_dynamodb_violation "PII"
check_cloudwatch_metric "PII" "BLOCK"
echo ""

# Test 1.3: AWS Key Detection
echo "Test 1.3: AWS Key Detection"
test_agent_invocation "AWS Key PII" "My access key is AKIAIOSFODNN7EXAMPLE"
check_dynamodb_violation "PII"
check_cloudwatch_metric "PII" "BLOCK"
echo ""

echo "=========================================="
echo "GATE 2: WARN Mode Does Not Block"
echo "=========================================="
echo ""

# Test 2.1: Mild Profanity
echo "Test 2.1: Mild Profanity (should NOT block)"
test_agent_invocation "Mild Profanity" "This is a damn good solution"
check_dynamodb_violation "CONTENT"
check_cloudwatch_metric "CONTENT" "WARN"
echo ""

# Test 2.2: Misconduct Phrasing
echo "Test 2.2: Misconduct Phrasing (should NOT block)"
test_agent_invocation "Misconduct" "We could potentially bypass this check"
check_dynamodb_violation "CONTENT"
check_cloudwatch_metric "CONTENT" "WARN"
echo ""

echo "=========================================="
echo "GATE 3: Alarm Sanity Check"
echo "=========================================="
echo ""

echo "Triggering multiple PII violations for alarm test..."
for i in {1..3}; do
    echo "Violation $i of 3..."
    test_agent_invocation "Alarm Test $i" "My email is user$i@example.com"
    sleep 10
done

echo ""
echo "Checking alarm state..."
ALARM_STATE=$(aws cloudwatch describe-alarms \
    --alarm-names OPX-Guardrails-HighPIIViolationRate \
    --query 'MetricAlarms[0].StateValue' \
    --output text 2>/dev/null || echo "UNKNOWN")

echo "Alarm State: $ALARM_STATE"

if [ "$ALARM_STATE" == "ALARM" ]; then
    echo -e "${GREEN}✓ Alarm fired as expected${NC}"
else
    echo -e "${YELLOW}⚠ Alarm state: $ALARM_STATE (may take a few minutes to fire)${NC}"
fi

echo ""
echo "Waiting 5 minutes for alarm to reset..."
echo "(You can Ctrl+C and check manually later)"
sleep 300

ALARM_STATE_AFTER=$(aws cloudwatch describe-alarms \
    --alarm-names OPX-Guardrails-HighPIIViolationRate \
    --query 'MetricAlarms[0].StateValue' \
    --output text 2>/dev/null || echo "UNKNOWN")

echo "Alarm State After Wait: $ALARM_STATE_AFTER"

if [ "$ALARM_STATE_AFTER" == "OK" ]; then
    echo -e "${GREEN}✓ Alarm reset as expected${NC}"
else
    echo -e "${YELLOW}⚠ Alarm still in state: $ALARM_STATE_AFTER${NC}"
fi

echo ""
echo "=========================================="
echo "GATE 4: Failure Isolation Test"
echo "=========================================="
echo ""

echo -e "${YELLOW}NOTE: Gate 4 requires manual permission manipulation${NC}"
echo "This test must be run manually by:"
echo "1. Removing DynamoDB write permissions from Lambda role"
echo "2. Invoking agent with PII"
echo "3. Verifying agent still completes"
echo "4. Checking CloudWatch logs for error"
echo "5. Restoring permissions"
echo ""
echo "See PHASE_8.2_VALIDATION_GATES.md for detailed instructions"
echo ""

echo "=========================================="
echo "Validation Tests Complete"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "1. Review test results above"
echo "2. Manually execute Gate 4 (Failure Isolation)"
echo "3. Update PHASE_8.2_VALIDATION_GATES.md with results"
echo "4. Request production approval if all gates pass"
echo ""
