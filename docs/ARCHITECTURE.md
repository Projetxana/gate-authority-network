# GATE architecture — Developer Preview

## Public contract

The developer surface should remain small:

```ts
await gate.verify({ principal, actor, action, consistency, maxStalenessMs })
```

The result is an authority-state decision, not a replacement business-policy decision.

## Three separate freshness questions

A correct decision must not collapse these clocks:

1. **Delegation lifetime** — has the authority edge crossed its hard `not_after`?
2. **Issuer/source freshness** — has GATE observed a sufficiently recent issuer-derived checkpoint and every sequence up to that checkpoint?
3. **GATE replica freshness** — is the local GATE snapshot itself within its signed lease/staleness budget?

A fresh local snapshot is not evidence that the upstream issuer has not changed.

## Data plane

```text
Agent / Resource Server
        |
        | gate.verify()
        v
Nearest GATE Edge
        |
        +-- bounded -> signed GATE snapshot
        |              + issuer-derived source checkpoints
        |              + hard delegation expiry
        |
        +-- strict --> canonical control plane
                       + synchronous issuer checkpoint refresh
```

## Control plane

```text
External authority domains
  | signed authority events
  | signed sequence checkpoints / freshness leases
  v
Trust resolution / issuer verification
  v
Contiguous accepted source sequence
  + authority graph
  + append-only accepted-event log
  v
Regional signed snapshots / leases
  v
GATE edge replicas
```

## Decision provenance

A decision receipt should expose the lane that served it and the issuer-derived state it relied on:

```text
source
lastSeq
acceptedSeq
lastTs
method
freshness = FRESH | STALE | UNKNOWN
```

Graph provenance (`selectedPath`, `selectedEdges`, path counts) explains *which known authority path* produced a decision. Source provenance explains *how current the upstream evidence is*. One cannot substitute for the other.

## Design rules

1. Do not create a proprietary identity system.
2. Do not create a proprietary delegation credential unless interoperability makes it unavoidable.
3. Treat `UNKNOWN` as a real state; do not fake certainty.
4. Preserve alternate valid authority paths after a partial revocation.
5. Do not let the GATE operator arbitrarily manufacture external authority state.
6. Keep business policy outside the core verifier.
7. Make the verifier cheap enough to run on the critical path of every consequential agent action.
8. Never equate GATE snapshot freshness with issuer authority freshness.
9. Require issuer-derived freshness evidence for a fresh-authority `ALLOW`.
10. Bound offline authority with hard expiry; no fresh upstream evidence means no fresh-authority claim.

## Intended standards alignment

Current PoCs exercise ideas from OAuth/JWT, AuthZEN, MCP, Security Event Tokens / Shared Signals-style event distribution, and OpenID Federation-style trust bootstrap. Production implementation must use final normative profiles rather than PoC approximations.
