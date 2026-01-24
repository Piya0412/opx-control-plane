#!/bin/bash
# Test Signal Ingestion Pipeline
# Creates a test CloudWatch alarm and triggers it to validate Phase 2.1

set -e

echo "🧪 Testing Phase 2.1 Signal Ingestion Pipeline"
echo "=============================================="

# Get SNS topic ARN from stack outputs
SNS_TOPIC_ARN=$(aws cloudformation describe-stacks \
  --stack-name OpxControlPlaneStack \
  --query 'Stacks[0].Outputs[?OutputKey==`AlarmTopicArn`].OutputValue' \
  --output text)

echo "✅ SNS Topic: $SNS_TOPIC_ARN"

# Create a test metric (dummy data)
echo ""
echo "📊 Creating test metric..."
aws cloudwatch put-metric-data \
  --namespace "OPX/Test" \
  --metric-name "TestErrorRate" \
  --value 100 \
  --dimensions Service=test-service

echo "✅ Test metric created"

# Create CloudWatch alarm
echo ""
echo "🚨 Creating test alarm..."
aws cloudwatch put-metric-alarm \
  --alarm-name "test-service-SEV2-HighErrorRate" \
  --alarm-description "Test alarm for Phase 2.1 validation" \
  --metric-name "TestErrorRate" \
  --namespace "OPX/Test" \
  --statistic "Average" \
  --period 60 \
  --evaluation-periods 1 \
  --threshold 50 \
  --comparison-operator "GreaterThanThreshold" \
  --alarm-actions "$SNS_TOPIC_ARN" \
  --dimensions Name=Service,Value=test-service

echo "✅ Test alarm created: test-service-SEV2-HighErrorRate"

# Wait for alarm to trigger
echo ""
echo "⏳ Waiting 30 seconds for alarm to evaluate..."
sleep 30

# Check alarm state
ALARM_STATE=$(aws cloudwatch describe-alarms \
  --alarm-names "test-service-SEV2-HighErrorRate" \
  --query 'MetricAlarms[0].StateValue' \
  --output text)

echo "📊 Alarm state: $ALARM_STATE"

if [ "$ALARM_STATE" = "ALARM" ]; then
  echo "✅ Alarm triggered successfully"
else
  echo "⚠️  Alarm not yet in ALARM state (current: $ALARM_STATE)"
  echo "   This is normal - alarm may take 1-2 minutes to evaluate"
fi

# Check Lambda logs
echo ""
echo "📋 Recent Lambda invocations:"
aws logs tail /aws/lambda/opx-signal-ingestor --since 5m --format short | head -20

# Check DynamoDB for signals
echo ""
echo "📊 Recent signals in DynamoDB:"
aws dynamodb scan \
  --table-name opx-signals \
  --limit 5 \
  --query 'Items[*].[signalId.S, service.S, severity.S, observedAt.S]' \
  --output table

echo ""
echo "=============================================="
echo "✅ Test complete!"
echo ""
echo "Next steps:"
echo "1. Check Lambda logs: aws logs tail /aws/lambda/opx-signal-ingestor --follow"
echo "2. Query signals: aws dynamodb scan --table-name opx-signals"
echo "3. Clean up: aws cloudwatch delete-alarms --alarm-names test-service-SEV2-HighErrorRate"
