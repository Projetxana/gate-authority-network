# GATE Source Freshness Contract — RC1

Status: Release Candidate design / not yet promoted to the public v7 network.

## Problem

A fresh GATE snapshot does not prove fresh upstream authority.

Two worlds can expose the same local graph:

- W1: no issuer revocation occurred.
- W2: the issuer revoked authority, but GATE has not received any issuer signal yet.

If the local graph is identical, any graph-only decision is identical. Path counts, selected paths, graph revision and replica age cannot distinguish W1 from W2.

GATE therefore separates three clocks:

1. **Delegation lifetime** — hard `not_after` on an authority edge.
2. **Issuer/source freshness** — issuer-derived signed checkpoint plus contiguous accepted event sequence.
3. **GATE replica freshness** — age/lease of the replicated GATE snapshot.

None may be presented as the other.

## Information boundary

GATE never claims direct knowledge of private issuer state it has not observed.

If an issuer changes state and sends neither an authority event nor a checkpoint, W1 and W2 remain indistinguishable until either:

- issuer evidence arrives; or
- the last issuer freshness lease expires.

This is explicit in receipt v2:

```json
{
  "evidence": {
    "issuerCurrentStateIncluded": false
  }
}
```

## Signed issuer checkpoint

A live authority source publishes a signed checkpoint:

```json
{
  "iss": "https://issuer.example",
  "aud": "https://gate.example",
  "jti": "...",
  "iat": 1791650403,
  "checkpoint_seq": 8421,
  "last_ts": "2026-10-10T16:41:03Z",
  "method": "signed-checkpoint",
  "not_after_ms": 1791650463000
}
```

`last_seq` may be accepted temporarily as a compatibility alias for `checkpoint_seq`.

GATE separately tracks the highest **contiguous** source sequence it has accepted.

A source is:

- `FRESH` when the checkpoint is unexpired and `checkpointSeq == acceptedSeq`;
- `STALE` when a checkpoint is expired, when `checkpointSeq > acceptedSeq` (`event_sequence_gap`), or when the checkpoint trails accepted state;
- `UNKNOWN` when no usable checkpoint exists, checkpoint verification is incomplete, or a required strict refresh failed.

## Contiguous sequence rule

Authority events are source-sequenced. GATE must not accept sequence `N+2` while `N+1` is missing.

```text
acceptedSeq = 17
incomingSeq = 18  -> accept
incomingSeq = 17  -> stale/replay reject
incomingSeq = 19  -> gap reject
```

This prevents a later event from masking a missing earlier revoke on another edge owned by the same source.

## Decision rule

A graph `ALLOW` is not sufficient for a fresh-authority `ALLOW`.

For each candidate path, GATE evaluates:

- edge status;
- hard `not_after`;
- source freshness for every source used by the path.

A stale source affects only paths that depend on that source. An independent fully fresh alternate path may still produce `VALID / ALLOW`.

If no fully fresh valid path remains and at least one candidate is freshness-unknown, the result is `UNKNOWN / DENY`.

## Offline behavior

Revocation cannot propagate to a disconnected verifier.

Therefore:

- checkpoints have a freshness lease;
- delegated authority has a hard `not_after`;
- an expired source lease yields a stale source and no fresh-authority claim;
- a hard-expired edge is `INVALID`, not merely stale;
- sensitive effect-time execution that requires fresh authority must reconnect.

## Signing-key lifecycle

Issuer signing keys have an explicit lifecycle:

```text
STANDBY -> ACTIVE -> RETIRED

        emergency -> REVOKED
```

Rules:

- standby keys are not trusted;
- artifacts with `iat < valid_from` are rejected even if the key is active now;
- graceful retirement allows signatures created inside the historical validity window;
- artifacts created after `valid_until` are rejected;
- emergency `REVOKED` status rejects the key immediately, including historical artifacts.

This prevents retroactive validation of pre-activation artifacts.

## Strict and bounded lanes

```text
bounded ALLOW = valid graph
              + fresh issuer checkpoints
              + contiguous source sequences
              + fresh GATE replica
              + unexpired authority edges

strict ALLOW  = valid graph
              + synchronously refreshed issuer checkpoints
              + contiguous source sequences
              + unexpired authority edges
```

Current public v7 does not yet provide this upstream freshness guarantee.

## Non-goals

GATE does not replace short-lived delegation tokens, refresh-token revocation, CRL/OCSP, revocation epochs, capability authorization, authentication, or application policy. Those mechanisms can be upstream authority signals.
