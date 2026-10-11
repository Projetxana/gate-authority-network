# GATE architecture — Source Freshness RC1

## Public contract

```ts
await gate.verify({ principal, actor, action, consistency, maxStalenessMs })
```

GATE returns an authority-state decision, not a business-policy decision.

## Three independent clocks

1. **Authority lifetime** — every externally delegated edge has a hard `not_after`.
2. **Issuer/source freshness** — signed source checkpoint plus contiguous accepted source-event sequence.
3. **GATE replica freshness** — signed GATE snapshot lease / bounded staleness.

A fresh GATE copy is not evidence that an upstream issuer is current.

## Data plane

```text
Agent / Resource Server
        |
        | gate.verify()
        v
Nearest GATE Edge
        |
        +-- bounded -> signed GATE replica lease
        |              + signed issuer checkpoint state
        |              + contiguous source sequence
        |              + hard edge expiry
        |
        +-- strict --> canonical control plane
                       + synchronous issuer checkpoint refresh
                       + contiguous source sequence
                       + hard edge expiry
```

## Control plane

```text
External authority source
   | signed authority events (source_sequence=N)
   | signed source checkpoints (checkpoint_seq=N)
   v
Issuer trust + signing-key lifecycle validation
   v
Contiguous event acceptance
   + append-only accepted-event log
   + authority graph
   + source freshness state
   v
Signed GATE replication bundle
   v
GATE edge replicas
```

A later event may not skip a missing earlier source event.

## Information boundary

If the issuer changes authority but sends no event and no checkpoint, GATE cannot distinguish that world from one where nothing changed. GATE therefore never reports private issuer current state as if it were observed.

Receipt v2 includes:

```text
issuerCurrentStateIncluded = false
```

Once a signed checkpoint advances beyond GATE's contiguous accepted sequence, the affected source becomes `STALE` even if the local graph itself did not change.

## Alternate paths

Freshness is path-scoped. A stale source invalidates confidence only in paths that depend on it. A fully fresh independent alternate path may remain `VALID / ALLOW`.

Receipt v2 exposes evidence from all evaluated source branches so the excluded stale path remains auditable.

## Key lifecycle

Source artifact verification is not signature-only. GATE also enforces the signing key's lifecycle window:

```text
standby -> active -> retired
              \
               -> revoked (emergency)
```

Pre-activation artifacts never become valid retroactively. Graceful retirement preserves historical signatures inside the validity window. Emergency revocation distrusts the key immediately.

## Design rules

1. Do not create a proprietary identity system.
2. Do not create a proprietary delegation credential unless interoperability makes it unavoidable.
3. Treat `UNKNOWN` as a real state; never manufacture certainty.
4. Preserve independent alternate paths.
5. Never equate GATE replica freshness with issuer freshness.
6. Do not claim access to issuer state that GATE did not receive.
7. Require contiguous source-event sequences.
8. Bound offline authority with hard expiry.
9. Validate signing-key authority windows, not signatures alone.
10. Keep business policy outside the core verifier.
11. Keep `gate.verify()` protocol-neutral and cheap enough for the effect path.

## Standards direction

The PoC uses OAuth/JWT-style artifacts, ES256, Security Event Token / Shared Signals-style distribution concepts, and OpenID Federation-style trust bootstrap. Production profiles must follow the relevant final normative specifications rather than PoC approximations.
