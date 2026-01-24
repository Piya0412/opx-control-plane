#!/bin/bash

echo "=== Phase 2.3 Step 8: End-to-End Verification ==="
echo ""

echo "Waiting 60 seconds for processing..."
sleep 60

echo ""
echo "=== 1. Checking opx-signals table ==="
SIGNAL_COUNT=$(aws dynamodb scan --table-name opx-signals --filter-expression "contains(service, :service)" --expression-attribute-values '{":service":{"S":"testapi"}}' --select COUNT --query "Count" --output text)
echo "Signals found: $SIGNAL_COUNT (expected: 3)"

echo ""
echo "=== 2. Checking opx-candidates table ==="
CANDIDATE_COUNT=$(aws dynamodb scan --table-name opx-candidates --select COUNT --query "Count" --output text)
echo "Candidates found: $CANDIDATE_COUNT (expected: 1)"

if [ "$CANDIDATE_COUNT" -gt "0" ]; then
  echo "Candidate details:"
  aws dynamodb scan --table-name opx-candidates --query "Items[0].[pk.S, suggestedTitle.S, signalCount.N]" --output table
fi

echo ""
echo "=== 3. Checking opx-promotion-decisions table ==="
DECISION_COUNT=$(aws dynamodb scan --table-name opx-promotion-decisions --select COUNT --query "Count" --output text)
echo "Decisions found: $DECISION_COUNT (expected: 1)"

if [ "$DECISION_COUNT" -gt "0" ]; then
  echo "Decision details:"
  aws dynamodb scan --table-name opx-promotion-decisions --query "Items[0].[pk.S, decision.S]" --output table
fi

echo ""
echo "=== 4. Checking opx-incidents table ==="
INCIDENT_COUNT=$(aws dynamodb scan --table-name opx-incidents --filter-expression "contains(service, :service)" --expression-attribute-values '{":service":{"S":"testapi"}}' --select COUNT --query "Count" --output text)
echo "Incidents found: $INCIDENT_COUNT (expected: 1)"

if [ "$INCIDENT_COUNT" -gt "0" ]; then
  echo "Incident details:"
  aws dynamodb scan --table-name opx-incidents --filter-expression "contains(service, :service)" --expression-attribute-values '{":service":{"S":"testapi"}}' --query "Items[0].[pk.S, state.S, severity.S]" --output table
fi

echo ""
echo "=== 5. Checking opx-orchestration-log table ==="
ORCH_COUNT=$(aws dynamodb scan --table-name opx-orchestration-log --select COUNT --query "Count" --output text)
echo "Orchestration logs found: $ORCH_COUNT (expected: 1)"

echo ""
echo "=== Summary ==="
echo "Signals: $SIGNAL_COUNT / 3"
echo "Candidates: $CANDIDATE_COUNT / 1"
echo "Decisions: $DECISION_COUNT / 1"
echo "Incidents: $INCIDENT_COUNT / 1"
echo "Orchestration logs: $ORCH_COUNT / 1"

if [ "$SIGNAL_COUNT" -eq "3" ] && [ "$CANDIDATE_COUNT" -eq "1" ] && [ "$DECISION_COUNT" -eq "1" ] && [ "$INCIDENT_COUNT" -eq "1" ] && [ "$ORCH_COUNT" -eq "1" ]; then
  echo ""
  echo "✅ ALL CHECKS PASSED"
else
  echo ""
  echo "❌ SOME CHECKS FAILED"
fi
