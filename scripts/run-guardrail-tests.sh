#!/bin/bash
#
# Run Phase 8.2 Guardrail Tests
# Executes unit and integration tests
#

set -e

echo "=========================================="
echo "Phase 8.2 Guardrail Tests"
echo "=========================================="
echo ""

# Check if pytest is installed
if ! command -v pytest &> /dev/null; then
    echo "ERROR: pytest not found"
    echo "Install with: pip install pytest pytest-asyncio moto boto3"
    exit 1
fi

# Check if in virtual environment
if [ -z "$VIRTUAL_ENV" ]; then
    echo "WARNING: Not in virtual environment"
    echo "Activate with: source venv/bin/activate"
    echo ""
fi

# Set environment variables for tests
export GUARDRAIL_VIOLATIONS_TABLE=test-guardrail-violations
export GUARDRAIL_ID=test-guardrail-id
export GUARDRAIL_VERSION=1
export AWS_DEFAULT_REGION=us-east-1

echo "Running Unit Tests..."
echo "=========================================="
cd src/tracing
python -m pytest test_guardrail_handler.py -v --tb=short

echo ""
echo "Running Integration Tests..."
echo "=========================================="
python -m pytest test_guardrail_integration.py -v -m integration --tb=short

echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo ""
echo "Unit Tests: Check output above"
echo "Integration Tests: Check output above"
echo ""
echo "If all tests pass, proceed with deployment and validation gates"
echo ""
