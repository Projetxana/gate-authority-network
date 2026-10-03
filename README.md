# GATE — Authority Verification Network

**Developer Preview · 2026-10-02**

> Is this agent still authorized to act **right now**?

GATE is an experimental network verifier for live, cross-domain authority. It does **not** mint a proprietary delegation token, replace OAuth, or replace your policy engine. It consumes authority state from external domains and answers whether a currently valid authority path still exists at action time.

## 5-minute demo

Requirements: Node.js 20+.

```bash
npm install
npm test
npm run demo
```

The demo calls the public SDK shape:

```js
import { GateClient } from './packages/sdk/dist/index.js';

const gate = new GateClient({ endpoint: process.env.GATE_URL });

const result = await gate.verify({
  principal: 'user:jerome',
  actor: 'agent:C@company-c',
  action: {
    protocol: 'mcp',
    name: 'delete_customer_data',
    resource: 'customer:3456'
  },
  consistency: 'bounded',
  maxStalenessMs: 200
});

if (result.decision !== 'ALLOW') throw new Error(result.reason);
```

## What GATE verifies

GATE answers a deliberately narrow question: whether the actor still has at least one live authority path from the principal, according to verified external authority state.

It can return:

- `VALID / ALLOW` — at least one live authority path exists.
- `INVALID / DENY` — the known paths are revoked/invalid.
- `UNKNOWN / DENY` — freshness or availability is insufficient for the requested consistency contract.

## What GATE does not do

GATE is **not** your business-policy PDP. The action object is carried for integration/audit context in this preview; policy such as "may this principal delete customer 3456?" belongs in AuthZEN, Cedar, OPA, Permit, Cerbos, OpenFGA, or your existing authorization system.

GATE is also not trying to replace OAuth, MCP, A2A, OpenID Federation, Security Event Tokens, or Shared Signals. The intended role is to sit underneath/alongside them as a live authority-state verifier.

## Why a network service?

A local verifier can validate signatures, expiry, scopes and token chains. It cannot independently know every external issuer's current revocation state, trust changes, alternate delegation paths, or freshness across domains. GATE's hypothesis is that the defensible value is the shared, low-latency state network — not a secret verification algorithm.

## Consistency contracts

- `bounded`: edge-local verification against a signed replica lease, with caller-defined maximum staleness; stale replicas fail closed.
- `strict`: synchronous control-plane confirmation; higher latency and lower partition availability in exchange for current-state confirmation.

## Repository map

```text
packages/sdk/      public developer-facing client
examples/          minimal SDK demonstration
services/          experimental control plane / edge / trust services
src/               PoC verification primitives
mcp/               MCP enforcement harness
test/              SDK + distributed consistency tests
docs/              architecture, integration contract, due diligence
```

## Status

This is a developer preview built to validate the architecture and integration surface. It is not production software and is not yet published to npm.

Read next: `docs/DUE-DILIGENCE-2026-10-02.md` and `docs/PUBLIC-VALIDATION-PLAN.md`.

## License

Apache-2.0. This repository is intended to make the verification logic easy to inspect and challenge; the long-term product hypothesis is the shared live authority network, not proprietary verifier code.
