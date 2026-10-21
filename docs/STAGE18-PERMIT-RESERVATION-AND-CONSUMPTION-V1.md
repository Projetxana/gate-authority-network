# Stage 18 — GATE-signed permit reservation and consumption (review draft)

Status: **LOCAL / REVIEW ONLY; not deployed, not exposed as a public API.**

This patch introduces:

1. `gate_reserve_bounded_work_effect_permit_DRAFT_v1` — service-role-only SQL RPC. Calls the existing Stage 18 work-scoped reader (`FOR SHARE` on project, issuer, work). Checks the exact MCP action and request digest, allocates a UUID `jti`, and persists a short-lived, single-purpose reservation atomically. Returns immutable fields for a separately operated GATE signer.
2. `signReservedBoundedWorkPermitV1` — **local Node adapter**, using a GATE-owned ephemeral key in QA. Compares the trusted SQL reservation with a server-owned request, validates the lease, and creates the exact ES256 JWT currently required by `createBoundedWorkMcpEffectGuard`. It verifies its own signing key matches the pinned public key. This is not a Supabase Edge Function and contains no deployed signing secret.
3. `gate_consume_bounded_work_effect_permit_DRAFT_v1` — service-role-only SQL RPC that re-runs current work/trust/checkpoint/permission verification (including state revocation) and atomically sets `consumed_at` on a matching non-expired reservation. Replay returns false; any mismatch returns false. The caller **must verify the signed JWT and resource-owner identity** before invoking it. An arbitrary project API key must not be sufficient for a privileged consume call.
4. Docker/Postgres isolated QA, including Work A revocation after reservation, Work B independence, issuer revocation after reservation, wrong resource, digest and audience, replay, and ACL.

## Security boundaries

- `p_project_id` is supplied to these SQL RPCs by **trusted backend code only** after a project API key is authenticated. Never expose either service-role RPC directly to callers or grant `EXECUTE` to `anon`/`authenticated`.
- Issuance and consumption are distinct transactions. Source/trust revocation between reserve and consume is rechecked at consume; revocation **after consumption but before the external effect** remains possible. These drafts do not solve arbitrary HTTP/MCP effect atomicity.
- A signed upstream checkpoint proves possession of a signed lease, **not continuous access to independent issuer state** or live reachability to that issuer.
- The reservation binds exact `project_id`, `authority_issuer_id`, Work, principal, actor, MCP tool, resource, SHA-256 canonical JSON digest, audience, sequence, TTL, `jti`. Digest matching is **not an authorization policy for numerical values**, financial limits, destinations, or other semantics; unsupported effect constraints must fail closed in the issuer.
- GATE must own its ES256 private key securely, publish key rotation/pinning instructions, isolate authorization endpoints, rate-limit use, restrict who may consume, and test in a separate staging project. Do not put a production signing key in repository files, `.env` examples, or browser code.
- In the future implementation, issuance must use a trusted tenant-bound request; never construct a permit from `VALID/ALLOW` sent by a client.
- This project remains intentionally **direct-issuer-only**, no federated grant shortcut.
- The SQL draft depends on the *earlier local Stage 18* storage/read drafts and their assumptions; it is **not** a migration to run on Supabase.

## Run on Mac in the project branch

```sh
node --test test/bounded-work-permit-issuer-v1.test.mjs
npm run check
npm test
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
bash qa/run-permit-reservation-isolated.sh
```

### Exit criteria for hosted deployment

- Validate this SQL on PostgreSQL 17 isolated and review the function ACLs/RLS.
- Run issue/consume against a real separate staging Supabase project with a trusted backend, no production dataset.
- Separate issuer signing key from upstream authority issuer signing keys, provision with a secure key store and document rotation.
- Verify the hosted endpoint authenticates project **and** resource owner, ties `aud` to the actual recipient, validates the full signed permit before consumption, and handles duplicate consumption/timeouts without unintended effects.
- Demonstrate a real third-party MCP client in staging before shipping SDK/MCP package exports.
