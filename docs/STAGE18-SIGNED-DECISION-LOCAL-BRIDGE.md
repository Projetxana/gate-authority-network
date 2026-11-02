# Stage 18 — Signed Bounded Work Decision Bridge (local v1)

**EXPERIMENTAL / LOCAL QA ONLY. NOT PRODUCTION AUTHORIZATION.**

This bridge calls `verifyBoundedWorkIssuerEvidence` and then
`verifyBoundedWorkAuthority` using **only the verified signed snapshot**, never
untrusted `workState` or `edges` from the request. It requires a permitted exact
`protocol + name + resource` action and a signed principal/actor binding.
The GATE v2 graph receipt is deliberately suppressed: it has no signed work
identity and must not be misrepresented as a context-bound authority receipt.

The signed admission module is also hardened to **reject unknown claim or
permission keys** instead of ignoring possible restrictions such as `maxAmount`
or `customer_ids`. The bridge rejects all effect parameters, limits, and
wildcards; this is intentionally narrower than production effect semantics.

## Trust boundary (NOT completed)

- `privileged.trust`, `privileged.expectedScope`, `privileged.previousAcceptedSeq`
  and any policy overrides **MUST be obtained from privileged, project-isolated
  server state**. They are deliberately not fields of `request`.
- This local bridge does **not** load or authenticate privileged state itself.
  If an attacker can supply `privileged`, they can authorize themselves.
- It verifies that `eventJwt` and `checkpointJwt` are consistent with the
  passed previous sequence. It does NOT atomically commit the accepted sequence,
  persist the snapshot, reject duplicate JWT IDs durably, serialize concurrent
  ingests, support trust/key revocation propagation, or guard any real effect.
- Its signed checkpoint lease bounds *represented issuer evidence* for this
  fixture, not real-time issuer state outside the signed window. The fixture
  issuer and key are locally generated, not an independent organization.
- This bridge is **one-shot**, not a storage or lifecycle state machine. An old
  accepted sequence supplied again can permit replay within the checkpoint
  lease. No production `ALLOW` should rely on this local output.
- The older unscoped `verifyLiveAuthority()` and hosted Supabase endpoints are
  unchanged. No SDK, MCP, HTTP boundary or production receipt integration.

## Local QA

```sh
node --test test/bounded-work-signed-local.test.mjs
npm test
npm run check
npm run pack:check
```

## Remaining blocking deliverables

1. Privileged issuer/key/project trust registry and proven tenant isolation.
2. Atomic per-project/work sequence+JTI admission, durable snapshot, monotonic
   revocation, key lifecycle, revocation/regrant policy, concurrency tests.
3. Action, resource, amount, parameters and effect constraints with explicit
   semantically complete matching (unknown fields MUST fail closed).
4. Hosted resolver, SDK, MCP/HTTP effect guard, work-bound truthful receipts.
5. Controlled real hosted canary and rollback, after paused Supabase is usable.

The experimental `gate-bounded-work-*-jwt` types are internal, not IETF types.
