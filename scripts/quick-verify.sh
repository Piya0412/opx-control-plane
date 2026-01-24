#!/bin/bash
echo "Waiting 60 seconds..."
sleep 60

echo "Signals: $(aws dynamodb scan --table-name opx-signals --filter-expression 'contains(service, :s)' --expression-attribute-values '{":s":{"S":"testapi"}}' --select COUNT --query Count --output text)"
echo "Candidates: $(aws dynamodb scan --table-name opx-candidates --select COUNT --query Count --output text)"
echo "Decisions: $(aws dynamodb scan --table-name opx-promotion-decisions --select COUNT --query Count --output text)"
echo "Incidents: $(aws dynamodb scan --table-name opx-incidents --filter-expression 'contains(service, :s)' --expression-attribute-values '{":s":{"S":"testapi"}}' --select COUNT --query Count --output text)"
