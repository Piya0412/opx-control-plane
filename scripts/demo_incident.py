#!/usr/bin/env python3
"""
OPX Control Plane - Minimal Demo Script

Triggers a sample incident and executes the LangGraph agent pipeline.
This demonstrates the end-to-end flow without requiring a UI.

Usage:
    python scripts/demo_incident.py
    
    # Or with custom incident
    python scripts/demo_incident.py --service api-gateway --severity SEV1
"""

import json
import boto3
import time
import sys
from datetime import datetime, timezone
from typing import Dict, Any
from decimal import Decimal

# AWS Clients
lambda_client = boto3.client('lambda')
dynamodb = boto3.resource('dynamodb')

# Configuration (from CloudFormation outputs)
EXECUTOR_LAMBDA_NAME = "OpxPhase6Stack-Phase6ExecutorLambdaFunction82D7505-Qfic0Ptp2Ypa"
CHECKPOINT_TABLE_NAME = "opx-langgraph-checkpoints-dev"
INCIDENTS_TABLE_NAME = "opx-incidents"
SIGNALS_TABLE_NAME = "opx-signals"

def create_sample_signals(service: str, severity: str) -> list[str]:
    """Create sample signals in DynamoDB"""
    print(f"\n📊 Creating sample signals for {service} ({severity})...")
    
    signals_table = dynamodb.Table(SIGNALS_TABLE_NAME)
    signal_ids = []
    
    # Create 3 correlated signals
    signal_types = [
        ("high-error-rate", "Error rate exceeded threshold"),
        ("high-latency", "P99 latency above 2000ms"),
        ("connection-pool-exhaustion", "Connection pool at 95% capacity")
    ]
    
    timestamp = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    
    for i, (signal_type, description) in enumerate(signal_types):
        signal_id = f"signal-{service}-{signal_type}-{int(time.time())}-{i}"
        
        signal = {
            'signalId': signal_id,
            'service': service,
            'severity': severity,
            'signalType': signal_type,
            'description': description,
            'observedAt': timestamp,
            'source': 'demo-script',
            'metadata': {
                'demo': True,
                'timestamp': timestamp
            }
        }
        
        signals_table.put_item(Item=signal)
        signal_ids.append(signal_id)
        print(f"  ✅ Created signal: {signal_id}")
    
    return signal_ids

def create_sample_incident(service: str, severity: str, signal_ids: list[str]) -> str:
    """Create sample incident in DynamoDB"""
    print(f"\n🚨 Creating sample incident...")
    
    incidents_table = dynamodb.Table(INCIDENTS_TABLE_NAME)
    
    incident_id = f"incident-{service}-{int(time.time())}"
    timestamp = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    
    # Use proper DynamoDB schema with pk/sk
    incident = {
        'pk': f'INCIDENT#{incident_id}',
        'sk': 'v1',
        'incidentId': incident_id,
        'service': service,
        'severity': severity,
        'status': 'OPEN',
        'state': 'OPEN',  # For GSI compatibility
        'title': f'{service} experiencing {severity} issues',
        'description': f'Multiple signals detected for {service}: high error rate, high latency, connection pool exhaustion',
        'signalIds': signal_ids,
        'confidenceScore': Decimal('0.85'),
        'detectionCount': len(signal_ids),
        'evidenceGraphCount': 1,
        'blastRadiusScope': 'SINGLE_SERVICE',
        'incidentVersion': 1,
        'createdAt': timestamp,
        'lastModifiedAt': timestamp,
        'tags': ['demo'],
        'metadata': {
            'demo': True,
            'source': 'demo-script'
        }
    }
    
    incidents_table.put_item(Item=incident)
    print(f"  ✅ Created incident: {incident_id}")
    
    return incident_id

def invoke_langgraph_executor(incident_id: str, service: str, severity: str) -> Dict[str, Any]:
    """Invoke the LangGraph executor Lambda"""
    print(f"\n🤖 Invoking LangGraph agent pipeline...")
    
    # Lambda expects EventBridge event format
    payload = {
        'detail-type': 'IncidentCreated',
        'source': 'opx.demo',
        'detail': {
            'incident_id': incident_id,
            'service': service,
            'severity': severity,
            'evidence_bundle': {
                'signals': [
                    {'type': 'high-error-rate', 'value': 0.15},
                    {'type': 'high-latency', 'value': 2500},
                    {'type': 'connection-pool-exhaustion', 'value': 0.95}
                ],
                'confidence_score': 0.85,
                'detection_count': 3
            },
            'budget_limit': 10.0
        }
    }
    
    try:
        response = lambda_client.invoke(
            FunctionName=EXECUTOR_LAMBDA_NAME,
            InvocationType='RequestResponse',  # Synchronous
            Payload=json.dumps(payload)
        )
        
        result = json.loads(response['Payload'].read())
        
        if response['StatusCode'] == 200:
            print(f"  ✅ Execution successful")
            if 'errorMessage' in result:
                print(f"  ⚠️  Lambda returned error: {result.get('errorMessage', 'Unknown error')}")
                if 'errorType' in result:
                    print(f"     Error type: {result['errorType']}")
            return result
        else:
            print(f"  ❌ Execution failed: {result}")
            return result
            
    except Exception as e:
        print(f"  ❌ Error invoking Lambda: {e}")
        return {'error': str(e)}

