"""
Phase 6 Week 2: DynamoDB Checkpointer

Implements LangGraph checkpointing using DynamoDB for replay determinism.
"""

import json
import os
from typing import Optional, Dict, Any
from datetime import datetime

import boto3
from botocore.exceptions import ClientError
from langgraph.checkpoint.base import BaseCheckpointSaver, Checkpoint


class DynamoDBCheckpointer(BaseCheckpointSaver):
    """
    DynamoDB-based checkpointer for LangGraph state persistence.
    
    Stores checkpoints in DynamoDB table with:
    - Partition key: thread_id
    - Sort key: checkpoint_id
    
    This enables replay determinism by persisting state at each node.
    """
    
    def __init__(
        self,
        table_name: Optional[str] = None,
        region_name: str = 'us-east-1',
    ):
        """
        Initialize DynamoDB checkpointer.
        
        Args:
            table_name: DynamoDB table name (defaults to env var)
            region_name: AWS region
        """
        self.table_name = table_name or os.environ.get(
            'LANGGRAPH_STATE_TABLE',
            'opx-langgraph-state'
        )
        self.region_name = region_name
        
        # Initialize DynamoDB client
        self.dynamodb = boto3.resource('dynamodb', region_name=region_name)
        self.table = self.dynamodb.Table(self.table_name)
    
    def put(
        self,
        config: Dict[str, Any],
        checkpoint: Checkpoint,
        metadata: Dict[str, Any],
    ) -> None:
        """
        Save checkpoint to DynamoDB.
        
        Args:
            config: Configuration dict with thread_id
            checkpoint: Checkpoint to save
            metadata: Checkpoint metadata
        """
        thread_id = config.get('configurable', {}).get('thread_id')
        if not thread_id:
            raise ValueError("thread_id required in config.configurable")
        
        checkpoint_id = checkpoint.get('id', datetime.utcnow().isoformat())
        
        try:
            self.table.put_item(
                Item={
                    'thread_id': thread_id,
                    'checkpoint_id': checkpoint_id,
                    'checkpoint': json.dumps(checkpoint),
                    'metadata': json.dumps(metadata),
                    'created_at': datetime.utcnow().isoformat() + 'Z',
                }
            )
        except ClientError as e:
            print(f"[DynamoDBCheckpointer] Error saving checkpoint: {e}")
            raise
    
    def get(
        self,
        config: Dict[str, Any],
    ) -> Optional[Checkpoint]:
        """
        Get latest checkpoint from DynamoDB.
        
        Args:
            config: Configuration dict with thread_id
            
        Returns:
            Latest checkpoint or None
        """
        thread_id = config.get('configurable', {}).get('thread_id')
        if not thread_id:
            return None
        
        try:
            # Query for latest checkpoint
            response = self.table.query(
                KeyConditionExpression='thread_id = :tid',
                ExpressionAttributeValues={':tid': thread_id},
                ScanIndexForward=False,  # Descending order
                Limit=1,
            )
            
            items = response.get('Items', [])
            if not items:
                return None
            
            checkpoint_data = items[0].get('checkpoint')
            if not checkpoint_data:
                return None
            
            return json.loads(checkpoint_data)
            
        except ClientError as e:
            print(f"[DynamoDBCheckpointer] Error getting checkpoint: {e}")
            return None
    
    def list(
        self,
        config: Dict[str, Any],
        limit: int = 10,
    ) -> list:
        """
        List checkpoints for a thread.
        
        Args:
            config: Configuration dict with thread_id
            limit: Maximum number of checkpoints to return
            
        Returns:
            List of checkpoints
        """
        thread_id = config.get('configurable', {}).get('thread_id')
        if not thread_id:
            return []
        
        try:
            response = self.table.query(
                KeyConditionExpression='thread_id = :tid',
                ExpressionAttributeValues={':tid': thread_id},
                ScanIndexForward=False,  # Descending order
                Limit=limit,
            )
            
            items = response.get('Items', [])
            checkpoints = []
            
            for item in items:
                checkpoint_data = item.get('checkpoint')
                if checkpoint_data:
                    checkpoints.append(json.loads(checkpoint_data))
            
            return checkpoints
            
        except ClientError as e:
            print(f"[DynamoDBCheckpointer] Error listing checkpoints: {e}")
            return []


def create_dynamodb_checkpointer(
    table_name: Optional[str] = None,
    region_name: str = 'us-east-1',
) -> DynamoDBCheckpointer:
    """
    Create DynamoDB checkpointer instance.
    
    Args:
        table_name: DynamoDB table name
        region_name: AWS region
        
    Returns:
        DynamoDBCheckpointer instance
    """
    return DynamoDBCheckpointer(
        table_name=table_name,
        region_name=region_name,
    )
