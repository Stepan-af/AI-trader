# Architecture Review Resolutions

**Date**: 2026-01-22
**Status**: BLOCKER ISSUES RESOLVED

---

## Summary

All critical blocker issues from the architecture review have been resolved through documentation updates. No MVP scope changes, no new features added. All resolutions follow existing architectural principles.

---

## Resolved Clarifications

### Q1: Partial Fill Transaction Scope
**Resolution**: Clarified outbox pattern with separate transaction scopes
**Document**: ARCHITECTURE.md, Section "Partial Fill Processing (Corrected)"
**Decision**: ADR-021 - Strict Outbox Pattern
**Impact**: None (clarification of existing design)

### Q2: Maximum Gap Between Fill and Position Update
**Resolution**: Defined explicit SLOs: p95 < 1s, p99 < 3s, max < 60s
**Document**: ARCHITECTURE.md, "Consistency Guarantees"
**Decision**: ADR-025 - Maximum Portfolio Update Latency Bounds
**Impact**: Monitoring requirements added

### Q3: WebSocket Disconnect Recovery Timing
**Resolution**: Maximum data loss window = 42s (10s detect + 32s reconnect max)
**Document**: ARCHITECTURE.md, "Maximum Data Loss Window"
**Impact**: None (existing behavior documented)

### Q4: Batch Processing of Missed Fills
**Resolution**: First 50 immediate, remaining at 10 fills/second, max 500 fills
**Document**: ARCHITECTURE.md, "Batch Processing Limits"
**Impact**: None (reasonable limits for MVP scale)

### Q5: Strategy Start with Stale Portfolio
**Resolution**: Block strategy start if `is_stale: true` (data > 5s old)
**Document**: API.md, "Preconditions (Enforced)"
**Impact**: Additional health check before strategy start

### Q6: Maximum Staleness for Risk Validation
**Resolution**: Position data must be < 5s old, total timeout 6s (3 retries × 2s)
**Document**: ARCHITECTURE.md, "Risk Service Timeout and Retry"
**Impact**: Explicit timeout prevents indefinite waits

### Q7: Cache Invalidation and In-Flight Orders
**Resolution**: Cache clear affects new orders only, in-flight orders unaffected
**Document**: ARCHITECTURE.md, "Manual Cache Invalidation"
**Impact**: None (clarification)

### Q8: POTENTIALLY_EXECUTED Reconciliation
**Resolution**: Normal 60s reconciliation cycle, follow-up email sent to user
**Document**: PRD.md, "User Notification for Kill Switch"
**Impact**: User communication improved

### Q9: Kill Switch 10% Failure - User Action
**Resolution**: Detailed email with specific counts and step-by-step guidance
**Document**: PRD.md, "Email Template"
**Impact**: User experience improved (clarity)

### Q10: Kill Switch Clear During Reconciliation
**Resolution**: Clearing blocked until 6 preconditions met (including zero POTENTIALLY_EXECUTED)
**Document**: PRD.md, "Recovery (Kill Switch Clear Preconditions)"
**Decision**: ADR-023 - Kill Switch Clearing Preconditions
**Impact**: Safety improvement (prevents premature restart)

### Q11: Strategy STOPPING Timeout Behavior
**Resolution**: After 5 minutes → ERROR state, open orders left as-is, user notified
**Document**: PRD.md, "Transition Durations"
**Impact**: None (explicit timeout documented)

### Q12: Delete Strategy in ERROR with Positions
**Resolution**: Deletion blocked if ANY open orders or non-zero positions exist
**Document**: PRD.md, "Deletion Preconditions"
**Decision**: ADR-024 - Strategy Deletion Requires Zero Exposure
**Impact**: Safety improvement (prevents accidental deletion)

### Q13: Schema Migrations
**Resolution**: Deferred to operational documentation (not MVP-blocking)
**Document**: N/A
**Impact**: None

### Q14: Retention Policy
**Resolution**: Deferred to operational documentation (not MVP-blocking)
**Document**: N/A
**Impact**: None

### Q15: Clock Drift Handling
**Resolution**: Already specified in ARCHITECTURE.md (Time Synchronization section)
**Document**: ARCHITECTURE.md, existing content
**Impact**: None

---

## Resolved High-Severity Risks

