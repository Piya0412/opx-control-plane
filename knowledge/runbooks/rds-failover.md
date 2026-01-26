# RDS Failover Runbook

## Overview

This runbook provides procedures for diagnosing and executing AWS RDS failover for Multi-AZ deployments.

## Symptoms

- High latency on primary database
- Connection timeouts from application
- Replication lag > 60 seconds
- Primary instance health check failures
- CloudWatch alarms for DatabaseConnections or CPUUtilization

## Diagnosis

### Step 1: Check RDS Instance Health

1. Navigate to RDS → Databases → {db-identifier}
2. Check instance status:
   - Status should be "Available"
   - Multi-AZ should be "Yes"
   - Check "Maintenance" tab for pending actions

### Step 2: Review CloudWatch Metrics

1. Navigate to CloudWatch → Metrics → RDS
2. Check the following metrics:
   - `DatabaseConnections` - Active connections
   - `ReplicaLag` - Replication lag (should be < 1 second)
   - `CPUUtilization` - CPU usage
   - `FreeableMemory` - Available memory
   - `ReadLatency` / `WriteLatency` - I/O latency

### Step 3: Check Replication Status

```sql
-- For MySQL/MariaDB
SHOW SLAVE STATUS\G

-- For PostgreSQL
SELECT * FROM pg_stat_replication;
```

**Warning signs:**
- Replication lag > 60 seconds
- Replication errors in logs
- Standby not in sync

### Step 4: Review RDS Events

1. Navigate to RDS → Events
2. Filter by DB instance
3. Look for:
   - Failover events
   - Maintenance events
   - Backup events

## Resolution

### Option 1: Manual Failover (Recommended)

**When to use:** Planned maintenance or primary instance issues

**Prerequisites:**
- Multi-AZ deployment enabled
- Standby instance healthy
- Replication lag < 60 seconds

**Steps:**

1. **Verify standby health:**
```bash
aws rds describe-db-instances \
  --db-instance-identifier {db-identifier} \
  --query 'DBInstances[0].SecondaryAvailabilityZone'
```

2. **Initiate failover:**
```bash
aws rds reboot-db-instance \
  --db-instance-identifier {db-identifier} \
  --force-failover
```

3. **Monitor failover progress:**
```bash
aws rds describe-events \
  --source-identifier {db-identifier} \
  --source-type db-instance \
  --duration 10
```

**Expected timeline:**
- Failover initiation: 1-2 minutes
- DNS propagation: 1-2 minutes
- Total downtime: 2-4 minutes

### Option 2: Automatic Failover (AWS Managed)

**When to use:** Primary instance failure

**Triggers:**
- Primary instance failure
- Availability Zone failure
- Network connectivity loss

**No action required** - AWS automatically fails over to standby

### Option 3: Restore from Snapshot (Last Resort)

**When to use:** Both primary and standby failed

**Steps:**

1. **Identify latest snapshot:**
```bash
aws rds describe-db-snapshots \
  --db-instance-identifier {db-identifier} \
  --query 'DBSnapshots[0].DBSnapshotIdentifier'
```

2. **Restore from snapshot:**
```bash
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier {new-db-identifier} \
  --db-snapshot-identifier {snapshot-identifier}
```

3. **Update application connection strings**

## Post-Failover Actions

### Step 1: Verify New Primary

1. Check instance status: "Available"
2. Verify connections from application
3. Check replication lag (should be 0)

### Step 2: Update DNS (if using custom DNS)

```bash
# Update Route 53 record (if applicable)
aws route53 change-resource-record-sets \
  --hosted-zone-id {zone-id} \
  --change-batch file://dns-update.json
```

### Step 3: Monitor Application

1. Check application logs for connection errors
2. Verify database queries executing successfully
3. Monitor CloudWatch metrics for 1 hour

### Step 4: Document Incident

1. Record failover time and duration
2. Document root cause
3. Update runbook if needed

## Verification

- [ ] New primary instance is "Available"
- [ ] Application connections successful
- [ ] Replication lag < 1 second
- [ ] No errors in application logs
- [ ] CloudWatch metrics normal

## Prevention

- Enable Multi-AZ deployment
- Set CloudWatch alarms for:
  - ReplicaLag > 30 seconds
  - DatabaseConnections > 80% of max
  - CPUUtilization > 80%
- Regular failover testing (quarterly)
- Implement connection retry logic in application
- Use RDS Proxy for connection pooling

## Related Documentation

- [RDS Multi-AZ Deployments](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html)
- [RDS Failover Process](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html#Concepts.MultiAZ.Failover)
- [RDS Best Practices](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_BestPractices.html)

## Escalation

If failover fails or takes > 10 minutes:
1. Check AWS Health Dashboard for service issues
2. Contact AWS Support (Priority: High)
3. Escalate to Database Team Lead
4. Consider restoring from snapshot

## Metadata

- **Severity:** SEV1
- **Services:** RDS, Route 53, CloudWatch
- **Last Updated:** 2026-01-27
- **Author:** Database Team
