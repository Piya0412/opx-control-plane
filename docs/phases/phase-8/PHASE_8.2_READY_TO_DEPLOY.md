# Phase 8.2: Ready to Deploy

**Date:** January 29, 2026  
**Status:** ✅ IMPLEMENTATION COMPLETE → Ready for Deployment & Validation

## Quick Summary

Phase 8.2 (Guardrails Enforcement) is fully implemented and ready for deployment and validation testing.

**Implementation Status:** ✅ COMPLETE  
**Code Quality:** ✅ 0 errors  
**Tests Written:** ✅ 15 tests  
**Documentation:** ✅ Complete  
**Deployment Ready:** ✅ YES

## What You Need

### Prerequisites
1. **AWS Account** with Bedrock access
2. **Bedrock Agent** already deployed (from Phase 6)
3. **Agent ID** and **Alias ID** from Bedrock console
4. **AWS CLI** configured with appropriate permissions
5. **CDK** installed and bootstrapped

### Required Permissions
- Bedrock: CreateGuardrail, GetGuardrail
- DynamoDB: CreateTable, PutItem, Query, Scan
- CloudWatch: PutMetricData, CreateAlarm
- Lambda: UpdateFunctionConfiguration
- IAM: AttachRolePolicy, DetachRolePolicy (for Gate 4)

## Deployment Steps (Quick)

### 1. Run Tests (Optional but Recommended)
```bash
source venv/bin/activate
pip install pytest pytest-asyncio moto boto3
./scripts/run-guardrail-tests.sh
```

### 2. Deploy Infrastructure
```bash
npm run build
npx cdk deploy OpxControlPlaneStack
```

### 3. Run Validation Gates
```bash
# Get your agent ID and alias ID from Bedrock console
./scripts/validate-guardrails.sh <agent-id> <alias-id>
```

### 4. Document Results
Update `PHASE_8.2_VALIDATION_GATES.md` with test results and evidence.

## Validation Gates (Must Pass All 4)

| Gate | Description | Time | Difficulty |
|------|-------------|------|------------|
| 1 | Real Bedrock PII Block | 15 min | Easy |
| 2 | WARN Mode Does Not Block | 10 min | Easy |
| 3 | Alarm Sanity Check | 15 min | Medium |
| 4 | Failure Isolation | 20 min | Hard |

**Total Estimated Time:** 1-2 hours

## Files to Use

### Deployment
- `PHASE_8.2_DEPLOYMENT_CHECKLIST.md` - Step-by-step deployment guide
- `scripts/validate-guardrails.sh` - Automated validation script
- `scripts/run-guardrail-tests.sh` - Unit/integration test runner

### Reference
- `PHASE_8.2_VALIDATION_GATES.md` - Detailed gate requirements
- `PHASE_8.2_IMPLEMENTATION_COMPLETE.md` - Implementation summary
- `PHASE_8.2_GUARDRAILS_DESIGN.md` - Design with corrections

## Expected Outcomes

### After Deployment
- ✅ Bedrock Guardrail created with ID
- ✅ DynamoDB table `opx-guardrail-violations` created
- ✅ 2 CloudWatch alarms created
- ✅ Lambda environment variables set

### After Gate 1 (PII Block)
- ✅ Email, phone, AWS key inputs blocked
- ✅ Graceful degradation messages returned
- ✅ DynamoDB records created with redacted content
- ✅ CloudWatch metrics incremented

### After Gate 2 (WARN Mode)
- ✅ Mild profanity/misconduct inputs NOT blocked
- ✅ Agent responses returned normally
- ✅ WARN violations logged to DynamoDB
- ✅ No exceptions or retries

### After Gate 3 (Alarms)
- ✅ Alarm fires after ≥2 PII blocks in 5 minutes
- ✅ SNS notification received
- ✅ Alarm resets to OK after violations stop

### After Gate 4 (Failure Isolation)
- ✅ Agent completes even with DynamoDB failure
- ✅ No exceptions leak to caller
- ✅ Errors logged to CloudWatch only

## Cost

**Monthly Cost:** ~$2
- Bedrock Guardrails: ~$1.80
- DynamoDB: Negligible
- CloudWatch: Included

## Support & Troubleshooting

### Common Issues

**Issue:** Guardrail not found  
**Solution:** Check CloudFormation outputs for GuardrailId

**Issue:** DynamoDB table not found  
**Solution:** Verify stack deployed successfully

**Issue:** Alarm doesn't fire  
**Solution:** Wait 5-10 minutes, check metric data exists

**Issue:** Agent throws exception  
**Solution:** Check Lambda logs, verify guardrail integration

### Where to Look

**CloudWatch Logs:**
- `/aws/lambda/opx-agent-orchestrator`
- Look for: "ERROR: Failed to store guardrail violation"

**DynamoDB:**
- Table: `opx-guardrail-violations`
- Check: violationId, timestamp, violation.action

**CloudWatch Metrics:**
- Namespace: `OPX/Guardrails`
- Metrics: ViolationCount, ConfidenceScore

**CloudWatch Alarms:**
- `OPX-Guardrails-HighPIIViolationRate`
- `OPX-Guardrails-HighContentViolationRate`

## Next Steps After Validation

1. **All Gates Pass** → Request production approval
2. **Some Gates Fail** → Fix issues, re-test, document
3. **Production Approved** → Monitor for 24 hours
4. **Monitoring Complete** → Proceed to Phase 8.3

## Production Approval Criteria

- [ ] All 4 validation gates pass
- [ ] Evidence documented
- [ ] No exceptions leaked
- [ ] Alarms work correctly
- [ ] Metrics have no incidentId dimension
- [ ] Non-negotiable rules verified

**Production Approval:** ⏳ CONDITIONAL on validation

---

## Quick Command Reference

```bash
# Deploy
npx cdk deploy OpxControlPlaneStack

# Get guardrail ID
aws cloudformation describe-stacks \
  --stack-name OpxControlPlaneStack \
  --query 'Stacks[0].Outputs[?OutputKey==`GuardrailId`].OutputValue' \
  --output text

# Test PII block
aws bedrock-agent-runtime invoke-agent \
  --agent-id <agent-id> \
  --agent-alias-id <alias-id> \
  --session-id test-$(date +%s) \
  --input-text "My email is user@example.com" \
  --guardrail-identifier <guardrail-id> \
  --guardrail-version 1

# Check violations
aws dynamodb scan --table-name opx-guardrail-violations --limit 10

# Check metrics
aws cloudwatch get-metric-statistics \
  --namespace OPX/Guardrails \
  --metric-name ViolationCount \
  --dimensions Name=ViolationType,Value=PII \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum

# Check alarms
aws cloudwatch describe-alarms \
  --alarm-names OPX-Guardrails-HighPIIViolationRate
```

---

**Ready to Deploy:** YES  
**Estimated Time:** 1-2 hours total  
**Risk Level:** Low (non-blocking design)  
**Rollback:** Easy (CDK rollback)

**Let's proceed with deployment!** 🚀
