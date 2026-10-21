# GATE Stage 18 — Bounded Work atomic store v2 (review only)

**Status: experimental / NOT DEPLOYED / NOT a production-ready migration.** This file is deliberately in `supabase/stage18-drafts/` rather than `supabase/migrations/` to prevent automated application. It does **not** implement hosted verification or cryptographic admission. Its local PostgreSQL fixture uses dummy public JWK content that would never verify a real signature.

## Current GATE environment (read-only audit, 20 October 2026)

GATE Supabase project `ufqtoyakmrddqytrkcje` is `ACTIVE_HEALTHY`, region `ca-central-1`, PostgreSQL 17.11. Its 42 recorded migrations, 38 public tables, 30 active Edge Functions and existing issuer trust RPC were observed. No new Bounded Work schema was present. These queries made **no database changes**. Latest GATE code in Draft PR #16 is `49e1d34`, with 111 local tests reported passing (unrelated to SQL migration QA).

Existing database trust objects verified: `gate_projects` (`status`), `gate_authority_issuers` (`status`, `key_id`, `alg`, `public_jwk`, `federation_export_id`), `gate_issuer_trust_states` (federated trust semantics). Existing generic event/graph stores remain unaffected.

## What is better than v1

1. In-transaction `FOR SHARE` locks **both project and issuer rows**, preventing concurrent revocation, key/JWK swap or disable from racing a same-row admission decision under `READ COMMITTED`.
2. Restricts v2 admission to **non-federated local issuer** (`federation_export_id is null`). Federation key/export/upstream locks are separate work and are explicitly unsupported.
3. Requires exact equality to **privileged, verified, current issuer JWK**; `kid` alone is not enough. Prevents same-`kid` swap.
4. Per-work advisory transaction lock plus `SELECT ... FOR UPDATE` on the state; rejects sequence gaps/replays, even for first insert.
5. Terminal `REVOKED` tombstone; even another `REVOKED` cannot update the same work ID. Use a *new* Work ID for future authorization.
6. Unique `(project, issuer, jti)` replay ledger, written in the same transaction. Any replay conflict rolls back the state update.
7. Enforces short event/issuer checkpoint windows and a max 30-second lease; **rechecks expiry after waiting for locks** (in addition to independent signed evidence checks upstream).
8. Rejects unknown permission fields, non-direct delegation claims and duplicate edge IDs, rather than silently ignoring them.
9. Access denied to `anon` and `authenticated` for tables and RPC; only `service_role` receives EXECUTE. Normal service requests must use a tightly controlled ingestion service, not public SQL RPC access.

## Validation in an ephemeral PostgreSQL 17 container

Requires Docker. The QA script starts a fresh PostgreSQL 17 container with no published ports, creates **minimal test-only GATE schema/roles**, applies v2 draft SQL, and performs:

- role ACL checks;
- accepted seq 1, gap, replay, seq 2 REVOKED, terminal fail-closed;
- JTI conflict and state-update rollback;
- cross-tenant issuer, signing-key mismatch, unknown constraints and indirect delegation;
- two **concurrent** transactions attempting the same initial sequence (only one may commit);
- a concurrent issuer-revocation UPDATE vs work admission (must fail closed).

Run in your Stage 18 checkout after applying this patch:

```sh
bash qa/run-postgres17-isolated.sh
```

The script does **not** read GATE production credentials or connect to Supabase. The Docker image may need downloading. The disposable container is removed after QA. No QA pass may be claimed until this has executed successfully on real PostgreSQL.

## Blocking issues before making a Supabase migration

1. There is **NO JWS signature verification in SQL**, no independently configured trusted signer, and no atomic proof that API parameters equal an independently authenticated signed artifact. A privileged Edge ingress must verify both original JWS artifacts and project/issuer/audience/scope/permissions, then supply attested data. **Never allow caller-controlled `p_expected_public_jwk` or `service_role` credentials**.
2. A service-role RPC is a wide trust boundary. Implement a dedicated, authenticated ingress route; review source registration, allowed principal patterns, key lifecycle/rotation, fail-closed state, credential exposure, and event/checkpoint TOCTOU.
3. No signed work grant should be executable merely because a row says `ACTIVE`. Reads must revalidate latest issuer trust, key, checkpoint expiry, grant expiry and exact effect parameters. A read RPC and hosted effect guard still must be designed and tested.
4. Synthetic tests do not replace test of the **full real 42-migration Supabase schema** under concurrent clients, row-level security and the actual deployed Edge transport. A disposable Supabase branch or local full database clone will be required before production adoption.
5. Fail-closed behavior for unrecognized authorization constraints, source-freshness change/issuer partition, multi-hop and federated trust, account suspension/retirement, and audit receipts are incomplete.
6. The current generic graph engine `gate-network` must never treat an unknown scoped request as legacy graph-only ALLOW. Separate explicit API rollout and SDK/MCP/HTTP changes are still required.

**Do not copy v2 SQL into `supabase/migrations/` or deploy the hosted verifier without new review.**
