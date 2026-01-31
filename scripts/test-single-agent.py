#!/usr/bin/env python3
"""
Test a single Bedrock Agent invocation to verify it's working.
"""

import boto3
import json
import sys
from datetime import datetime

# Agent configuration
AGENT_ID = "KGROVN1CL8"  # signal-intelligence
ALIAS_ID = "DJM7NIDPKQ"

def test_agent():
    """Test agent invocation and print raw response."""
    
    client = boto3.client("bedrock-agent-runtime")
    
    # Simple test input
    input_text = json.dumps({
        "incidentId": "test-incident-123",
        "evidenceBundle": {
            "signals": [
                {"type": "high-error-rate", "value": 0.15},
                {"type": "high-latency", "value": 2500}
            ],
            "confidence_score": 0.85,
            "detection_count": 2
        },
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "executionId": "test-exec-123",
        "budgetRemaining": 10.0
    })
    
    print(f"Testing agent: {AGENT_ID}")
    print(f"Alias: {ALIAS_ID}")
    print(f"Input: {input_text[:200]}...")
    print("\n" + "="*80)
    print("Invoking agent...")
    print("="*80 + "\n")
    
    try:
        response = client.invoke_agent(
            agentId=AGENT_ID,
            agentAliasId=ALIAS_ID,
            sessionId=f"test-session-{int(datetime.utcnow().timestamp())}",
            inputText=input_text,
            enableTrace=True
        )
        
        print(f"Response keys: {list(response.keys())}")
        print(f"Response metadata: {response.get('ResponseMetadata', {})}")
        print("\n" + "="*80)
        print("Consuming event stream...")
        print("="*80 + "\n")
        
        # Consume the event stream
        chunks = []
        chunk_count = 0
        
        completion = response.get("completion")
        if not completion:
            print("ERROR: No 'completion' field in response!")
            print(f"Available fields: {list(response.keys())}")
            return
        
        for event in completion:
            chunk_count += 1
            print(f"Event {chunk_count}: {list(event.keys())}")
            
            if "chunk" in event:
                chunk = event["chunk"]
                if "bytes" in chunk:
                    chunk_text = chunk["bytes"].decode("utf-8")
                    chunks.append(chunk_text)
                    print(f"  Chunk text (first 100 chars): {chunk_text[:100]}")
            
            if "trace" in event:
                print(f"  Trace event: {event['trace']}")
        
        print("\n" + "="*80)
        print(f"Stream consumption complete. Total chunks: {chunk_count}")
        print("="*80 + "\n")
        
        if chunks:
            full_text = "".join(chunks)
            print("RAW BEDROCK OUTPUT:")
            print("-" * 80)
            print(full_text)
            print("-" * 80)
            
            # Try to parse as JSON
            try:
                parsed = json.loads(full_text)
                print("\n✅ Successfully parsed as JSON")
                print(json.dumps(parsed, indent=2)[:500])
            except json.JSONDecodeError as e:
                print(f"\n❌ Failed to parse as JSON: {e}")
        else:
            print("⚠️  No chunks received from agent!")
            print("This means the agent returned an empty response.")
        
    except Exception as e:
        print(f"❌ ERROR: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(test_agent())
