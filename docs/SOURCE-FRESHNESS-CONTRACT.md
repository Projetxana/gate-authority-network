# GATE Source Freshness Contract — v8 design

Status: implementation branch / not yet deployed to the public v7 network.

## Problem

A fresh GATE database snapshot does not prove fresh upstream authority.

Two worlds can expose the same local graph:

- W1: no issuer revocation occurred.
- W2: the issuer revoked authority, but GATE has not received the event yet.

If the local graph is identical, any decision derived only from that graph is identical. `selectedPath`, `validPathCount`, `evaluatedPathCount`, graph revision and replica age cannot distinguish W1 from W2.

GATE therefore separates three clocks:

1. **Delegation lifetime** — hard `not_after` on an authority edge.
2. **Issuer/source freshness** — issuer-derived checkpoint/sequence state.
3. **GATE replica freshness** — age/lease of the replicated GATE snapshot.

None may be presented as the other.

## Issuer checkpoint

A source that supports live authority publishes a signed checkpoint:

```json
{
  "iss": "https://issuer.example",
  "aud": "https://gate.example",
  "last_seq": 8421,
  "last_ts": "2026-10-10T16:41:03Z",
  "method": "signed-checkpoint",
  "not_after_ms": 1791650463000
}
```

The checkpoint is signed by the same trusted issuer identity used for authority events.

GATE separately tracks the highest contiguous issuer sequence it has accepted. A source is:

- `FRESH` when the signed checkpoint is unexpired and `last_seq == accepted_seq`;
- `STALE` when the issuer reports a later or earlier sequence than GATE's contiguous accepted sequence;
- `UNKNOWN` when no usable checkpoint exists, the checkpoint expired, or strict refresh failed.

## Decision receipt

A decision that depends on external authority carries per-source evidence:

```json
{
  "freshnessLane": "issuer-derived",
  "sourceFreshness": [
    {
      "source": "https://issuer.example",
      "lastSeq": 8421,
      "acceptedSeq": 8421,
      "lastTs": "2026-10-10T16:41:03Z",
      "method": "signed-checkpoint",
      "freshness": "FRESH",
      "notAfterMs": 1791650463000
    }
  ]
}
```

A well-formed graph `ALLOW` must not be surfaced as an authority `ALLOW` when a required source is `STALE` or `UNKNOWN`. The public fail-closed result is `UNKNOWN / DENY` unless another fully fresh valid path survives.

## Alternate paths

Freshness is evaluated per source used by each candidate path.

A stale source invalidates confidence in paths that depend on that source. It does not invalidate unrelated paths backed by other fresh sources.

With a source-wide sequence, a missing event cannot be attributed safely to one edge. GATE therefore conservatively treats all paths depending on that source as unknown until the sequence gap is reconciled. Finer-grained issuer checkpoints may reduce this blast radius later.

## Offline agents and hard expiry

Revocation cannot propagate to an actually disconnected agent.

Every externally delegated authority event in this profile therefore carries a hard `not_after`. Once that time is reached, the edge is invalid even if the last known issuer checkpoint was fresh.

For sensitive external effects:

- offline/local operation may rely only on authority whose hard lifetime has not expired;
- effect-time execution that requires fresh authority must reconnect and obtain a fresh GATE decision;
- inability to establish fresh upstream authority is `UNKNOWN / DENY`, not optimistic `ALLOW`.

## Strict and bounded lanes

`strict` refreshes issuer checkpoints synchronously before the decision. A required issuer that cannot be refreshed becomes `UNKNOWN`.

`bounded` may use issuer checkpoint state replicated through GATE, but both the issuer checkpoint lease and the GATE replica lease must still be valid.

Therefore:

```text
bounded ALLOW = valid graph
              + fresh issuer checkpoints
              + fresh GATE replica

strict ALLOW  = valid graph
              + synchronously refreshed issuer checkpoints
```

This is deliberately different from v7, where `strict` currently means canonical-primary GATE read and does not yet prove upstream issuer freshness.

## What this does not replace

GATE does not replace:

- short-lived OAuth/delegation tokens;
- refresh-token revocation;
- CRL/OCSP-style registries;
- revocation epochs;
- capability-based authorization;
- application policy engines.

Those mechanisms can be upstream authority signals. GATE's job is to make their current cross-domain authority state observable and enforceable at effect time.
