"""
Phase 6 Week 4: Bedrock Agent Configuration

Agent IDs and Alias IDs from CloudFormation OpxPhase6Stack deployment.
These are wired into the LangGraph orchestration for agent invocation.

CRITICAL: These IDs are stable and should not change unless agents are redeployed.
"""

from typing import Dict, TypedDict


class AgentConfig(TypedDict):
    """Configuration for a single Bedrock Agent."""
    agent_id: str
    alias_id: str
    region: str


# ============================================================================
# BEDROCK AGENT CONFIGURATION (from CloudFormation outputs)
# ============================================================================

BEDROCK_AGENTS: Dict[str, AgentConfig] = {
    "signal-intelligence": {
        "agent_id": "KGROVN1CL8",
        "alias_id": "DJM7NIDPKQ",
        "region": "us-east-1",
    },
    "historical-pattern": {
        "agent_id": "EGZCZD7H5D",
        "alias_id": "MMHZRHSU8Q",
        "region": "us-east-1",
    },
    "change-intelligence": {
        "agent_id": "6KHYUUGUCC",
        "alias_id": "YJHW4GBPMM",
        "region": "us-east-1",
    },
    "risk-blast-radius": {
        "agent_id": "Q18DLBI6SR",
        "alias_id": "MFD0Q6KXBT",
        "region": "us-east-1",
    },
    "knowledge-rag": {
        "agent_id": "PW873XXLHQ",
        "alias_id": "3EWSQHWAU0",
        "region": "us-east-1",
    },
    "response-strategy": {
        "agent_id": "IKHAVTP8JI",
        "alias_id": "JXNMIXFZV7",
        "region": "us-east-1",
    },
}


def get_agent_config(agent_name: str) -> AgentConfig:
    """
    Get configuration for a specific agent.
    
    Args:
        agent_name: Name of the agent (e.g., "signal-intelligence")
    
    Returns:
        AgentConfig with agent_id, alias_id, and region
    
    Raises:
        KeyError: If agent_name is not found
    """
    if agent_name not in BEDROCK_AGENTS:
        raise KeyError(
            f"Agent '{agent_name}' not found. "
            f"Available agents: {list(BEDROCK_AGENTS.keys())}"
        )
    
    return BEDROCK_AGENTS[agent_name]


def get_all_agent_ids() -> Dict[str, str]:
    """
    Get all agent IDs mapped by agent name.
    
    Returns:
        Dictionary mapping agent name to agent ID
    """
    return {
        name: config["agent_id"]
        for name, config in BEDROCK_AGENTS.items()
    }


def get_all_alias_ids() -> Dict[str, str]:
    """
    Get all alias IDs mapped by agent name.
    
    Returns:
        Dictionary mapping agent name to alias ID
    """
    return {
        name: config["alias_id"]
        for name, config in BEDROCK_AGENTS.items()
    }


# ============================================================================
# VALIDATION
# ============================================================================

def validate_config() -> bool:
    """
    Validate that all agent configurations are complete.
    
    Returns:
        True if all configurations are valid
    
    Raises:
        ValueError: If any configuration is invalid
    """
    required_agents = [
        "signal-intelligence",
        "historical-pattern",
        "change-intelligence",
        "risk-blast-radius",
        "knowledge-rag",
        "response-strategy",
    ]
    
    for agent_name in required_agents:
        if agent_name not in BEDROCK_AGENTS:
            raise ValueError(f"Missing configuration for agent: {agent_name}")
        
        config = BEDROCK_AGENTS[agent_name]
        
        if not config.get("agent_id"):
            raise ValueError(f"Missing agent_id for {agent_name}")
        
        if not config.get("alias_id"):
            raise ValueError(f"Missing alias_id for {agent_name}")
        
        if not config.get("region"):
            raise ValueError(f"Missing region for {agent_name}")
    
    return True


# Validate configuration on import
validate_config()
