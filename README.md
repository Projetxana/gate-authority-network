# GATE — Authority Verification Network

**Developer Preview · 2026-10-07**

> Does a live delegation path from this principal to this actor still exist **right now**?

**GATE is the live authority-state resolver for delegated agents across trust domains.**

It resolves whether a currently valid authority path still exists at effect time using live authority state from external trust domains. GATE does **not** mint a proprietary delegation token, replace OAuth, replace your policy engine, or require MCP.

## Where GATE fits

```text
Identity / credentials / policy / issuer systems
                      |
                      | authority state + trust signals
                      v
             +-------------------+
             |       GATE        |
             | live authority    |
             | state resolver    |
             +-------------------+
                      |
                 gate.verify()
                      |
                      v
             trusted effect boundary
```

GATE complements identity, credential, policy and gateway systems. **MCP is one integration surface, not GATE's definition.**

The differentiator is not multi-hop alone. It is the combination of live upstream revocation, alternate-path preservation, federated issuer state, freshness semantics and protocol-neutral effect-time resolution.

Read: `docs/POSITIONING.md`, `docs/INTEGRATION-MODEL.md`, `docs/RELEASE-BOUNDARY.md`.

## Public Developer Quickstart

- Quickstart: https://gate-phi-eosin.vercel.app/quickstart.html
- Hosted sandbox: `https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-sandbox`
- Temporary API keys: 7 days
- Quota: 500 verifications/project/day

```bash
npm install @gate-avn/sdk@dev
```

```js
import { createSandboxClient } from '@gate-avn/sdk';
const gate = createSandboxClient({ apiKey: process.env.GATE_API_KEY });
const result = await gate.verify({ principal: 'user:demo', actor: 'agent:C@company-c' });
console.log(result.authority, result.decision);
```

See `docs/QUICKSTART.md`.

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

GATE answers a deliberately narrow question: whether the actor still has at least one live delegation path from the principal, according to sufficiently fresh external authority state.

The public contract separates **authority state** from application policy. A credential can remain syntactically valid while GATE returns `INVALID` or `UNKNOWN` because the authority behind it is no longer live or cannot be established with the requested freshness.

It can return:

- `VALID / ALLOW` — at least one live authority path exists.
- `INVALID / DENY` — the known paths are revoked/invalid.
- `UNKNOWN / DENY` — freshness or availability is insufficient for the requested consistency contract.

## What GATE does not do

GATE is **not** your business-policy PDP. The action object is carried for integration/audit context in this preview; policy such as "may this principal delete customer 3456?" belongs in AuthZEN, Cedar, OPA, Permit, Cerbos, OpenFGA, or your existing authorization system.

GATE is also not trying to replace OAuth, MCP, A2A, OpenID Federation, Security Event Tokens, Shared Signals, an IdP, or an API/AI gateway. The intended role is to sit underneath/alongside them as a live authority-state resolver.

The Developer Preview does **not** claim a portable cryptographically signed authority proof. It returns a live resolution result; a signed GATE receipt is a possible future layer, not a current release promise.

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

## Install

### SDK

```bash
npm install @gate-avn/sdk@dev
```

Current SDK Developer Preview: `0.1.0-dev.3`

### MCP server

```bash
npm install @gate-avn/mcp@dev
```

Current MCP Developer Preview: `0.1.0-dev.5`

Official MCP Registry:

```text
io.github.Projetxana/gate-authority-network
```

## Status

GATE is publicly available as a Developer Preview on npm and in the Official MCP Registry.

The SDK and MCP server are installable independently from the public npm registry. The MCP server is discoverable through the Official MCP Registry.

This remains experimental Developer Preview software and is not production-ready.

Read next: `docs/DUE-DILIGENCE-2026-10-02.md` and `docs/PUBLIC-VALIDATION-PLAN.md`.

## License

Apache-2.0. This repository is intended to make the verification logic easy to inspect and challenge; the long-term product hypothesis is the shared live authority network, not proprietary verifier code.
