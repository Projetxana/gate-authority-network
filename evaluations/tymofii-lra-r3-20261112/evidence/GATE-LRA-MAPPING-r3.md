# lease-revocation-axes cases mapped to GATE v7 (revision 3)

Source cases: Agent-Authority-Conformance/aps-conformance-suite, fixtures/lease-revocation-axes, revision 3. GATE behavior as Jérôme described it on 2026-11-06, with his answers of 2026-11-07 and the run plan agreed by email on 2026-11-07 and 2026-11-08 applied. Nothing here has been run.

## GATE profile

- Authority observation: each guarded call reads GATE's primary database. Accepted snapshot age is at most 5,000 ms at evaluation, and the response carries freshness.snapshotAt, freshness.snapshotAgeMs and freshness.effectiveSnapshotLimitMs. This is recorded as a bounded primary read with a 5,000 ms limit, a profile of its own, not live_standing_read and not cached_lease.
- Lease: an ACTIVE delegation's valid_until, treated as a delegation lease analogue, not as expiry of the original credential evidence. The boundary is exclusive. At now >= valid_until the edge can no longer authorize an effect, and without another valid path the result is UNKNOWN/DENY with authority_lease_expired. The edge stays ACTIVE.
- Revocation: a signed revocation accepted by GATE after its database write. Revocations held by an upstream issuer and not yet delivered to GATE are outside this profile. For a revoked edge with no valid alternative, the response is INVALID/DENY, normally with all_authority_paths_revoked_or_invalid, and the evaluated path can carry upstream_authority_revoked. The cases' authority_revoked maps to the path-level reason, and both are recorded.
- Timing: a test can set valid_until and supply event timestamps in signed events. The hosted service exposes no controllable evaluation clock, so exact boundary behavior is tested only in isolation. Hosted calls near expiry record observed timing, not a boundary result.
- Operation scope: GATE v7 authority edges carry no read or write scope. GATE resolves authority paths between principals and actors, and application action policy is separate.
- Store failure: a failed snapshot read returns HTTP 503 with UNKNOWN/DENY. A database failure during authentication returns HTTP 500 with no structured decision. Both keep the guarded callback blocked.

## Axes

| Axis | Mapping | Reason |
|---|---|---|
| Evidence freshness (original lease) | partially supported | valid_until is a delegation lease analogue with an exclusive boundary, not original credential evidence expiry. |
| Authority validity | supported, bounded primary read profile | Every call reads the primary, with the snapshot time recorded. |
| Evidence-to-grant binding | not claimed | GATE verifies authority state, not which grant a presented credential belongs to. |
| Action policy P1 (observation dated at the call instant) | not supported as written | A snapshot up to 5,000 ms old is not an observation at the call instant. Decisions and guarded-callback counts are still recorded, outside the score. |

## Cases

| Case | What it tests | GATE mapping | Where it can run |
|---|---|---|---|
| LRA-01 | No revocation, permit at T=0 | supported | hosted |
| LRA-02 | Revocation at 10 s, calls at 30, 60 and 119 s | supported, expect deny on all three, conditioned on GATE having accepted the revocation before those calls | hosted |
| LRA-03 | Store outage with revocation | supported through the 503 path | isolated fault injection only |
| LRA-04 | Expiry with the store reachable and unreachable | expiry part supported, unreachable part through the 503 path | hosted for the first, isolated for the second |
| LRA-05 | Just before, at and after each expiry endpoint | supported, exclusive boundary: at valid_until the edge is expired | exact boundary in isolation only. Hosted calls near expiry are observed timing |
| LRA-06 | Independent grant for the same subject | partially mapped, where grant identity goes beyond GATE's current contract | hosted |
| LRA-07 | Store outage without revocation | supported through the 503 path, expect deny | isolated fault injection only |
| LRA-08 | Two verifier instances with their own histories | partially mapped, two SDK clients against one service, since GATE keeps no client-side state and independent verifier semantics go beyond its current contract | hosted |
| LRA-09 | Read authority does not authorize write | not claimed for GATE's authority decision, since edges carry no operation scope | none |
| LRA-10 | Repeated use does not slide expiry | supported | hosted |
| LRA-11 | Recovery after an outage, active and revoked grants | supported through the 503 path | isolated fault injection only |
| LRA-12 | g1 evidence presented for a g2 request | not claimed | none |

The 500 path is recorded as fail-closed without a decision. It is not scored as a refusal reason.

