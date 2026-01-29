#!/usr/bin/env python3
"""
Create OpenSearch Serverless vector index for Bedrock Knowledge Base.
This script uses AWS SigV4 authentication to create the index.
"""

import boto3
import json
from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth

# Configuration
COLLECTION_ENDPOINT = "8tkajw0xkk4p8jlqnfrg.us-east-1.aoss.amazonaws.com"
INDEX_NAME = "opx-knowledge-index"
REGION = "us-east-1"

def create_index():
    """Create the vector index in OpenSearch Serverless."""
    
    # Get AWS credentials
    session = boto3.Session()
    credentials = session.get_credentials()
    
    # Create auth signer
    auth = AWSV4SignerAuth(credentials, REGION, 'aoss')
    
    # Create OpenSearch client
    client = OpenSearch(
        hosts=[{'host': COLLECTION_ENDPOINT, 'port': 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        timeout=30
    )
    
    # Index mapping for Bedrock Knowledge Base
    index_body = {
        "settings": {
            "index": {
                "knn": True,
                "number_of_shards": 2,
                "number_of_replicas": 0
            }
        },
        "mappings": {
            "properties": {
                "embedding": {
                    "type": "knn_vector",
                    "dimension": 1536,
                    "method": {
                        "name": "hnsw",
                        "engine": "faiss",
                        "parameters": {
                            "ef_construction": 512,
                            "m": 16
                        }
                    }
                },
                "content": {
                    "type": "text"
                },
                "metadata": {
                    "type": "object"
                }
            }
        }
    }
    
    print(f"Creating index: {INDEX_NAME}")
    print(f"Collection: {COLLECTION_ENDPOINT}")
    print("")
    
    try:
        # Check if index already exists
        if client.indices.exists(index=INDEX_NAME):
            print(f"✓ Index '{INDEX_NAME}' already exists")
            return
        
        # Create the index
        response = client.indices.create(
            index=INDEX_NAME,
            body=index_body
        )
        
        print(f"✓ Index '{INDEX_NAME}' created successfully")
        print(f"Response: {json.dumps(response, indent=2)}")
        
    except Exception as e:
        print(f"✗ Error creating index: {str(e)}")
        raise

if __name__ == "__main__":
    create_index()
