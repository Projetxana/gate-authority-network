# @gate-avn/sdk

Experimental Node.js client for the GATE Authority Verification Network.

GATE answers one narrow question at effect time:

> Does this actor still have a live authority path from this principal right now?

GATE does not replace OAuth, AuthZEN, Cedar, OPA, Permit, Cerbos, OpenFGA, MCP, A2A, or your business-policy PDP.

## Install

```bash
npm install @gate-avn/sdk
```

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
