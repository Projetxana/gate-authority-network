# Hosted GATE source-freshness migration plan

Status: design only — **not applied** to the public Supabase project.

The current hosted v7 already has hard `valid_until` on `gate_live_edges`, but it does not track a source-global contiguous event sequence or signed issuer checkpoint freshness. `gate_authority_snapshot_v1` currently returns graph state + issuer trust state only.

## New state table

Proposed table: `gate_authority_source_state`

```sql
create table public.gate_authority_source_state (
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  authority_issuer_id uuid not null references public.gate_authority_issuers(id) on delete cascade,
  accepted_source_seq bigint not null default 0 check (accepted_source_seq >= 0),
  checkpoint_source_seq bigint,
  checkpoint_last_ts timestamptz,
  checkpoint_method text,
  checkpoint_not_after timestamptz,
  last_refresh_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (project_id, authority_issuer_id)
);
```

This table is internal control-plane state. Do not expose it directly through the public Data API.

## Event schema change

Authority events need an issuer-global `source_sequence` in addition to the existing edge-local `sequence`.

Current:

```text
edge-local sequence
```

Target:

```text
sequence        = ordering for this edge
source_sequence = contiguous ordering for this issuer source
```

The hosted ingest RPC should reject:

```text
source_sequence <= accepted_source_seq   -> stale/replay
source_sequence > accepted_source_seq+1  -> source_sequence_gap
```

A gap must not be silently skipped.

## Signed checkpoint endpoint

Each live issuer adapter should provide or derive an authenticated checkpoint equivalent to:

```json
{
  "last_seq": 8421,
  "last_ts": "2026-10-10T16:41:03Z",
  "method": "signed-checkpoint",
  "not_after": "2026-10-10T16:41:08Z"
}
```

The checkpoint must be cryptographically attributable to the issuer/trust domain. A timestamp produced by GATE itself is not issuer freshness.

## Snapshot v2

Do not mutate `gate_authority_snapshot_v1` in place. Add a v2 RPC that returns:

```text
snapshot_at
source
is_primary
authority_edges
issuer_trust_states
issuer_source_states
```

Each source state returned to the verifier should include:

```text
authority_issuer_id
source
accepted_seq
last_seq
last_ts
method
not_after
freshness
freshness_reason
```

The snapshot remains atomic from GATE's database perspective, but the receipt must clearly say that source freshness came from issuer-derived checkpoints.

## Verification semantics

For every candidate path:

1. issuer trust must be active;
2. edge status must be active;
3. hard `valid_until` must not have expired;
4. the source state for each edge must be `FRESH` when fresh authority is required.

Path outcome:

```text
revoked / hard-expired         -> INVALID
source STALE / UNKNOWN         -> UNKNOWN
all checks fresh and active    -> VALID
```

If one path is unknown but another independent path is fully fresh and valid, return `ALLOW` using the fresh path.

## Receipt change

Replace the ambiguous single freshness concept with:

```json
{
  "replicaFreshness": {
    "scope": "gate-primary-or-replica",
    "fresh": true
  },
  "sourceFreshness": [
    {
      "source": "issuer-a",
      "lastSeq": 8421,
      "acceptedSeq": 8421,
      "lastTs": "...",
      "method": "signed-checkpoint",
      "freshness": "FRESH"
    }
  ]
}
```

Keep the current v7 `freshness` field only as a deprecated compatibility alias until the SDK/API major preview change is complete.

## Strict vs bounded

### strict

Before deciding, synchronously refresh the issuer checkpoint(s) required by candidate paths. Failure to refresh a required source is `UNKNOWN / DENY`.

### bounded

Use cached issuer checkpoints only while their issuer-derived `not_after` is still valid. The GATE snapshot/replica lease must also be valid.

## Offline rule

The hosted v7 already requires `valid_until` for ACTIVE authority events. Preserve that rule and make its purpose explicit:

> hard expiry is the maximum authority lifetime when no revocation signal can be received.

Do not extend `valid_until` locally without a new issuer-authenticated event.

## Canary rollout

1. Add new table/RPCs under versioned names.
2. Deploy a separate `gate-network-source-freshness-canary` function.
3. Use synthetic issuer adapters with independent event and checkpoint channels.
4. Deliberately withhold a revoke event while allowing checkpoint refresh.
5. Confirm local graph remains unchanged but canary returns `UNKNOWN / DENY` from `source_sequence_lag`.
6. Confirm a fully fresh alternate path still permits `ALLOW`.
7. Confirm disconnected source becomes `UNKNOWN` when its checkpoint lease expires.
8. Confirm hard `valid_until` expiry produces `INVALID / DENY`.
9. Only after QA, wire the public SDK to an opt-in preview endpoint.
10. Do not replace public v7 until the full regression suite passes.
