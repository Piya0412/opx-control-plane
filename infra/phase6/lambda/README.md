# LangGraph Multi-Agent Orchestrator

**Phase 6 Week 2: Build LangGraph**

This package implements the Bedrock + LangGraph multi-agent orchestration system.

## Architecture

```
START → Budget Check → [4 Core Agents] → Knowledge RAG → 
Response Strategy → Consensus → Cost Guardian → END
```

### Agents (8+)

**Core Analysis Agents (4):**
1. Signal Intelligence Agent
2. Historical Pattern Agent
3. Change Intelligence Agent
4. Risk & Blast Radius Agent

**Knowledge & Strategy Agents (2):**
5. Knowledge RAG Agent
6. Response Strategy Agent

**Governance & Quality Agents (2):**
7. Consensus & Confidence Agent
8. Cost & Budget Guardian Agent

## Files

- `state.py` - LangGraph state schema and state management functions
- `graph.py` - Graph definition with nodes and edges
- `checkpointing.py` - DynamoDB checkpointer for replay determinism
- `orchestrator.py` - AWS Lambda handler
- `test_state.py` - Unit tests for state management
- `test_graph.py` - Unit tests for graph execution

## State Schema

```python
class LangGraphState(TypedDict):
    # Input
    incident_id: str
    evidence_bundle: Dict[str, Any]
    
    # Execution tracking
    execution_id: str
    start_time: str
    thread_id: str
    
    # Agent outputs (8 agents)
    signal_intelligence: Optional[AgentOutput]
    historical_pattern: Optional[AgentOutput]
    change_intelligence: Optional[AgentOutput]
    risk_blast_radius: Optional[AgentOutput]
    knowledge_rag: Optional[AgentOutput]
    response_strategy: Optional[AgentOutput]
    
    # Consensus
    consensus: Optional[ConsensusOutput]
    
    # Budget tracking
    budget: BudgetState
    
    # Retry tracking
    retries: Dict[str, int]
    
    # Checkpointing
    checkpoint_node: str
    checkpoint_timestamp: str
    
    # Error tracking
    errors: Optional[List[Dict[str, str]]]
```

## Graph Flow

1. **Budget Check** - Verify budget allows execution
2. **Signal Intelligence** - Analyze signals (STUB)
3. **Historical Pattern** - Find similar incidents (STUB)
4. **Change Intelligence** - Correlate changes (STUB)
5. **Risk & Blast Radius** - Estimate impact (STUB)
6. **Knowledge RAG** - Search documentation (STUB)
7. **Response Strategy** - Rank options (STUB)
8. **Consensus** - Aggregate outputs (STUB)
9. **Cost Guardian** - Final budget check (STUB)

**Note:** All agent nodes are STUBS in Week 2. Week 4 will implement actual Bedrock Agent invocations.

## Checkpointing

State is persisted to DynamoDB (`opx-langgraph-state`) at each node for replay determinism.

**Table Schema:**
- Partition Key: `thread_id`
- Sort Key: `checkpoint_id`

## Testing

```bash
# Install dependencies
pip install -r requirements.txt

# Run tests
pytest

# Run with coverage
pytest --cov=. --cov-report=html
```

## Usage

```python
from langgraph.graph import create_graph_with_memory
from langgraph.state import create_initial_state

# Create graph
graph = create_graph_with_memory()

# Create initial state
state = create_initial_state(
    incident_id='inc-123',
    evidence_bundle={'test': 'data'},
    execution_id='exec-456',
    thread_id='thread-789',
    budget_limit=10.0,
)

# Execute graph
config = {'configurable': {'thread_id': 'thread-789'}}
result = graph.invoke(state, config)

print(f"Final checkpoint: {result['checkpoint_node']}")
print(f"Consensus: {result['consensus']}")
```

## Lambda Deployment

The orchestrator is deployed as a single Python Lambda function:

**Function Name:** `opx-langgraph-orchestrator`  
**Runtime:** Python 3.11  
**Handler:** `orchestrator.handler`  
**Timeout:** 5 minutes  
**Memory:** 1024 MB

**Environment Variables:**
- `LANGGRAPH_STATE_TABLE` - DynamoDB table name (default: `opx-langgraph-state`)

## Week 2 Status

✅ **COMPLETE**
- [x] State schema implemented
- [x] Graph structure defined
- [x] DynamoDB checkpointer implemented
- [x] Unit tests passing
- [x] Lambda handler created

⏸️ **PENDING (Week 4)**
- [ ] Bedrock Agent invocations
- [ ] Retry logic with tenacity
- [ ] Timeout handling
- [ ] Parallel agent execution
- [ ] Actual consensus logic

## Next Steps

**Week 3:** Deploy Bedrock Agents with action groups  
**Week 4:** Integrate LangGraph with Bedrock Agents  
**Week 5:** Cleanup and documentation
