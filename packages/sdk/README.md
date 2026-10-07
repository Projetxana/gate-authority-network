# @gate-avn/sdk

Developer Preview client for GATE, the live authority-state resolver for delegated agents across trust domains.

GATE answers one narrow question at effect time:

> Does a live delegation path from this principal to this actor still exist right now?

GATE does not replace OAuth, AuthZEN, Cedar, OPA, Permit, Cerbos, OpenFGA, MCP, A2A, or your business-policy PDP.

MCP is one integration surface for GATE, not the product boundary. GATE also does not issue credentials or currently claim a portable signed authority proof.

## Install

```bash
npm install @gate-avn/sdk@dev
```

## Public Developer Preview sandbox

Create a temporary API key at https://gate-phi-eosin.vercel.app/quickstart.html, then:

```js
import { createSandboxClient } from '@gate-avn/sdk';
const gate = createSandboxClient({ apiKey: process.env.GATE_API_KEY });
const decision = await gate.verify({ principal: 'user:demo', actor: 'agent:C@company-c' });
console.log(decision.authority, decision.decision);
```

Sandbox keys expire after 7 days. Developer Preview only.

## Verify

```js
import { GateClient } from '@gate-avn/sdk';

const gate = new GateClient({
  endpoint: process.env.GATE_URL,
  apiKey: process.env.GATE_API_KEY
});

const decision = await gate.verify({
  principal: 'user:alice',
  actor: 'agent:procurement@company-c',
  action: {
    protocol: 'mcp',
    name: 'purchase_order_create',
    resource: 'purchase-order:1234'
  },
  consistency: 'bounded',
  maxStalenessMs: 200
});

if (decision.decision !== 'ALLOW') {
  throw new Error(decision.reason ?? 'authority_denied');
}
```

## Enforce immediately before an effect

`gate.enforce()` is a cooperative enforcement helper. It performs a live check immediately before invoking the supplied effect.

```js
const { decision, result } = await gate.enforce(
  {
    principal: 'user:alice',
    actor: 'agent:procurement@company-c',
    action: {
      protocol: 'mcp',
      name: 'purchase_order_create',
      resource: 'purchase-order:1234'
    },
    consistency: 'strict'
  },
  async () => createPurchaseOrder()
);
```

If GATE returns `DENY` (including `UNKNOWN -> DENY`), the effect is not invoked and a `GateDeniedError` is thrown.

This helper cannot protect an effect that bypasses it. Production enforcement must be placed at a non-bypassable effect boundary such as an API gateway, tool server, resource server, or equivalent trusted execution point.

## Status

Developer Preview. Not production software.
