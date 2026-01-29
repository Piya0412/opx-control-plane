#!/usr/bin/env python3
"""
Recreate OpenSearch index with correct metadata mapping for Bedrock.
"""

import boto3
from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth

COLLECTION_ENDPOINT = "8tkajw0xkk4p8jlqnfrg.us-east-1.aoss.amazonaws.com"
INDEX_NAME = "opx-knowledge-index"
REGION = "us-east-1"

def recreate_index():
    """Delete and recreate the index."""
    
    session = boto3.Session()
    credentials = session.get_credentials()
    auth = AWSV4SignerAuth(credentials, REGION, 'aoss')
    
    client = OpenSearch(
        hosts=[{'host': COLLECTION_ENDPOINT, 'port': 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        timeout=30
    )
    
    # Delete existing index
    if client.indices.exists(index=INDEX_NAME):
        print(f"Deleting existing index: {INDEX_NAME}")
        client.indices.delete(index=INDEX_NAME)
        print("✓ Index deleted")
    
    # Create new index with correct mapping
    # Use the exact field names specified in Knowledge Base configuration
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
                    "type": "text",
                    "index": False
                }
            }
        }
    }
    
    print(f"Creating index: {INDEX_NAME}")
    response = client.indices.create(
        index=INDEX_NAME,
        body=index_body
    )
    
    print(f"✓ Index created successfully")
    print(f"Response: {response}")

if __name__ == "__main__":
    recreate_index()
