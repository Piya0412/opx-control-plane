"""
Phase 6 Week 2: DynamoDB Checkpointer

Implements LangGraph checkpointing using DynamoDB for replay determinism.
"""

import json
import os
import pickle
from typing import Optional, Dict, Any, Iterator, Sequence
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError
from langgraph.checkpoint.base import (
    BaseCheckpointSaver,
    Checkpoint,
    CheckpointTuple,
    CheckpointMetadata,
)
from langchain_core.runnables import RunnableConfig


class DynamoDBCheckpointer(BaseCheckpointSaver):
    """
    DynamoDB-based checkpointer for LangGraph state persistence.
    
    Stores checkpoints in DynamoDB table with:
    - Partition key: session_id
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
            'LANGGRAPH_CHECKPOINT_TABLE',
            'opx-langgraph-checkpoints-dev'
        )
        self.region_name = region_name
        
        # Initialize DynamoDB client
        self.dynamodb = boto3.resource('dynamodb', region_name=region_name)
        self.table = self.dynamodb.Table(self.table_name)
        
        print(f"[DynamoDBCheckpointer] Initialized with table: {self.table_name}")
    
    def get_tuple(self, config: RunnableConfig) -> Optional[CheckpointTuple]:
        """
        Get latest checkpoint tuple from DynamoDB.
        
        Args:
            config: Runnable configuration with thread_id
            
        Returns:
            CheckpointTuple or None
        """
        # Extract session_id from config
        configurable = config.get('configurable', {})
        session_id = configurable.get('thread_id') or configurable.get('session_id')
        
        if not session_id:
            print("[DynamoDBCheckpointer] No session_id in config, returning None")
            return None
        
        try:
            # Query for latest checkpoint (descending order by checkpoint_id)
            response = self.table.query(
                KeyConditionExpression='session_id = :sid',
                ExpressionAttributeValues={':sid': session_id},
                ScanIndexForward=False,  # Descending order
                Limit=1,
            )
            
            items = response.get('Items', [])
            if not items:
                print(f"[DynamoDBCheckpointer] No checkpoints found for session: {session_id}")
                return None
            
            item = items[0]
            
            # Deserialize checkpoint
            checkpoint_blob = item.get('state_blob')
            if not checkpoint_blob:
                print(f"[DynamoDBCheckpointer] No state_blob in checkpoint")
                return None
            
            # Deserialize using pickle (LangGraph uses pickle for checkpoints)
            checkpoint = pickle.loads(checkpoint_blob.value)
            
            # Deserialize metadata
            metadata_json = item.get('metadata', '{}')
            if isinstance(metadata_json, str):
                metadata = json.loads(metadata_json)
            else:
                metadata = metadata_json
            
            # Create CheckpointTuple
            checkpoint_tuple = CheckpointTuple(
                config=config,
                checkpoint=checkpoint,
                metadata=metadata,
                parent_config=None,  # We don't track parent checkpoints in this implementation
            )
            
            print(f"[DynamoDBCheckpointer] Retrieved checkpoint for session: {session_id}")
            return checkpoint_tuple
            
        except Exception as e:
            print(f"[DynamoDBCheckpointer] Error getting checkpoint: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def put(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: Any = None,  # LangGraph may pass this
    ) -> RunnableConfig:
        """
        Save checkpoint to DynamoDB.
        
        Args:
            config: Runnable configuration
            checkpoint: Checkpoint to save
            metadata: Checkpoint metadata
            new_versions: Optional version information (ignored)
            
        Returns:
            Updated configuration
        """
        # Extract session_id from config
        configurable = config.get('configurable', {})
        session_id = configurable.get('thread_id') or configurable.get('session_id')
        
        if not session_id:
            raise ValueError("session_id or thread_id required in config.configurable")
        
        # Generate checkpoint_id from checkpoint
        checkpoint_id = checkpoint.get('id', datetime.now(timezone.utc).isoformat())
        
        try:
            # Serialize checkpoint using pickle (LangGraph standard)
            checkpoint_blob = pickle.dumps(checkpoint)
            
            # Serialize metadata - handle non-JSON-serializable objects
            if metadata:
                try:
                    metadata_json = json.dumps(metadata)
                except (TypeError, ValueError):
                    # If metadata contains non-serializable objects, pickle it
                    metadata_json = json.dumps({'_pickled': True})
                    print(f"[DynamoDBCheckpointer] Metadata not JSON-serializable, using simplified version")
            else:
                metadata_json = '{}'
            
            # Store in DynamoDB
            self.table.put_item(
                Item={
                    'session_id': session_id,
                    'checkpoint_id': str(checkpoint_id),
                    'state_blob': checkpoint_blob,
                    'metadata': metadata_json,
                    'node_name': str(metadata.get('source', 'unknown')) if metadata else 'unknown',
                    'created_at': datetime.now(timezone.utc).isoformat(),
                }
            )
            
            print(f"[DynamoDBCheckpointer] Saved checkpoint {checkpoint_id} for session: {session_id}")
            return config
            
        except Exception as e:
            print(f"[DynamoDBCheckpointer] Error saving checkpoint: {e}")
            import traceback
            traceback.print_exc()
            raise
    
    def list(
        self,
        config: RunnableConfig,
        *,
        filter: Optional[Dict[str, Any]] = None,
        before: Optional[RunnableConfig] = None,
        limit: Optional[int] = None,
    ) -> Iterator[CheckpointTuple]:
        """
        List checkpoints for a session.
        
        Args:
            config: Runnable configuration
            filter: Optional filter criteria
            before: Optional checkpoint to start before
            limit: Maximum number of checkpoints to return
            
        Yields:
            CheckpointTuple instances
        """
        # Extract session_id from config
        configurable = config.get('configurable', {})
        session_id = configurable.get('thread_id') or configurable.get('session_id')
        
        if not session_id:
            print("[DynamoDBCheckpointer] No session_id in config for list()")
            return
        
        try:
            # Query for checkpoints
            query_params = {
                'KeyConditionExpression': 'session_id = :sid',
                'ExpressionAttributeValues': {':sid': session_id},
                'ScanIndexForward': False,  # Descending order
            }
            
            if limit:
                query_params['Limit'] = limit
            
            response = self.table.query(**query_params)
            items = response.get('Items', [])
            
            print(f"[DynamoDBCheckpointer] Found {len(items)} checkpoints for session: {session_id}")
            
            for item in items:
                try:
                    # Deserialize checkpoint
                    checkpoint_blob = item.get('state_blob')
                    if not checkpoint_blob:
                        continue
                    
                    checkpoint = pickle.loads(checkpoint_blob.value)
                    
                    # Deserialize metadata
                    metadata_json = item.get('metadata', '{}')
                    if isinstance(metadata_json, str):
                        metadata = json.loads(metadata_json)
                    else:
                        metadata = metadata_json
                    
                    # Yield CheckpointTuple
                    yield CheckpointTuple(
                        config=config,
                        checkpoint=checkpoint,
                        metadata=metadata,
                        parent_config=None,
                    )
                    
                except Exception as e:
                    print(f"[DynamoDBCheckpointer] Error deserializing checkpoint: {e}")
                    continue
            
        except Exception as e:
            print(f"[DynamoDBCheckpointer] Error listing checkpoints: {e}")
            import traceback
            traceback.print_exc()
    
    def put_writes(
        self,
        config: RunnableConfig,
        writes: Sequence[tuple],
        task_id: str,
    ) -> None:
        """
        Store intermediate writes (required by LangGraph).
        
        This is called to store writes before they're committed to a checkpoint.
        For simplicity, we'll just log and ignore since we're storing full checkpoints.
        
        Args:
            config: Runnable configuration
            writes: Sequence of (channel, value) tuples
            task_id: Task identifier
        """
        # For now, we don't store intermediate writes separately
        # They'll be captured in the full checkpoint via put()
        print(f"[DynamoDBCheckpointer] put_writes called for task: {task_id} (no-op)")
        pass


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
