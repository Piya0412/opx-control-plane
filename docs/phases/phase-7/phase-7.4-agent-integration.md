# Phase 7.4: Knowledge RAG Agent Integration

**Phase:** 7.4 (Knowledge Base - Agent Integration)  
**Authority:** Principal Architect  
**Depends On:** Phase 7.3 (Bedrock Knowledge Base Deployment)

---

## Objective

Integrate **Bedrock Knowledge Base** with the existing **Knowledge RAG Agent** (Phase 6) to enable:
1. Semantic search over runbooks and postmortems
2. Citation-backed recommendations
3. Context-aware incident resolution guidance
4. Read-only access with no feedback loops

---

## Architecture

```
LangGraph Orchestrator
  ↓ (invokes)
Knowledge RAG Agent (Bedrock Agent)
  ↓ (action group: retrieve_knowledge)
Bedrock Knowledge Base
  ↓ (semantic search)
OpenSearch Serverless
  ↓ (returns chunks with citations)
Knowledge RAG Agent
  ↓ (formats response with citations)
Advisory Recommendation
```

---

## Integration Points

### 1. Action Group: `retrieve_knowledge`

**Purpose:** Query Knowledge Base and return relevant chunks with citations

**API Schema:**
```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "Knowledge Retrieval API",
    "version": "1.0.0"
  },
  "paths": {
    "/retrieve": {
      "post": {
        "summary": "Retrieve relevant knowledge chunks",
        "operationId": "retrieve_knowledge",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "query": {
                    "type": "string",
                    "description": "Natural language query (e.g., 'How to handle RDS failover?')"
                  },
                  "max_results": {
                    "type": "integer",
                    "default": 5,
                    "description": "Maximum number of results to return"
                  }
                },
                "required": ["query"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Relevant knowledge chunks with citations",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "results": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "content": {
                            "type": "string",
                            "description": "Chunk text"
                          },
                          "citation": {
                            "type": "object",
                            "properties": {
                              "source_file": { "type": "string" },
                              "start_line": { "type": "integer" },
                              "end_line": { "type": "integer" },
                              "section_header": { "type": "string" }
                            }
                          },
                          "relevance_score": {
                            "type": "number",
                            "description": "Similarity score (0-1)"
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

### 2. Action Group Lambda Handler

**File:** `src/langgraph/action_groups/knowledge_retrieval.py`

**Implementation:**
```python
import boto3
from typing import Dict, List, Any

bedrock_agent_runtime = boto3.client('bedrock-agent-runtime')

KNOWLEDGE_BASE_ID = os.environ['KNOWLEDGE_BASE_ID']

