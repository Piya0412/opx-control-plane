#!/bin/bash
# Activate virtual environment and set up AWS environment

source venv/bin/activate
echo "✓ Virtual environment activated"
echo ""
echo "Next steps:"
echo "1. Configure AWS credentials: aws configure"
echo "2. Verify credentials: aws sts get-caller-identity"
echo "3. Bootstrap CDK (first time): npm run cdk bootstrap"
echo "4. Deploy: npm run cdk deploy"
