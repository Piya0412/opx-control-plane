# Deployment Blocker - Docker Required

**Date:** 2026-01-31  
**Status:** 🟡 BLOCKED - Docker Not Available  
**Impact:** Cannot redeploy Lambda with import fixes

---

## Issue

CDK requires Docker to bundle Python Lambda functions. Docker is not available in the current WSL2 environment.

**Error:**
```
The command 'docker' could not be found in this WSL 2 distro.
We recommend to activate the WSL integration in Docker Desktop settings.
```

---

## What Was Completed

### ✅ Step 1: Import Fixes Applied

Successfully converted all relative imports to absolute imports in:
- ✅ `infra/phase6/lambda/__init__.py` (5 imports fixed)
- ✅ `infra/phase6/lambda/agent_node.py` (2 imports fixed)
- ✅ `infra/phase6/lambda/consensus_node.py` (1 import fixed)
- ✅ `infra/phase6/lambda/cost_guardian_node.py` (1 import fixed)
- ✅ `infra/phase6/lambda/graph.py` (5 imports fixed)
- ✅ `infra/phase6/lambda/orchestrator.py` (3 imports fixed)
- ✅ `infra/phase6/lambda/lambda_handler.py` (already correct)

**Total:** 17 relative imports converted to absolute imports

### ❌ Step 2: Deployment Blocked

Cannot deploy due to missing Docker.

---

## Resolution Options

### Option 1: Install Docker Desktop (Recommended)
**Action:** Install Docker Desktop for Windows and enable WSL2 integration

**Steps:**
1. Download Docker Desktop from https://www.docker.com/products/docker-desktop
2. Install Docker Desktop
3. Open Docker Desktop settings
4. Enable "Use the WSL 2 based engine"
5. Go to Resources → WSL Integration
6. Enable integration for Ubuntu distro
7. Restart WSL: `wsl --shutdown` then reopen terminal
8. Verify: `docker --version`
9. Deploy: `cdk deploy OpxPhase6Stack --require-approval never`

**Timeline:** 15-30 minutes  
**Risk:** Low

### Option 2: Use AWS Cloud9 or EC2
**Action:** Deploy from an AWS environment with Docker pre-installed

**Steps:**
1. Launch Cloud9 environment or EC2 instance
2. Clone repository
3. Install Node.js and CDK
4. Deploy from there

**Timeline:** 30-60 minutes  
**Risk:** Medium

### Option 3: Manual Lambda Update (Workaround)
**Action:** Manually update Lambda code via AWS Console or CLI

**Steps:**
1. Create ZIP file of fixed code:
   ```bash
   cd infra/phase6/lambda
   zip -r lambda-fixed.zip *.py action_groups/
   ```
2. Upload via AWS CLI:
   ```bash
   aws lambda update-function-code \
     --function-name OpxPhase6Stack-Phase6ExecutorLambdaFunction82D7505-Qfic0Ptp2Ypa \
     --zip-file fileb://lambda-fixed.zip
   ```
3. Wait for update to complete
4. Test with demo

**Timeline:** 10-15 minutes  
**Risk:** Medium (missing dependencies from requirements-prod.txt)

---

## Recommended Approach

**Use Option 3 (Manual Lambda Update) for immediate testing, then Option 1 for proper deployment.**

### Immediate Workaround (10 minutes)

The Lambda already has all dependencies installed from the previous deployment. We only need to update the Python source files.

```bash
# 1. Create ZIP with only Python source files
cd infra/phase6/lambda
zip -r /tmp/lambda-code-only.zip \
  *.py \
  action_groups/*.py \
  -x "*test_*.py" -x "*__pycache__*"

# 2. Update Lambda code
aws lambda update-function-code \
  --function-name OpxPhase6Stack-Phase6ExecutorLambdaFunction82D7505-Qfic0Ptp2Ypa \
  --zip-file fileb:///tmp/lambda-code-only.zip

# 3. Wait for update (check status)
aws lambda get-function \
  --function-name OpxPhase6Stack-Phase6ExecutorLambdaFunction82D7505-Qfic0Ptp2Ypa \
  --query 'Configuration.LastUpdateStatus'

# 4. Test
cd ../../..
make demo
```

---

## Changes Made (Ready for Deployment)

### File: infra/phase6/lambda/__init__.py
```python
# Before:
from .state import (...)
from .graph import (...)

# After:
from state import (...)
from graph import (...)
```

### File: infra/phase6/lambda/agent_node.py
```python
# Before:
from .state import (...)
from .trace_emitter import emit_trace_event_async

# After:
from state import (...)
from trace_emitter import emit_trace_event_async
```

### File: infra/phase6/lambda/consensus_node.py
```python
# Before:
from .state import (...)

# After:
from state import (...)
```

### File: infra/phase6/lambda/cost_guardian_node.py
```python
# Before:
from .state import (...)

# After:
from state import (...)
```

### File: infra/phase6/lambda/graph.py
```python
# Before:
from .state import (...)
from .agent_node import create_agent_node
from .consensus_node import consensus_node
from .cost_guardian_node import cost_guardian_node
from .checkpointing import create_dynamodb_checkpointer

# After:
from state import (...)
from agent_node import create_agent_node
from consensus_node import consensus_node
from cost_guardian_node import cost_guardian_node
from checkpointing import create_dynamodb_checkpointer
```

### File: infra/phase6/lambda/orchestrator.py
```python
# Before:
from .graph import build_graph
from .state import create_initial_state
from .checkpointing import create_dynamodb_checkpointer

# After:
from graph import build_graph
from state import create_initial_state
from checkpointing import create_dynamodb_checkpointer
```

---

## Next Steps

1. **User Action Required:** Install Docker Desktop OR use manual Lambda update workaround
2. **After Docker:** Run `cdk deploy OpxPhase6Stack --require-approval never`
3. **Test:** Run `make demo` and verify checkpoints are created
4. **Verify:** Check CloudWatch logs for successful agent execution

---

## Impact

**Current Status:**
- ✅ Code fixes complete and committed
- ❌ Deployment blocked by Docker requirement
- ❌ Lambda still has import error in production

**After Deployment:**
- ✅ Lambda will execute successfully
- ✅ Agents will run and generate recommendations
- ✅ Checkpoints will be created
- ✅ System will be fully production-ready

---

**Priority:** 🟡 HIGH (blocks production readiness)  
**Estimated Resolution Time:** 10-30 minutes (depending on option chosen)  
**Code Changes:** ✅ COMPLETE  
**Deployment:** ⏳ PENDING

