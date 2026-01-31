# Lambda Import Fix Required

**Issue:** Phase 6 Lambda has relative imports that fail in Lambda's flat deployment structure.

## Root Cause

The `infra/phase6/lambda/__init__.py` file uses relative imports:
```python
from .state import (...)
from .graph import (...)
from .agent_node import create_agent_node
```

When Lambda tries to import `lambda_handler`, Python loads `__init__.py` first, which attempts relative imports. Since Lambda deploys files in a flat structure (not as an installed package), these relative imports fail with:
```
Runtime.ImportModuleError: attempted relative import with no known parent package
```

## Files with Relative Imports

```
infra/phase6/lambda/__init__.py          ← PRIMARY ISSUE
infra/phase6/lambda/agent_node.py
infra/phase6/lambda/consensus_node.py
infra/phase6/lambda/cost_guardian_node.py
infra/phase6/lambda/graph.py
infra/phase6/lambda/orchestrator.py
```

## Solution Options

### Option 1: Remove __init__.py (FASTEST)
**Action:** Delete or rename `infra/phase6/lambda/__init__.py`

**Pros:**
- Fastest fix (1 minute)
- Lambda doesn't need `__init__.py`
- Other files can keep relative imports (they work when imported directly)

**Cons:**
- Breaks local development if code imports the package

**Command:**
```bash
mv infra/phase6/lambda/__init__.py infra/phase6/lambda/__init__.py.bak
cdk deploy OpxPhase6Stack
```

### Option 2: Convert All Relative Imports (PROPER FIX)
**Action:** Replace all `from .module` with `from module`

**Pros:**
- Proper fix
- Works in both Lambda and local development
- No package structure needed

**Cons:**
- Requires changing multiple files
- Takes longer (30-60 minutes)

**Files to Fix:**
- `__init__.py` - 5 imports
- `agent_node.py` - 2 imports
- `consensus_node.py` - 1 import
- `cost_guardian_node.py` - 1 import
- `graph.py` - 5 imports
- `orchestrator.py` - 3 imports

### Option 3: Fix Package Structure (COMPLEX)
**Action:** Deploy as proper Python package with correct PYTHONPATH

**Pros:**
- Maintains package structure
- Relative imports work correctly

**Cons:**
- Complex CDK bundling changes
- Requires testing
- Takes longest (2-4 hours)

## Recommended Approach

**Use Option 1 (Remove __init__.py) for immediate fix, then Option 2 for proper solution.**

### Step 1: Immediate Fix (5 minutes)
```bash
# Backup __init__.py
mv infra/phase6/lambda/__init__.py infra/phase6/lambda/__init__.py.disabled

# Redeploy
cd infra/phase6
cdk deploy OpxPhase6Stack --require-approval never

# Test
cd ../..
make demo
```

### Step 2: Proper Fix (30-60 minutes)
Convert all relative imports to absolute imports in all files.

## Testing After Fix

```bash
# 1. Run demo
make demo

# 2. Check for checkpoints
aws dynamodb query \
  --table-name opx-langgraph-checkpoints-dev \
  --key-condition-expression "session_id = :sid" \
  --expression-attribute-values '{":sid":{"S":"incident-api-gateway-XXXXX"}}'

# 3. Check Lambda logs
aws logs tail /aws/lambda/OpxPhase6Stack-Phase6ExecutorLambdaFunction82D7505-Qfic0Ptp2Ypa --since 5m

# 4. Verify no import errors
# Should see actual execution logs, not import errors
```

## Impact

**Before Fix:**
- ❌ Lambda fails on every invocation
- ❌ No agent recommendations
- ❌ No checkpoints created
- ❌ System non-functional

**After Fix:**
- ✅ Lambda executes successfully
- ✅ Agents run and generate recommendations
- ✅ Checkpoints created
- ✅ System fully functional

---

**Priority:** 🔴 CRITICAL  
**Estimated Fix Time:** 5 minutes (Option 1) or 30-60 minutes (Option 2)  
**Testing Time:** 5 minutes  
**Total Time to Production-Ready:** 10-65 minutes

