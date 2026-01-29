#!/usr/bin/env python3
"""Basic agent connectivity test"""

import boto3
import sys
from datetime import datetime

AGENT_ID = "KGROVN1CL8"
AGENT_ALIAS_ID = "TSTALIASID"
SESSION_ID = f"test-basic-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
TEST_INPUT = "What is 2 plus 2?"

print(f"Testing agent connectivity...")
print(f"Agent: {AGENT_ID}")
print(f"Input: {TEST_INPUT}")

client = boto3.client('bedrock-agent-runtime', region_name='us-east-1')

try:
    response = client.invoke_agent(
        agentId=AGENT_ID,
        agentAliasId=AGENT_ALIAS_ID,
        sessionId=SESSION_ID,
        inputText=TEST_INPUT
    )
    
    completion = ""
    for event in response['completion']:
        if 'chunk' in event:
            if 'bytes' in event['chunk']:
                completion += event['chunk']['bytes'].decode('utf-8')
    
    print(f"\n✅ Agent responded: {completion[:100]}...")
    
except Exception as e:
    print(f"\n❌ Error: {e}")
    sys.exit(1)
