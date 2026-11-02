# Stage 18 — Bounded Work, local correctness kernel v1

**Status:** experimental local-only. **Do not deploy** or publish as a work-scoped authority guarantee.

## What the test demonstrated

With two paths for the same principal/actor, A revoked and B active, the legacy
`verifyLiveAuthority()` returns `VALID/ALLOW` and selects B. Passing an
`authorityContext` to that function does not affect it: the current generic
resolver does not implement that feature.

## What this package adds

`src/verify-bounded-work-authority.mjs` is a separate pure *local* adapter that:

- matches `kind + issuer + id` across requested context, work state and edges;
- rejects missing or unverifiable work status and stale work evidence;
- denies an explicitly revoked or expired **governing work**, regardless of paths;
- preserves valid alternate *delegation* paths within a still-active work;
- refuses to let Work B rescue Work A;
- prevents the legacy `principal === actor` shortcut for scoped verification;
- labels all work-scope evidence as a **local fixture, not independent issuer attestation**.

The existing production resolver remains unchanged. Existing unscoped behavior is preserved.

## Testing

```sh
node --check src/verify-bounded-work-authority.mjs
node --test test/bounded-work-scope.test.mjs
npm test
```

## Hard security boundary — not implemented here

The caller of this local function MUST obtain `workState` and `edges` from a
trusted, project-isolated, authenticated authority state store. Client-supplied
work ID, `issuer`, work status, or edge metadata are not authorization proof.

Before any hosted use, implement and test the **entire** trust path:

1. Versioned issuer-signed bounded-work authority event and evidence of work
   grant/termination. Prevent unauthorized issuance, identity/issuer confusion,
   cross-tenant collision, replay, sequence rollback and key misuse.
2. Atomic canonical store and authorized ingestion for governing-work status,
   scope, permitted operations, and trusted source state.
3. Extend hosted `gate-network` verifier and reference control/edge services;
   never route scoped requests to the legacy path or accept them as ALLOW.
4. Check requested action, resource, limit/amount and effect constraints within
   the same issuer-authorized work. This local kernel **does not check action**.
5. Extend SDK and MCP/HTTP guards (both server-side), semantics of `UNKNOWN`
   versus `INVALID`, and genuine fresh source / replica evidence.
6. Bind context and issuer provenance in a versioned receipt without asserting
   independent confirmation or external issuer guarantees that did not occur.
7. Test actual signed events, multi-hop scope, cross-project isolation, stale
   sources, effect refusal, revocation/reauthorization and rollback on the
   hosted canary before production rollout.

No new public OAuth standard field or interoperability certification is implied
by the internal `authorityContext` structure.
