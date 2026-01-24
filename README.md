# opx-control-plane

Enterprise Operational Control Plane — Deterministic incident management with policy enforcement.

**Intelligence advises. Control decides. Humans approve.**

## What This Is

A deterministic control plane for operational incidents that:
- Makes incidents first-class, long-lived system objects
- Enforces strict state machine transitions
- Provides full audit trail and replay capability
- Requires human approval for critical actions

## What This Is NOT

- ❌ NOT an AI assistant
- ❌ NOT an agent-first system
- ❌ NOT a chatbot
- ❌ NOT autonomous

See [NON_GOALS.md](./NON_GOALS.md) for explicit boundaries.

## Current Phase

**Phase 1: Incident Control Plane (Foundation)**

This phase implements the core incident lifecycle without any AI/agent involvement.

## Architecture

```
┌─────────────────────────────────────────────────┐
│           Human Interfaces                      │
│  (API Gateway)                                  │
└───────────────────────▲─────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────┐
│        OPX CONTROL PLANE                        │
│  • Incident Controller (Lambda)                 │
│  • State Machine (deterministic)                │
│  • Audit Events (EventBridge)                   │
│  • Incidents Table (DynamoDB)                   │
└─────────────────────────────────────────────────┘
```

## Incident State Machine

```
CREATED → ANALYZING → DECIDED → WAITING_FOR_HUMAN → CLOSED
                                       ↓
                                  ANALYZING (rejection path)
```

All transitions are deterministic. Invalid transitions are rejected.

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Deploy (requires AWS credentials)
npm run cdk deploy
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /incidents | Create incident |
| GET | /incidents | List incidents |
| GET | /incidents/{id} | Get incident |
| GET | /incidents/{id}/timeline | Get timeline |
| POST | /incidents/{id}/transitions | Request state transition |
| POST | /incidents/{id}/approvals | Approve/reject |

## Project Structure

```
opx-control-plane/
├── infra/                 # CDK infrastructure
│   ├── app.ts
│   └── stacks/
├── src/
│   ├── controller/        # Lambda handler
│   └── domain/            # Domain models
├── test/                  # Tests
├── ARCHITECTURE.md        # System architecture
├── PLAN.md               # Development phases
└── NON_GOALS.md          # Explicit exclusions
```

## Design Authority

This repository follows a **locked design authority model**.

The Phase 3.4 implementation is canonical. Tests are required to conform to implementation, not vice versa.

Historical test artifacts from CP-6 / Phase 4 were intentionally removed. See [DESIGN_AUTHORITY_DECISION.md](./DESIGN_AUTHORITY_DECISION.md) for details.

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture
- [DESIGN_AUTHORITY_DECISION.md](./DESIGN_AUTHORITY_DECISION.md) — Design governance
- [NON_GOALS.md](./NON_GOALS.md) — What we will NOT build

## License

UNLICENSED - Internal use only
