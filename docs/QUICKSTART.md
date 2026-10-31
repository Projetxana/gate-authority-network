# GATE Developer Quickstart

**GATE is the live authority-state resolver for delegated agents across trust domains.**

Stage 17 exposes two deliberately separate onboarding paths:

1. **Sandbox** — learn GATE revocation and alternate-path semantics on a synthetic graph.
2. **Live Free Network** — create a real managed GATE project and use the canonical `gate-network` service.

A sandbox activation is not a production authority integration.

---

## Option A — Learn the semantics in the sandbox

Hosted UI:

https://gate-phi-eosin.vercel.app/quickstart.html

The sandbox provides:

- a synthetic two-path authority graph;
- a temporary API key valid for 7 days;
- 500 verifications/project/day;
- an `ALLOW -> ALLOW -> DENY` revocation scenario.

Install:

```bash
npm install @gate-avn/sdk@0.1.0-dev.4
```

Use the sandbox client:

```js
import { createSandboxClient } from '@gate-avn/sdk';

const gate = createSandboxClient({
  apiKey: process.env.GATE_API_KEY
});

const result = await gate.verify({
  principal: 'user:demo',
  actor: 'agent:C@company-c'
});

console.log(result.authority, result.decision);
```

The sandbox is an evaluation surface. It is not a production issuer federation or an SLA-backed authority source.

---

## Option B — Create a real Free GATE Network project

Canonical managed Developer Preview endpoint:

```text
https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-network
```

Create a live Free project:

```bash
curl -sS   -X POST   'https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-network/projects/register'   -H 'content-type: application/json'   -d '{"name":"My GATE project"}'
```

The response includes:

- a real GATE project ID;
- a bearer API key;
- the canonical network endpoint;
- the project audience;
- the GATE authority event type;
- current Free-plan limits.

Current Free Developer Preview limits:

```text
50,000 verifications / month
1 authority issuer
bounded consistency
strict consistency: not included
```

The returned API key is a bearer credential. Keep it secret and do not commit it to Git, paste it into issues, or expose it in screenshots or logs.

Set the environment locally:

```bash
export GATE_URL='https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-network'
export GATE_API_KEY='gate_sk_...'
```

Confirm the project:

```bash
curl -sS   "$GATE_URL/v1/project"   -H "authorization: Bearer $GATE_API_KEY"
```

Install the SDK:

```bash
npm install @gate-avn/sdk@0.1.0-dev.4
```

Use the canonical client:

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
    protocol: 'http',
    name: 'purchase_order_create',
    resource: 'purchase-order:1234'
  },
  consistency: 'bounded'
});

console.log(decision.authority, decision.decision);
```

A newly created live project has **no preloaded authority graph**. An arbitrary principal/actor pair should therefore not be expected to return `ALLOW`.

To establish real authority state, register an issuer and deliver signed authority events.

Continue with:

[`LIVE-ISSUER-QUICKSTART.md`](LIVE-ISSUER-QUICKSTART.md)

---

## Effect-boundary enforcement

A verification only protects an effect when it runs immediately before the effect at a trusted boundary.

```js
const { decision, result } = await gate.enforce(
  {
    principal: 'user:alice',
    actor: 'agent:procurement@company-c',
    action: {
      protocol: 'http',
      name: 'purchase_order_create',
      resource: 'purchase-order:1234'
    },
    consistency: 'bounded'
  },
  async () => createPurchaseOrder()
);
```

If GATE returns `DENY`, including fail-closed `UNKNOWN -> DENY`, the effect callback is not invoked.

The helper cannot protect an effect that bypasses it. Production enforcement belongs at a non-bypassable tool server, resource server, API gateway, or equivalent trusted effect boundary.

---

## Current operational boundary

The Stage 16 public baseline currently uses:

- one canonical Canadian primary database;
- no production regional replica topology;
- no independent third-party issuer propagation SLA;
- bounded verification against authority state available to GATE;
- strict consistency only where plan entitlements permit it.

GATE must not claim knowledge of an issuer change it has not received.

See:

- [Production Manifest](PRODUCTION-MANIFEST-V1.md)
- [Release Boundary](RELEASE-BOUNDARY.md)
- [Source Evidence Contract](SOURCE-EVIDENCE-CONTRACT-V1.md)

---

## Stage 17 onboarding target

An external developer who has never spoken with the GATE team should be able to go from discovery to their first real managed-network verification without private assistance.

Target:

```text
< 5 minutes to first gate.verify()
```

## Measurement note

Sandbox activations are Developer Preview usage, not production deployments or enterprise pilots.

GATE usage telemetry is privacy-minimized and does not store principal, actor, resource, action parameters, prompts, bearer tokens, or action content.