def retrieve_knowledge(query: str, max_results: int = 5) -> Dict[str, Any]:
    """
    Query Bedrock Knowledge Base and return relevant chunks with citations.
    
    Args:
        query: Natural language query
        max_results: Maximum number of results (default: 5)
    
    Returns:
        {
            "results": [
                {
                    "content": "...",
                    "citation": {
                        "source_file": "runbooks/rds-failover.md",
                        "start_line": 5,
                        "end_line": 10,
                        "section_header": "Diagnosis"
                    },
                    "relevance_score": 0.87
                }
            ]
        }
    """
    try:
        response = bedrock_agent_runtime.retrieve(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            retrievalQuery={'text': query},
            retrievalConfiguration={
                'vectorSearchConfiguration': {
                    'numberOfResults': max_results,
                    'overrideSearchType': 'VECTOR'
                }
            }
        )
        
        results = []
        for item in response.get('retrievalResults', []):
            content = item['content']['text']
            metadata = item.get('metadata', {})
            score = item.get('score', 0.0)
            
            results.append({
                'content': content,
                'citation': {
                    'source_file': metadata.get('source_file', 'unknown'),
                    'start_line': metadata.get('start_line', 0),
                    'end_line': metadata.get('end_line', 0),
                    'section_header': metadata.get('section_header', '')
                },
                'relevance_score': score
            })
        
        return {'results': results}
    
    except Exception as e:
        # Graceful degradation: return empty results on error
        # Log error to CloudWatch instead of returning it
        print(f"Knowledge retrieval error: {str(e)}")
        return {
            'results': []
        }

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler for Knowledge Retrieval action group.
    """
    action = event.get('actionGroup')
    api_path = event.get('apiPath')
    parameters = event.get('parameters', [])
    
    if api_path == '/retrieve':
        # Extract parameters
        query = next((p['value'] for p in parameters if p['name'] == 'query'), None)
        max_results = int(next((p['value'] for p in parameters if p['name'] == 'max_results'), 5))
        
        if not query:
            return {
                'statusCode': 400,
                'body': {'error': 'Missing required parameter: query'}
            }
        
        result = retrieve_knowledge(query, max_results)
        
        return {
            'statusCode': 200,
            'body': result
        }
    
    return {
        'statusCode': 404,
        'body': {'error': f'Unknown API path: {api_path}'}
    }
```

### 3. Agent Prompt Update

**Current Prompt:** `prompts/knowledge-rag-agent.txt`

**Add Knowledge Base Instructions:**
```
You are the Knowledge RAG Agent. Your role is to retrieve relevant runbooks and postmortems to guide incident resolution.

CAPABILITIES:
- retrieve_knowledge(query, max_results): Search knowledge base for relevant documentation

INSTRUCTIONS:
1. Analyze the incident context (signals, evidence, historical patterns)
2. Formulate specific queries for knowledge retrieval:
   - "How to diagnose [symptom]?"
   - "Resolution steps for [incident type]"
   - "Similar incidents involving [service]"
3. Retrieve relevant knowledge chunks (max 5 results per query)
4. Synthesize findings into actionable guidance
5. ALWAYS cite sources using format: [Source: runbooks/rds-failover.md, lines 5-10]

CITATION REQUIREMENTS:
- Every recommendation MUST include a citation
- Citation format: [Source: {source_file}, lines {start_line}-{end_line}]
- If no relevant knowledge found, state: "No documented guidance found for this scenario"
- NEVER fabricate citations or knowledge

EXAMPLE OUTPUT:
"Based on similar incidents, the recommended resolution is:
1. Verify replica health using CloudWatch metrics [Source: runbooks/rds-failover.md, lines 5-10]
2. Initiate manual failover if replication lag > 60s [Source: runbooks/rds-failover.md, lines 15-20]
3. Update DNS records after failover completes [Source: runbooks/rds-failover.md, lines 25-30]

This approach resolved 3 similar incidents in the past 6 months [Source: postmortems/2024-01-rds-incident.md, lines 45-50]"

CONSTRAINTS:
- Maximum 3 knowledge queries per incident
- Maximum 5 results per query
- Timeout: 2 seconds per query
- Graceful degradation: If retrieval fails, proceed without knowledge base
```

### 4. LangGraph Node Update

**File:** `src/langgraph/agent_node.py`

**No changes required** - Action group integration is automatic via Bedrock Agent

---

## Citation Formatting

### Agent Output Format

```json
{
  "agent_id": "knowledge-rag",
  "recommendation": {
    "summary": "RDS failover recommended based on documented procedures",
    "guidance": [
      {
        "step": 1,
        "action": "Verify replica health using CloudWatch metrics",
        "citation": {
          "source_file": "runbooks/rds-failover.md",
          "start_line": 5,
          "end_line": 10,
          "section_header": "Diagnosis"
        }
      },
      {
        "step": 2,
        "action": "Initiate manual failover if replication lag > 60s",
        "citation": {
          "source_file": "runbooks/rds-failover.md",
          "start_line": 15,
          "end_line": 20,
          "section_header": "Resolution"
        }
      }
    ],
    "similar_incidents": [
      {
        "incident_id": "INC-2024-001",
        "resolution": "Manual failover successful",
        "citation": {
          "source_file": "postmortems/2024-01-rds-incident.md",
          "start_line": 45,
          "end_line": 50,
          "section_header": "Resolution"
        }
      }
    ]
  },
  "confidence": 0.85,
  "reasoning": "High confidence due to exact match with documented runbook and 3 similar historical incidents"
}
```

### Human-Readable Citation

**Format:** `[Source: {source_file}, lines {start_line}-{end_line}]`

**Examples:**
- `[Source: runbooks/rds-failover.md, lines 5-10]`
- `[Source: postmortems/2024-01-rds-incident.md, lines 45-50]`

---

## IAM Permissions

### Knowledge RAG Agent Role

**Add to existing role:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:Retrieve"
      ],
      "Resource": "arn:aws:bedrock:${AWS::Region}:${AWS::AccountId}:knowledge-base/*"
    },
    {
      "Effect": "Deny",
      "Action": [
        "bedrock:CreateDataSource",
        "bedrock:UpdateDataSource",
        "bedrock:DeleteDataSource",
        "bedrock:StartIngestionJob"
      ],
      "Resource": "*"
    }
  ]
}
```

**Note:** In CDK, this will resolve to the concrete ARN (e.g., `arn:aws:bedrock:us-east-1:998461587244:knowledge-base/HJPLE9IOEU`)

---

## Testing Strategy

### Unit Tests

**Test 1: Knowledge Retrieval**
```python
def test_retrieve_knowledge():
    result = retrieve_knowledge("How to handle RDS failover?", max_results=5)
    
    assert 'results' in result
    assert len(result['results']) <= 5
    
    for item in result['results']:
        assert 'content' in item
        assert 'citation' in item
        assert 'relevance_score' in item
        assert 0 <= item['relevance_score'] <= 1
```

**Test 2: Citation Formatting**
```python
def test_citation_format():
    result = retrieve_knowledge("RDS diagnosis steps")
    
    for item in result['results']:
        citation = item['citation']
        assert 'source_file' in citation
        assert 'start_line' in citation
        assert 'end_line' in citation
        assert citation['start_line'] <= citation['end_line']
```

**Test 3: Graceful Degradation**
```python
def test_retrieval_failure():
    # Simulate Knowledge Base unavailable
    with mock.patch('boto3.client') as mock_client:
        mock_client.side_effect = Exception("Service unavailable")
        
        result = retrieve_knowledge("test query")
        
        assert 'results' in result
        assert result['results'] == []
        assert 'error' not in result  # Error logged, not returned
```

### Integration Tests

**Test 1: End-to-End Agent Invocation**
```python
def test_knowledge_rag_agent_with_kb():
    incident = create_test_incident()
    evidence = create_test_evidence()
    
    # Invoke LangGraph with Knowledge RAG Agent
    result = invoke_langgraph(incident, evidence)
    
    # Verify Knowledge RAG Agent output includes citations
    knowledge_output = result['agent_outputs']['knowledge-rag']
    assert 'guidance' in knowledge_output['recommendation']
    
    for step in knowledge_output['recommendation']['guidance']:
        assert 'citation' in step
        assert step['citation']['source_file'].endswith('.md')
```

**Test 2: Citation Accuracy**
```python
def test_citation_traceability():
    result = retrieve_knowledge("RDS failover steps")
    
    for item in result['results']:
        citation = item['citation']
        
        # Verify citation points to real file
        file_path = f"knowledge-corpus/{citation['source_file']}"
        assert os.path.exists(file_path)
        
        # Verify line range is valid
        with open(file_path) as f:
            lines = f.readlines()
            assert citation['start_line'] >= 1
            assert citation['end_line'] <= len(lines)
```

---

## Monitoring & Observability

### CloudWatch Metrics
- `KnowledgeRetrievalCount` - Number of queries per incident
- `KnowledgeRetrievalLatency` - Query response time
- `KnowledgeRetrievalResultCount` - Number of results returned
- `KnowledgeRetrievalErrors` - Failed queries

### CloudWatch Alarms
- Retrieval latency > 2 seconds
- Retrieval error rate > 5%
- Zero results rate > 50%

### X-Ray Tracing
- Trace: Agent → Action Group → Bedrock Retrieve → OpenSearch → Response

---

## Validation Criteria

### Functional Validation
- [ ] Agent can query Knowledge Base
- [ ] Citations included in agent output
- [ ] Citation format correct
- [ ] Graceful degradation on errors

### Performance Validation
- [ ] Retrieval latency < 2 seconds (P95)
- [ ] No timeout errors
- [ ] No impact on overall LangGraph execution time

### Quality Validation
- [ ] Relevant results returned (human evaluation)
- [ ] Citations accurate (point to correct source)
- [ ] No hallucinated knowledge
- [ ] No fabricated citations

---

## Risks & Mitigations

### Risk 1: Retrieval Latency
**Problem:** Knowledge Base queries add latency to agent execution  
**Mitigation:** 2-second timeout, graceful degradation, parallel agent execution

### Risk 2: Poor Retrieval Quality
**Problem:** Irrelevant results reduce recommendation quality  
**Mitigation:** Human evaluation, query tuning, embedding model evaluation

### Risk 3: Citation Errors
**Problem:** Incorrect citations undermine trust  
**Mitigation:** Automated citation validation, traceability tests

### Risk 4: Knowledge Base Unavailable
**Problem:** Service outage blocks agent execution  
**Mitigation:** Graceful degradation (proceed without knowledge base)

---

## Success Metrics

| Metric | Target | Validation |
|--------|--------|------------|
| Retrieval latency | < 2s | P95 latency |
| Retrieval success rate | > 95% | CloudWatch metrics |
| Citation accuracy | 100% | Automated tests |
| Relevance (human eval) | > 80% | Manual review |
| Zero results rate | < 20% | CloudWatch metrics |

---

## Dependencies

### Upstream (Must Complete First)
- ✅ Phase 6: Knowledge RAG Agent implemented
- ✅ Phase 7.1: Knowledge corpus curated
- ✅ Phase 7.2: Deterministic chunking implemented
- ✅ Phase 7.3: Bedrock Knowledge Base deployed

### Downstream (Unblocked After This)
- ⏸️ Phase 8: Human review UI (can display citations)
- ⏸️ Phase 9: Automation with approval (can execute cited guidance)

---

## Deliverables

1. **Action group Lambda** (`src/langgraph/action_groups/knowledge_retrieval.py`)
2. **Action group schema** (OpenAPI spec)
3. **Agent prompt update** (`prompts/knowledge-rag-agent.txt`)
4. **IAM permissions** (Knowledge RAG Agent role update)
5. **Unit tests** (retrieval, citations, graceful degradation)
6. **Integration tests** (end-to-end agent invocation)
7. **Monitoring dashboard** (CloudWatch metrics)

---

## Non-Goals (Explicit Exclusions)

❌ **Feedback loops** - No retrieval quality learning, no auto-tuning  
❌ **Dynamic knowledge updates** - No real-time ingestion during incidents  
❌ **Multi-hop reasoning** - No iterative knowledge retrieval  
❌ **Knowledge graph** - No entity linking, no relationship traversal  
❌ **Custom ranking** - No LLM-based re-ranking, use Bedrock scores as-is  

---

## Approval Gates

### Design Review
- [ ] Integration approach approved by Principal Architect
- [ ] Citation format approved
- [ ] IAM permissions approved (read-only)
- [ ] Graceful degradation strategy approved

### Implementation Review
- [ ] Action group Lambda deployed
- [ ] Agent prompt updated
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Citation validation passing

---

**STATUS:** APPROVED  
**IMPLEMENTATION:** UNBLOCKED

---

**Created:** January 26, 2026  
**Authority:** Principal Architect  
**Next Phase:** Phase 8 (Human Review UI)
