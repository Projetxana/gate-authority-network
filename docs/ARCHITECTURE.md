# GATE architecture — Developer Preview

## Public contract

The developer surface should remain small:

```ts
await gate.verify({ principal, actor, action, consistency, maxStalenessMs })
```

The result is an authority-state decision, not a replacement business-policy decision.

## Data plane

```text
Agent / Resource Server
        |
        | gate.verify()
        v
Nearest GATE Edge
        |
        +-- bounded -> signed local authority snapshot + freshness lease
        |
        +-- strict --> authoritative control-plane confirmation
```

## Control plane

```text
External authority domains
  | signed state events
  v
Trust resolution / issuer verification
  v
Authority graph + append-only accepted-event log
  v
Regional signed snapshots / leases
  v
GATE edge replicas
```

## Design rules

1. Do not create a proprietary identity system.
2. Do not create a proprietary delegation credential unless interoperability makes it unavoidable.
3. Treat `UNKNOWN` as a real state; do not fake certainty.
4. Preserve alternate valid authority paths after a partial revocation.
5. Do not let the GATE operator arbitrarily manufacture external authority state.
6. Keep business policy outside the core verifier.
7. Make the verifier cheap enough to run on the critical path of every consequential agent action.

## Intended standards alignment

Current PoCs exercise ideas from OAuth/JWT, AuthZEN, MCP, Security Event Tokens / Shared Signals-style event distribution, and OpenID Federation-style trust bootstrap. Production implementation must use the final normative profiles rather than PoC approximations.
