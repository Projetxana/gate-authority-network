# GATE Developer Preview — Release Boundary

This document freezes the intended public contract for the Developer Preview and records the next correctness boundary before another public release.

## Stable public semantics

`gate.verify()` answers one narrow question:

> Does a sufficiently fresh authority path from the principal to the actor still exist now?

The public result model is:

- `VALID / ALLOW` — at least one sufficiently fresh live authority path exists.
- `INVALID / DENY` — known authority paths are revoked, invalid or hard-expired.
- `UNKNOWN / DENY` — GATE cannot establish sufficiently fresh authority state for the requested consistency contract.

The fail-closed rule is intentional.

## Freshness boundary

The next preview must distinguish:

- `replicaFreshness` — freshness of GATE's own replicated state;
- `sourceFreshness` — freshness of issuer-derived authority state;
- hard delegation `not_after` — maximum offline lifetime of an authority edge.

A current GATE database read must never be described as proof that an external issuer is current.

## Consistency

Current public v7 behavior:

- `bounded` — verify against a canonical primary database snapshot within the configured GATE snapshot freshness budget.
- `strict` — require an authoritative primary database read where the plan permits it; this does not synchronously confirm external issuer systems.

Next-preview target:

- `bounded` — require both a fresh GATE replica lease and unexpired issuer-derived source freshness evidence;
- `strict` — synchronously refresh required issuer checkpoints before deciding.

Until that target is deployed, public documentation must retain the v7 limitation explicitly.

## Product boundary

GATE is a **live authority-state resolver**, not:

- a user/agent authentication product;
- a credential issuer;
- a business-policy PDP;
- an API/MCP gateway;
- a capability-policy replacement;
- a portable signed-proof format yet.

MCP support is an adapter. The core API remains protocol-neutral.

## Release differentiators

The release should be evaluated on the combination of:

1. upstream revocation propagation;
2. issuer-derived source freshness;
3. alternate-path preservation;
4. multi-hop path resolution;
5. cross-domain/federated issuer state;
6. explicit `VALID / INVALID / UNKNOWN` fail-closed semantics;
7. hard expiry for offline authority;
8. effect-time verification;
9. protocol-neutral integration.

Do not market `multi-hop` alone as unique.

## Developer Preview limitations

- no production SLA;
- hosted sandbox authority graph is synthetic;
- sandbox keys expire;
- public sandbox is rate-limited;
- real external issuer adapters are still an integration track;
- signed portable GATE receipts are not part of the current public release;
- current v7 does not prove upstream issuer freshness;
- billing endpoints exist, but the complete production payment and subscription lifecycle has not yet been validated.

## Release freeze

Before the next major public article/loud launch, require:

- issuer-plane stale-ALLOW fixture;
- signed source checkpoint/sequence test;
- disconnected-source fail-closed test;
- hard `not_after` expiry test;
- alternate-path regression tests;
- receipt fields that separate source freshness from GATE replica freshness.

The next validation target is correctness under delayed/missing upstream state, not feature count.
