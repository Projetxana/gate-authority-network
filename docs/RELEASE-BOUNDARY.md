# GATE Developer Preview — Release Boundary

This document freezes the intended public contract for the imminent Developer Preview.

## Stable public semantics

`gate.verify()` answers one narrow question:

> Does a live authority path from the principal to the actor still exist now?

The public result model is:

- `VALID / ALLOW` — at least one live authority path exists.
- `INVALID / DENY` — known authority paths are revoked or invalid.
- `UNKNOWN / DENY` — GATE cannot establish sufficiently fresh authority state for the requested consistency contract.

The fail-closed rule is intentional.

## Consistency

- `bounded` — allow resolution from sufficiently fresh replicated state.
- `strict` — require current confirmation from the authoritative path/control plane.

The sandbox demonstrates the decision semantics but is not a production trust source.

## Product boundary

For this release GATE is a **live authority-state resolver**, not:

- a user/agent authentication product;
- a credential issuer;
- a business-policy PDP;
- an API/MCP gateway;
- a portable signed-proof format.

MCP support is an adapter. The core API remains protocol-neutral.

## Release differentiators

The release should be evaluated on the combination of:

1. upstream revocation propagation;
2. alternate-path preservation;
3. multi-hop path resolution;
4. cross-domain/federated issuer state;
5. freshness-aware `VALID / INVALID / UNKNOWN`;
6. effect-time verification;
7. protocol-neutral integration.

Do not market `multi-hop` alone as unique.

## Developer Preview limitations

- no production SLA;
- hosted sandbox authority graph is synthetic;
- sandbox keys expire;
- public sandbox is rate-limited;
- real external issuer adapters are still an integration track;
- signed portable GATE receipts are not part of this release;
- billing is not enabled.

## Release freeze

Until external developers have used the Preview, avoid adding new core concepts unless they fix:

- a correctness/security defect;
- a developer onboarding blocker;
- a standards incompatibility;
- an observed real integration need.

The next validation target is external usage, not feature count.