### Risk #5: Outbox Poison Message Blocking Queue
**Resolution**: Dead Letter Queue after 3 retries, fallback to reconciliation
**Document**: ARCHITECTURE.md, "Dead Letter Queue (DLQ)"
**Decision**: Part of ADR-021
**Impact**: Resilience improvement

### Risk #6: Reconciliation Overwrites User Cancels
**Resolution**: Priority-based conflict resolution (user intent > exchange state)
**Document**: ARCHITECTURE.md, "Conflict Resolution Rules (Priority Order)"
**Decision**: ADR-022 - Priority-Based Reconciliation Rules
**Impact**: User trust improvement

### Risk #7: Rate Limit Queue Timeout Race
**Resolution**: Reconciliation detects and recovers within 60s, user notified
**Document**: ARCHITECTURE.md, "Stale Order Timeout - Race Condition Handling"
**Impact**: Edge case documented, acceptable for MVP

---

## New ADRs Created

| ADR | Title | Reason |
|-----|-------|--------|
| ADR-021 | Strict Outbox Pattern for Cross-Schema Events | Resolve cross-schema transaction contradiction |
| ADR-022 | Priority-Based Reconciliation Rules | Prevent user action overwrites |
| ADR-023 | Kill Switch Clearing Preconditions | Ensure safe restart conditions |
| ADR-024 | Strategy Deletion Requires Zero Exposure | Prevent accidental position loss |
| ADR-025 | Maximum Portfolio Update Latency Bounds | Define explicit SLOs and kill switch threshold |

---

## Files Modified

1. **ARCHITECTURE.md**
   - Fixed partial fill transaction scope (outbox pattern)
   - Added consistency guarantees (Q2)
   - Added WebSocket gap recovery timing (Q3)
   - Added batch processing limits (Q4)
   - Added Risk Service timeout/retry (Q6)
   - Added cache invalidation clarification (Q7)
   - Added DLQ handling (Risk #5)
   - Added reconciliation priority rules (Risk #6)
   - Added rate limit queue race handling (Risk #7)

2. **PRD.md**
   - Added strategy STOPPING timeout behavior (Q11)
   - Added strategy deletion preconditions (Q12)
   - Added kill switch clear preconditions (Q10)
   - Added detailed user notifications (Q8, Q9)

3. **API.md**
   - Added strategy start health check preconditions (Q5)
   - Reconciliation conflict rules already present

4. **DECISIONS.md**
   - Added ADR-021 through ADR-025

---

## Verification Checklist

- [x] All Q1-Q15 clarifications addressed
- [x] All HIGH severity risks (#5, #6, #7) mitigated
- [x] No MVP scope changes introduced
- [x] No new features added
- [x] All decisions documented in ADRs
- [x] Cross-references between documents updated
- [x] Architectural principles maintained

---

## Remaining Work (Non-Blocking)

**Medium-Priority Clarifications** (can be refined during implementation):
- Q13: Schema migration strategy (operational)
- Q14: Data retention policy (operational)

**Medium-Severity Risks** (acceptable for MVP):
- Risk #8: Portfolio queue starvation (monitoring will detect)
- Risk #9: Strategy stuck in STARTING (timeout handles)
- Risk #10: Cache stampede (can tune cache TTL)

These items do NOT block implementation start.

---

## Ready for Implementation?

**YES** - All blocker-level issues resolved.

**Conditions Met**:
1. ✅ Cross-schema transaction contradiction resolved (ADR-021)
2. ✅ WebSocket gap recovery timeout defined
3. ✅ Reconciliation conflict resolution explicit (ADR-022)
4. ✅ Kill switch clearing preconditions defined (ADR-023)
5. ✅ All high-severity risks mitigated
6. ✅ Documentation internally consistent
7. ✅ No scope creep introduced

**Next Steps**:
1. Team review of updated documents (1-2 hour session)
2. Confirm ADR-021 through ADR-025 are acceptable
3. Explicit sign-off that documents represent buildable system
4. Begin implementation

---

## Notes

All resolutions follow **existing architectural principles**:
- Correctness over performance ✓
- Explicit state machines ✓
- Idempotent operations ✓
- Exchange is external truth, DB is internal truth ✓
- One source of truth per domain ✓
- Fail-closed for financial safety ✓

**No new technologies introduced**.
**No new external dependencies**.
**No changes to MVP feature set**.

Documentation now **production-ready** for implementation.
