# CP-1: Signal Ingestion Architecture

**Visual representation of the signal ingestion layer.**

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SIGNAL SOURCES                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐│
│  │ CloudWatch   │  │ CloudWatch   │  │ CloudWatch   │  │EventBridge│
│  │ Metrics      │  │ Alarms       │ 