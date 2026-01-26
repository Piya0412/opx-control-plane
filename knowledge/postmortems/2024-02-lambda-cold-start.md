# Postmortem: Lambda Cold Start Latency Spike

## Incident Summary

**Date:** February 10, 2024  
**Duration:** 2 hours  
**Severity:** SEV2  
**Impact:** 15% of API requests experienced >5 second latency  
**Root Cause:** Lambda deployment package size increased from 5MB to 45MB

## Timeline (UTC)

| Time | Event |
|------|-------|
| 14:00:00 | Deployment of v2.5.0 to production |
| 14:05:00 | CloudWatch alarm: P95 latency > 5 seconds |
| 14:07:00 | PagerDuty alert triggered |
| 14:10:00 | On-call engineer investigating |
| 14:15:00 | Identified cold start latency spike |
| 14:20:00 | Correlated with deployment |
| 14:25:00 | Decision to rollback |
| 14:30:00 | Rollback initiated |
| 14:35:00 | Rollback complete |
| 14:40:00 | Latency returned to normal |
| 16:00:00 | Root cause identified (deployment package size) |

## Impact

### User Impact
- **Duration:** 2 hours (14:00 - 16:00)
- **Affected Users:** ~15% (users hitting cold Lambda instances)
- **Slow Requests:** ~1,800 requests (P95 latency > 5s)
- **Failed Requests:** 0 (no errors, just slow)

### Business Impact
- Revenue loss: Minimal (users waited, didn't abandon)
- Customer support tickets: 3
- User complaints: 5

## Root Cause

### Primary Cause
Lambda deployment package size increased from 5MB to 45MB due to:
1. Added new npm dependencies without review
2. Included unnecessary files in deployment package
3. No optimization of dependencies (dev dependencies included)

### Contributing Factors
1. No deployment package size monitoring
2. No cold start latency testing in staging
3. No gradual rollout (canary deployment)
4. Lambda not configured with provisioned concurrency

## Detection

### What Went Well ✅
- CloudWatch alarm triggered within 5 minutes
- PagerDuty alert delivered immediately
- Rollback decision made quickly (25 minutes)
- Rollback executed successfully

### What Could Be Improved ⚠️
- No pre-deployment validation of package size
- No automated rollback on latency spike
- No canary deployment to catch issue early

## Resolution

### Immediate Actions
1. Rolled back to v2.4.0 (previous stable version)
2. Verified latency returned to normal
3. Monitored for 1 hour to ensure stability

### Root Cause Analysis
1. Analyzed deployment package contents
2. Identified unnecessary dependencies:
   - `aws-sdk` (already available in Lambda runtime)
   - Dev dependencies (webpack, typescript, etc.)
   - Test files and fixtures
3. Measured cold start time:
   - v2.4.0 (5MB): ~500ms cold start
   - v2.5.0 (45MB): ~5000ms cold start

## Lessons Learned

### What Went Well
1. **Fast detection and response**
   - Alarm triggered within 5 minutes
   - Team responded immediately
   - Rollback completed in 35 minutes

2. **Effective monitoring**
   - CloudWatch metrics showed clear latency spike
   - X-Ray traces identified cold start issue
   - Correlation with deployment was obvious

3. **Clean rollback**
   - Previous version still available
   - Rollback process well-documented
   - No data loss or corruption

### What Went Wrong
1. **No deployment validation**
   - Package size not checked before deployment
   - No cold start testing in staging
   - No performance regression testing

2. **No gradual rollout**
   - Deployed to 100% of traffic immediately
   - No canary deployment
   - No automatic rollback on failure

3. **Dependency management issues**
   - No review of new dependencies
   - Dev dependencies included in production
   - No tree-shaking or optimization

## Action Items

### Immediate (Week 1)
- [x] **[P0]** Add deployment package size check to CI/CD (Owner: Dev Team, Due: Feb 17)
- [x] **[P0]** Remove unnecessary dependencies from v2.5.0 (Owner: Dev Team, Due: Feb 17)
- [x] **[P0]** Add cold start latency test to staging (Owner: QA Team, Due: Feb 17)

### Short Term (Month 1)
- [x] **[P1]** Implement canary deployment (10% → 50% → 100%) (Owner: DevOps Team, Due: Mar 10)
- [x] **[P1]** Configure provisioned concurrency for critical functions (Owner: Infra Team, Due: Mar 10)
- [x] **[P1]** Add automated rollback on latency spike (Owner: DevOps Team, Due: Mar 10)

### Long Term (Quarter 1)
- [x] **[P2]** Implement Lambda layers for shared dependencies (Owner: Dev Team, Due: Apr 30)
- [x] **[P2]** Add performance regression testing to CI/CD (Owner: QA Team, Due: Apr 30)
- [x] **[P2]** Dependency review process for all new packages (Owner: Dev Team, Recurring)

## Prevention

### Technical Improvements
1. **Deployment package optimization**
   - Exclude `aws-sdk` (available in runtime)
   - Exclude dev dependencies
   - Use webpack/esbuild for tree-shaking
   - Target package size: < 10MB

2. **Provisioned concurrency**
   - Configure for critical functions
   - Auto-scaling based on traffic
   - Cost: ~$50/month per function

3. **Canary deployment**
   - Deploy to 10% of traffic first
   - Monitor for 10 minutes
   - Auto-rollback on errors or latency spike
   - Gradual rollout: 10% → 50% → 100%

### Process Improvements
1. **Pre-deployment validation**
   - Check deployment package size
   - Run cold start latency test
   - Performance regression testing
   - Dependency review

2. **Monitoring and alerting**
   - CloudWatch alarm for cold start duration
   - X-Ray tracing for all functions
   - Deployment tracking in metrics

3. **Incident response**
   - Automated rollback on failure
   - Runbook for Lambda performance issues
   - Regular incident response drills

## Supporting Data

### CloudWatch Metrics
- Duration (P95): 500ms → 5000ms (10x increase)
- Cold Start Duration: 500ms → 5000ms
- Invocations: Normal (no throttling)
- Errors: 0 (no failures)

### X-Ray Traces
```
Cold Start Breakdown (v2.5.0):
- Initialization: 4500ms (90%)
- Handler execution: 500ms (10%)

Cold Start Breakdown (v2.4.0):
- Initialization: 200ms (40%)
- Handler execution: 300ms (60%)
```

### Deployment Package Analysis
```
v2.4.0 (5MB):
- Source code: 2MB
- Dependencies: 3MB
- Total: 5MB

v2.5.0 (45MB):
- Source code: 2MB
- Dependencies: 40MB
- aws-sdk: 15MB (unnecessary)
- Dev dependencies: 20MB (unnecessary)
- Test files: 3MB (unnecessary)
- Total: 45MB

v2.5.1 (Optimized, 8MB):
- Source code: 2MB
- Dependencies: 6MB (optimized)
- Total: 8MB
```

## References

- [Lambda Cold Start Optimization](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [Lambda Deployment Package](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-package.html)
- [Provisioned Concurrency](https://docs.aws.amazon.com/lambda/latest/dg/provisioned-concurrency.html)
- [Incident Ticket: INC-2024-002](https://jira.example.com/INC-2024-002)

## Metadata

- **Incident ID:** INC-2024-002
- **Severity:** SEV2
- **Services:** Lambda, API Gateway, CloudWatch, X-Ray
- **Author:** Dev Team
- **Reviewed By:** Engineering Manager, SRE Lead
- **Status:** Closed