## Timing

The cases use synthetic milliseconds. A hosted run keeps the same offsets in real time, revocation at 10 s and calls at 30, 60 and 119 s, about two minutes per timeline, and records each call's snapshotAt and snapshotAgeMs next to the expected instant.

## Answers (Jérôme, 2026-11-07)

1. valid_until is exclusive. At now >= valid_until the edge is no longer eligible.
2. valid_until and event timestamps can be set. The hosted service has no controllable evaluation clock, so exact boundaries run in isolation.
3. No operation scopes on edges in GATE v7. LRA-09 is not claimed.
4. Overall INVALID/DENY with all_authority_paths_revoked_or_invalid, path-level upstream_authority_revoked.

## Agreed run sequence (hosted, Tuesday 2026-11-10, 14:00 Toronto, 11:00 Pacific)

Hosted set: LRA-01, LRA-02, LRA-04 reachable part, LRA-06, LRA-08, LRA-10. Each timeline runs sequentially in real time with the fixture offsets. 23 guarded calls in total.

| Order | Case | Setup events (signed) | Guarded calls (fixture ids, at seconds) | Expected GATE result | Duration |
|---|---|---|---|---|---|
| 1 | LRA-01 | edge g1 | r1 at 0, r2 at 30, r3 at 60, r4 at 119 | four ALLOW | 119 s |
| 2 | LRA-02 | edge g1, revocation of g1 at 10 s | r1 at 0, then r2 at 30, r3 at 60, r4 at 119 | r1 ALLOW, then three INVALID/DENY with all_authority_paths_revoked_or_invalid and path-level upstream_authority_revoked, conditioned on GATE having accepted the revocation before each call | 119 s |
| 3 | LRA-04 reachable | edge g1 with valid_until at 120 s, revocation of g1 at 10 s | r1 at 121 | DENY. The edge is both revoked and past valid_until, so the reason GATE reports is recorded as observed, not scored against one expected reason. r2 (store unreachable) is not run | 121 s |
| 4 | LRA-06 | edges g1 and g2 for the same principal and actor, revocation of g1 at 10 s | r1 at 0 (g1), r2 at 30 (labelled g1), r3 at 30 (g2) | r1 ALLOW, r3 ALLOW. r2: if GATE returns ALLOW because active g2 authorizes the request, that is recorded as graph behavior outside the grant-binding score and the run continues. An ALLOW with no supporting active edge stops the run | 30 s |
| 5 | LRA-08 | edge g1, revocation of g1 at 10 s | r1 at 0 (client 1), r2 at 0 (client 2), r3 at 30 (client 1), r4 at 30 (client 2), r5 at 121 (client 2) | r1 and r2 ALLOW, r3 to r5 DENY. Two SDK clients against the same primary service, not two independent verifiers | 121 s |
| 6 | LRA-10 | edge g1 with valid_until at 120 s, no revocation | r1 at 0, r2 at 30, r3 at 60, r4 at 90, r5 at 119, r6 at 121 | r1 to r5 ALLOW, r6 UNKNOWN/DENY with authority_lease_expired. Repeated use before 120 s must not move the expiry | 121 s |

Totals: 23 guarded calls, 11 signed events (7 edges, 4 revocations), timelines 631 s (10 minutes 31 seconds).

Budget: 42 GATE API attempts in total, counting configuration, the 11 signed events, the 23 guarded calls, cleanup and the single health preflight already made on 2026-11-07. Hard cap 50. No automatic retries, no extra telemetry calls. Target 15 minutes of wall clock with the final three minutes reserved for cleanup, inside a 30 minute coordination window.

Stop conditions: an ALLOW with no supporting active edge, a decision with unexpected uncertainty, or the budget reaching 50. Cleanup verifies that trust in the test issuer is withdrawn. Project deletion is not promised by GATE.

Not run against the hosted service: LRA-03, LRA-04 unreachable part, LRA-05 exact boundary, LRA-07, LRA-11 (outage injection and exact expiry boundary, isolated only), and LRA-09 and LRA-12 (not claimed for GATE v7).

Execution starts only on GATE's separate written authorization after this revision is confirmed.

## Recording

Each run records the runner, the GATE version, the SDK version, every decision with its HTTP status and reason, the freshness fields, and guarded-callback counts. A run by GATE's team is recorded as author-produced for the implementation side. A run by the case author is recorded as author-produced for the vector side.