def check_checkpoints(incident_id: str):
    """Check if checkpoints were created"""
    print(f"\n💾 Checking LangGraph checkpoints...")
    
    checkpoint_table = dynamodb.Table(CHECKPOINT_TABLE_NAME)
    
    try:
        # The checkpoint table uses session_id as partition key
        response = checkpoint_table.query(
            KeyConditionExpression='session_id = :sid',
            ExpressionAttributeValues={
                ':sid': incident_id
            },
            Limit=5
        )
        
        checkpoints = response.get('Items', [])
        
        if checkpoints:
            print(f"  ✅ Found {len(checkpoints)} checkpoint(s)")
            for cp in checkpoints:
                print(f"     - Checkpoint ID: {cp.get('checkpoint_id', 'N/A')}")
                print(f"       Session ID: {cp.get('session_id', 'N/A')}")
        else:
            print(f"  ⚠️  No checkpoints found (execution may have failed or not yet completed)")
            
    except Exception as e:
        print(f"  ⚠️  Error querying checkpoints: {e}")
        print(f"     Note: Checkpoints may not be created if Lambda execution failed")

def print_inspection_guide(incident_id: str, service: str):
    """Print guide for inspecting results"""
    print(f"\n" + "="*70)
    print(f"📋 DEMO COMPLETE - Inspection Guide")
    print(f"="*70)
    
    print(f"\n1️⃣  View Incident in DynamoDB:")
    print(f"   aws dynamodb get-item \\")
    print(f"     --table-name {INCIDENTS_TABLE_NAME} \\")
    key_json = json.dumps({"pk": {"S": f"INCIDENT#{incident_id}"}, "sk": {"S": "v1"}})
    print(f"     --key '{key_json}'")
    
    print(f"\n2️⃣  View Signals:")
    print(f"   aws dynamodb query \\")
    print(f"     --table-name {SIGNALS_TABLE_NAME} \\")
    print(f"     --index-name service-observedAt-index \\")
    print(f"     --key-condition-expression \"service = :svc\" \\")
    svc_json = json.dumps({":svc": {"S": service}})
    print(f"     --expression-attribute-values '{svc_json}'")
    
    print(f"\n3️⃣  View LangGraph Checkpoints:")
    print(f"   aws dynamodb query \\")
    print(f"     --table-name {CHECKPOINT_TABLE_NAME} \\")
    print(f"     --key-condition-expression \"session_id = :sid\" \\")
    sid_json = json.dumps({":sid": {"S": incident_id}})
    print(f"     --expression-attribute-values '{sid_json}'")
    
    print(f"\n4️⃣  View Lambda Logs:")
    print(f"   aws logs tail /aws/lambda/{EXECUTOR_LAMBDA_NAME} --follow")
    
    print(f"\n5️⃣  View CloudWatch Metrics:")
    print(f"   Open: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=OPX-Token-Analytics")
    
    print(f"\n6️⃣  View Guardrail Violations:")
    print(f"   aws dynamodb scan --table-name opx-guardrail-violations --limit 10")
    
    print(f"\n7️⃣  View Validation Errors:")
    print(f"   aws dynamodb scan --table-name opx-validation-errors --limit 10")
    
    print(f"\n" + "="*70)

def main():
    """Main demo execution"""
    import argparse
    
    parser = argparse.ArgumentParser(description='OPX Control Plane Demo')
    parser.add_argument('--service', default='api-gateway', help='Service name')
    parser.add_argument('--severity', default='SEV2', choices=['SEV1', 'SEV2', 'SEV3', 'SEV4'], help='Incident severity')
    args = parser.parse_args()
    
    print("="*70)
    print("🚀 OPX Control Plane - Demo Execution")
    print("="*70)
    print(f"\nService: {args.service}")
    print(f"Severity: {args.severity}")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')}")
    
    try:
        # Step 1: Create signals
        signal_ids = create_sample_signals(args.service, args.severity)
        
        # Step 2: Create incident
        incident_id = create_sample_incident(args.service, args.severity, signal_ids)
        
        # Step 3: Invoke LangGraph executor
        result = invoke_langgraph_executor(incident_id, args.service, args.severity)
        
        # Print result summary
        if 'error' in result:
            print(f"\n⚠️  Lambda execution had errors")
        elif 'errorMessage' in result:
            print(f"\n⚠️  Lambda returned error: {result['errorMessage']}")
        else:
            print(f"\n✅ Lambda execution completed")
            if 'statusCode' in result:
                print(f"   Status: {result['statusCode']}")
            if 'body' in result:
                print(f"   Response: {result['body'][:200] if len(str(result['body'])) > 200 else result['body']}")
        
        # Step 4: Check checkpoints
        time.sleep(2)  # Wait for async writes
        check_checkpoints(incident_id)
        
        # Step 5: Print inspection guide
        print_inspection_guide(incident_id, args.service)
        
        print(f"\n✅ Demo completed successfully!")
        print(f"   Incident ID: {incident_id}")
        
        return 0
        
    except Exception as e:
        print(f"\n❌ Demo failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == '__main__':
    sys.exit(main())
