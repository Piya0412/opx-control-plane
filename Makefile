.PHONY: demo demo-sev1 demo-sev2 help clean-demo

# Default target
help:
	@echo "OPX Control Plane - Demo Commands"
	@echo ""
	@echo "Available targets:"
	@echo "  make demo        - Run demo with default settings (api-gateway, SEV2)"
	@echo "  make demo-sev1   - Run demo with SEV1 incident"
	@echo "  make demo-sev2   - Run demo with SEV2 incident (default)"
	@echo "  make clean-demo  - Clean up demo data from DynamoDB"
	@echo ""
	@echo "Custom demo:"
	@echo "  python scripts/demo_incident.py --service rds --severity SEV1"

# Run demo with default settings
demo:
	@echo "🚀 Running OPX Control Plane Demo..."
	@python3 scripts/demo_incident.py

# Run SEV1 demo
demo-sev1:
	@echo "🚀 Running OPX Control Plane Demo (SEV1)..."
	@python3 scripts/demo_incident.py --severity SEV1

# Run SEV2 demo
demo-sev2:
	@echo "🚀 Running OPX Control Plane Demo (SEV2)..."
	@python3 scripts/demo_incident.py --severity SEV2

# Clean up demo data
clean-demo:
	@echo "🧹 Cleaning up demo data..."
	@echo "Note: This requires manual cleanup via AWS Console or CLI"
	@echo "Demo incidents are tagged with metadata.demo=true"
