#!/bin/bash
# Initial setup script for opx-control-plane

set -e

echo "🚀 Setting up opx-control-plane..."
echo ""

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
    echo "✓ Virtual environment created"
else
    echo "✓ Virtual environment already exists"
fi

# Activate venv
source venv/bin/activate

# Install AWS CLI if not present
if ! command -v aws &> /dev/null; then
    echo "Installing AWS CLI..."
    pip install awscli
    echo "✓ AWS CLI installed"
else
    echo "✓ AWS CLI already installed"
fi

# Install Node dependencies
echo ""
echo "Installing Node.js dependencies..."
npm install
echo "✓ Node dependencies installed"

# Build TypeScript
echo ""
echo "Building TypeScript..."
npm run build
echo "✓ Build complete"

# Run tests
echo ""
echo "Running tests..."
npm test
echo "✓ Tests passed"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Activate environment: source scripts/activate.sh"
echo "2. Configure AWS: aws configure"
echo "3. Bootstrap CDK: npm run cdk bootstrap"
echo "4. Deploy: npm run cdk deploy"
