# Hosted GATE Source Freshness — RC1 Migration Plan

Status: canary semantics validated; **not promoted to the public v7 network**.

The hosted v7 already has hard `valid_until` on `gate_live_edges`. It does not yet expose the RC1 combination of source-global sequence continuity, signed issuer checkpoints, receipt v2, and signing-key lifecycle windows.

## Versioning rule

Do not mutate v7 semantics in place.

Introduce versioned state and RPC/function surfaces, validate them in canary, then promote deliberately.

## Source state

Target internal state:

```text
project_id
authority_issuer_id
accepted_source_seq
checkpoint_source_seq
checkpoint_last_ts
checkpoint_method
checkpoint_not_after
last_refresh_at
last_error
updated_at
```

`accepted_source_seq` is the highest **contiguous** authority-event sequence accepted by GATE.

`checkpoint_source_seq` is the latest verified issuer checkpoint sequence received by GATE.

These are not the issuer's invisible private current state.

## Event ingestion

Authority events carry both:

```text
sequence        = edge-local ordering
source_sequence = issuer/source-global ordering
```

Ingestion rules:

```text
source_sequence <= accepted_source_seq   -> stale/replay reject
source_sequence > accepted_source_seq+1  -> source_sequence_gap reject
source_sequence = accepted_source_seq+1  -> eligible for acceptance
```

Never advance `accepted_source_seq` across a hole.

## Signed checkpoint

A checkpoint is issuer-authenticated and includes:

```json
{
  "iss": "issuer",
  "aud": "gate",
  "jti": "...",
  "iat": 1791650403,
  "checkpoint_seq": 8421,
  "last_ts": "...",
  "method": "signed-checkpoint",
  "not_after": "..."
}
```

A GATE-generated timestamp is not source freshness.

## Signing-key lifecycle

The hosted source adapter/trust state must support:

```text
kid
status = standby | active | retired | revoked
valid_from
valid_until
```

Verification must bind artifact `iat` to the key lifecycle window.

- pre-activation artifact -> reject;
- post-retirement artifact -> reject;
- historical in-window artifact under graceful retirement -> verify;
- emergency revoked key -> reject immediately.

Key rotation should support an overlap window without making pre-activation artifacts valid retroactively.

## Snapshot v2

Add a versioned authority snapshot that includes:

```text
snapshot_at
source
is_primary
authority_edges
issuer_trust_states
issuer_source_states
```

Per source:

```text
authority_issuer_id
source
accepted_seq
checkpoint_seq
last_ts
method
not_after
state = FRESH | STALE | UNKNOWN
reason
```

The atomic database snapshot answers what GATE currently stores. The source state explains what issuer evidence GATE has actually received.

## Receipt v2

Hosted verification should emit `gate.authority-receipt.v2` and retain old freshness fields only as compatibility aliases during migration.

Receipt evidence must include:

```json
{
  "issuerCurrentStateIncluded": false,
  "signedSourceEvidence": true,
  "sequenceContinuityVerified": true,
  "hardExpiryEnforced": true
}
```

Bounded decisions also include `gateReplica` freshness separately from source freshness.

## Strict vs bounded

### strict

Synchronously refresh required issuer checkpoints before deciding. Refresh failure for a required source is `UNKNOWN / DENY` unless a fully fresh independent path survives.

### bounded

Use replicated issuer checkpoint state only while the source checkpoint lease and GATE replica lease are both valid.

## Hosted canary findings now required by promotion

The isolated canaries validated:

- ES256 signed checkpoints/events;
- tamper, replay, wrong issuer/audience/binding/kid rejection;
- source gap detection;
- out-of-order event handling;
- contiguous recovery;
- alternate-path preservation;
- no-fresh-path -> `UNKNOWN / DENY`;
- offline checkpoint expiry;
- hard `valid_until` expiry;
- key activation window, overlap, retirement and emergency revocation;
- receipt refusal to claim issuer state that was not received.

## Promotion sequence

1. create versioned hosted schema/RPCs;
2. deploy an RC1 preview function beside v7;
3. run the adversarial suite against the preview function;
4. compare hosted receipt bytes/semantics with SDK RC1 types;
5. invite external adversarial review;
6. only then promote the new semantics to the public endpoint.
