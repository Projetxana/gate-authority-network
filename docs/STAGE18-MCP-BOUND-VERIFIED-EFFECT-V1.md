# Stage 18 — Signed Bounded-Work MCP effect boundary (experimental)

Status: **local QA only / not exported / not hosted / not released**. This adds a standalone guard at `packages/mcp/src/bounded-work-effect-boundary.mjs`. It **does not change** the existing `@gate-avn/mcp/effect-boundary` adapter, existing package exports, SDK, Supabase functions, SQL schemas, or production behavior.

## Why this exists

The legacy `gate-network /v1/authority/verify` and MCP `createMcpEffectGuard` do not provide work-scoped verification. A generic graph `ALLOW` can come from an unrelated active Work B when the requested Work A is revoked. This **opt-in** module must refuse a generic `ALLOW`, even if authority is `VALID`.

The proposed MCP resource-server flow is:

1. Trusted MCP tool wrapper derives principal, actor, **trusted** `authorityContext` and exact tool/action/resource from *server-owned state*, not client-supplied claims. The tool handler passes the intended JSON effect input separately.
2. Guard hashes the exact canonical JSON input, sends only that SHA-256 digest alongside identity/scope/action to a `authorize(request)` callback. Do not send the raw input to GATE.
3. **Future hosted** GATE service must perform a project-isolated atomic read on its trusted canonical state, verify the issuer checkpoint lease, and issue a short-lived **ES256 JWS effect permit** bound to that exact request. The JWS is signed with a GATE-owned key, not an arbitrary upstream issuer key. The key must be pinned or trusted through a secure key-discovery/rotation process.
4. Guard verifies the ES256 signature, a pinned `kid`, immutable scope, principal/actor, project, exact MCP tool/action/resource, SHA-256 input digest, `VALID/ALLOW`, sequence, freshness, and a maximum five-second validity window. Unknown claims and old unscoped GATE `ALLOW` fail closed.
5. `consumePermit()` must be implemented by the **trusted resource owner** with a cross-process **durable atomic uniqueness** constraint on `(project_id,jti)`. `false`, unknown, timeout, or unavailability must deny the effect.
6. Only then does the guard invoke `effect(exactFrozenJsonInput,request)`. The handler **must execute from this verified frozen input**; bypassing the guard or using original unchecked closure values defeats the boundary.

### Signed permit v1 claim contract

JWT header: `{alg:'ES256',typ:'gate-bounded-work-effect-permit+jwt',kid:<pinned GATE verifier key>}`.

Claims (no additional keys): `iss`, `aud`, `jti`, `project_id`, `principal`, `actor`, `authority_context`, `action:{protocol:'mcp',name:'tools/call:<tool>',resource:<resource>}`, `input_sha256`, `decision:'ALLOW'`, `authority:'VALID'`, `accepted_seq`, `iat`, `exp`, `checkpoint_not_after_ms`.

### Critical limitations / non-claims

- **No hosted GATE permit-issuing API exists yet.** The test uses a synthetic local GATE key. The local test cannot prove a real third-party issuer's current authority state.
- This is an **effect-time preflight guard**, **not atomic external execution**: a revocation may land between consuming a permit and actually performing an external HTTP/MCP side effect. The effect-owning system must take responsibility for this race, e.g., transactional database effect, resource-local locking, or an appropriate equivalent effect-boundary protocol. A signed short-lived permit only bounds the window; it does not eliminate it.
- The caller of `authorize()` and the implementation of `consumePermit()` must be trusted. A Map/Set in one process is **not** a deployable replay store, and merely passing `decision:ALLOW` cannot substitute for the JWS.
- An input digest binds *specific parameters* but does not constitute semantic/monetary constraints. Do **not** treat a permission for a payment endpoint as authorizing unlimited amounts. Future profiles must interpret and enforce typed constraints before minting any permit; unknown constraints fail closed.
- No canonical signed GATE receipt v2 is claimed by this guard; its token contract is a new, **experimental permit** unrelated to existing receipts.
- Never expose a GATE signing private key in the MCP host. It belongs only in GATE's signing service. MCP host pins the **public** key.
- No changes in npm package exports or documentation should suggest this is a released feature.

## QA

```sh
node --test test/bounded-work-mcp-effect-boundary.test.mjs
npm run check
npm test
```

Acceptance: generic legacy ALLOW must deny; Work B permit cannot grant Work A; key substitution, tampering, wrong actor/tenant/resource/input digest, stale permit/checkpoint, replay-store failure, and reused JTI must deny without invoking the effect. Error after effect invocation must not be mislabeled as an authorization denial.

Next before hosted deployment: signed permit issuer implementation backed by atomic database state; authorized audience configuration, signing key rotation policy, durable permit consumption with replay QA, external-resource effect race contract, actual MCP integration test against a **non-production** hosted GATE deployment, CI and independent developer QA. PR remains Draft; no production schema changes.
