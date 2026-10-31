# Stage 18 — Signed Bounded-Work Issuer Evidence (local v1)

**Status: experimental ingress verification ONLY; never use this module's `accepted` result to ALLOW an effect.**

This local-only module is an incremental security slice for the existing Stage 18 scoped-authority kernel. It verifies **two separately signed ES256 JWT artifacts** against a trusted issuer configuration:

1. a signed, scoped governing-work snapshot with a per-work contiguous sequence, grant state, direct delegation edges, principal/actor and exact permission records;
2. a signed issuer checkpoint for the same project and work, with equal accepted/checkpoint sequence and a short bounded lease.

It rejects unsigned, forged, mis-bound, cross-project, wrong-audience, wrong-issuer-key, expired-checkpoint, replayed, skipped-sequence, malformed, indirectly delegated and wildcard-permission artifacts. Existing `src/jws.mjs` and `src/source-artifact-policy.mjs` are reused rather than introducing alternative signature or key-lifecycle primitives.

The `trust` object (issuer, known signing public key + lifecycle, project ID and audience), `expectedScope`, `previousAcceptedSeq`, current time and lease policy **must come from privileged project-isolated server state**. In particular, these values must **not** be accepted from the requester or an agent's tool arguments. The function does not fetch or construct a trust registry, does not persist an accepted state transition and does not protect against races between concurrent ingestions. Event processing must atomically compare-and-update a durable per-(project, issuer, work) accepted sequence and snapshot before trusting the result.

The function returns **authenticated inputs for future admission to canonical storage**, not a GATE decision. Even a cryptographically valid, fresh checkpoint is only evidence within its issuer-declared lease, not proof of external issuer current state beyond that lease. Here, the issuer is generated locally by the test and is **not** an independent external organization. Direct delegation only in v1; multi-hop/multi-issuer authority requires separately verified issuing proofs for each hop.

No existing runtime resolver, SDK, MCP, Supabase function, receipt schema, database or production deployment is modified. The original 71 tests should remain green and 18 new tests will be discovered by `npm test`.

## Local QA (Node 20+)

```
node --test test/bounded-work-issuer-evidence.test.mjs
npm test
npm run check
npm run pack:check
```

## Next blocking phases before ANY hosted ALLOW

- Implement a privileged issuer trust registry, key rotation/emergency revocation, and authorized source onboarding.
- Implement atomic canonical snapshot storage and contiguous event admission under concurrency, tenant isolation and replay protection.
- Connect verified snapshots to `verifyBoundedWorkAuthority()`, including exact action, resource and parameter bounds; treat errors or unavailable evidence as **UNKNOWN/DENY**.
- Carry the bound work identity and honest issuer/replica freshness in SDK, real MCP/HTTP effect boundaries and GATE receipts.
- Run tenant-isolation, stale-source, revoked-work, same-work-alternative, full-effect and rollback live canary QA only when the hosted service is available.

Do not merge as feature-complete or claim OAuth Bounded Work compliance. The `gate-bounded-work-*-jwt` types here are GATE-internal experimental artifact types, not published IETF media types.
