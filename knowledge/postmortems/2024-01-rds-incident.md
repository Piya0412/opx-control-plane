# Postmortem: RDS Primary Instance Failure

## Incident Summary

**Date:** January 15, 2024  
**Duration:** 4 minutes  
**Severity:** SEV1  
**Impact:** 100% of API requests failed during failover  
**Root Cause:** Primary RDS instance hardware failure in us-east-1a

## Timeline (UTC)

| Time | Event |
|------|-------|
| 10:32:00 | CloudWatch alarm: DatabaseConnections dropped to 0 |
| 10:32:15 | PagerDuty alert triggered |
| 10:32:30 | On-call engineer acknowledged |
| 10:33:00 | Confirmed primary instance unreachable |
| 10:33:30 | AWS initiated automatic failover to standby (us-east-1b) |
| 10:35:00 | Standby promoted to primary |
| 10:36:00 | Application connections restored |
| 10:36:30 | All services operational |

## Impact

### User Impact
- **Duration:** 4 minutes
- **Affected Users:** 100% (all users)
- **Failed Requests:** ~2,400 requests (600 req/min × 4 min)
- **Data Loss:** None (Multi-AZ replication)

### Business Impact
- Revenue loss: ~$800 (estimated)
- Customer support tickets: 12
- Social media mentions: 3

## Root Cause

### Primary Cause
Hardware failure on primary RDS instance (db.r5.large) in Availability Zone us-east-1a.

### Contributing Factors
1. No pre-warming of standby connections
2. Application connection pool not configured for failover
3. DNS TTL set to 60 seconds (delayed reconnection)

## Detection

### What Went Well ✅
- CloudWatch alarm triggered within 15 seconds
- PagerDuty alert delivered immediately
- On-call engineer responded within 30 seconds
- Multi-AZ failover worked as designed

### What Could Be Improved ⚠️
- No proactive monitoring of standby instance health
- Application did not detect failover automatically
- No automated runbook execution

## Resolution

### Immediate Actions
1. AWS automatically failed over to standby instance
2. Verified new primary instance health
3. Confirmed application connections restored
4. Monitored for 1 hour to ensure stability

### No Manual Intervention Required
AWS Multi-AZ failover handled the incident automatically.

## Lessons Learned

### What Went Well
1. **Multi-AZ deployment worked perfectly**
   - Automatic failover completed in 3.5 minutes
   - Zero data loss
   - Standby was in sync (replication lag < 1 second)

2. **Monitoring and alerting effective**
   - CloudWatch alarm triggered immediately
   - PagerDuty escalation worked
   - On-call engineer responded quickly

3. **Communication was clear**
   - Status page updated within 2 minutes
   - Customer support notified immediately
   - Post-incident communication sent within 1 hour

### What Went Wrong
1. **Application not resilient to failover**
   - Connection pool did not handle failover gracefully
   - No automatic retry logic
   - DNS caching caused delayed reconnection

2. **No standby health monitoring**
   - We only monitored primary instance
   - Standby health was unknown until failover
   - Could have failed to standby with issues

3. **No failover testing**
   - Last failover test was 6 months ago
   - Team unfamiliar with failover process
   - No automated runbook

## Action Items

### Immediate (Week 1)
- [x] **[P0]** Implement connection retry logic in application (Owner: Dev Team, Due: Jan 22)
- [x] **[P0]** Add CloudWatch alarm for standby instance health (Owner: SRE Team, Due: Jan 22)
- [x] **[P0]** Reduce DNS TTL to 10 seconds (Owner: Infra Team, Due: Jan 22)

### Short Term (Month 1)
- [x] **[P1]** Implement RDS Proxy for connection pooling (Owner: Dev Team, Due: Feb 15)
- [x] **[P1]** Add X-Ray tracing for database connections (Owner: Dev Team, Due: Feb 15)
- [x] **[P1]** Create automated failover runbook (Owner: SRE Team, Due: Feb 15)

### Long Term (Quarter 1)
- [x] **[P2]** Quarterly failover testing (Owner: SRE Team, Recurring)
- [x] **[P2]** Implement chaos engineering for database failures (Owner: SRE Team, Due: Mar 31)
- [x] **[P2]** Multi-region read replicas for disaster recovery (Owner: Infra Team, Due: Mar 31)

## Prevention

### Technical Improvements
1. **RDS Proxy** - Connection pooling and automatic failover handling
2. **Application retry logic** - Exponential backoff with jitter
3. **Standby monitoring** - CloudWatch alarms for standby health
4. **DNS optimization** - Reduced TTL for faster failover

### Process Improvements
1. **Quarterly failover testing** - Scheduled maintenance windows
2. **Automated runbooks** - AWS Systems Manager Automation
3. **Chaos engineering** - Regular failure injection testing
4. **Incident response training** - Quarterly drills

## Supporting Data

### CloudWatch Metrics
- DatabaseConnections: 0 (10:32:00 - 10:36:00)
- ReplicaLag: < 1 second (before failover)
- CPUUtilization: Normal (no performance issues)

### RDS Events
```
2024-01-15 10:32:00 - Multi-AZ instance failure detected
2024-01-15 10:33:30 - Failing over to standby instance
2024-01-15 10:35:00 - Failover complete
2024-01-15 10:36:00 - New primary instance available
```

### Application Logs
```
2024-01-15 10:32:15 - ERROR: Connection to database failed
2024-01-15 10:32:30 - ERROR: Unable to acquire connection from pool
2024-01-15 10:36:00 - INFO: Database connection restored
```

## References

- [RDS Multi-AZ Failover Documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html)
- [RDS Proxy Documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html)
- [Incident Ticket: INC-2024-001](https://jira.example.com/INC-2024-001)

## Metadata

- **Incident ID:** INC-2024-001
- **Severity:** SEV1
- **Services:** RDS, API Gateway, Lambda
- **Author:** SRE Team
- **Reviewed By:** Engineering Manager, CTO
- **Status:** Closed
