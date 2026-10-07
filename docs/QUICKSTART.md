# GATE Developer Quickstart

**GATE is the live authority-state resolver for delegated agents across trust domains.**

This public sandbox demonstrates the resolver contract: a delegated actor remains `ALLOW` while at least one live authority path survives, then fails closed once no valid path remains.

Public Developer Preview:

- Quickstart UI: https://gate-phi-eosin.vercel.app/quickstart.html
- API base: `https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-sandbox`
- key lifetime: 7 days
- quota: 500 verifications/project/day

## Install

```bash
npm install @gate-avn/sdk@dev
```

## Verify

```js
import { createSandboxClient } from '@gate-avn/sdk';

const gate = createSandboxClient({ apiKey: process.env.GATE_API_KEY });
const result = await gate.verify({
  principal: 'user:demo',
  actor: 'agent:C@company-c'
});
console.log(result.authority, result.decision);
```

The sandbox starts with two live authority paths. Revoke A and one path remains (`ALLOW`). Revoke B and no path remains (`DENY`).

This is a Developer Preview sandbox, not a production trust source. GATE usage telemetry stores project-level operational metadata, not principal, actor, resource or action parameters.


## Measurement note

Sandbox activations are **Developer Preview usage**, not production deployments or enterprise pilots. The public adoption dashboard separates Preview, pilot and paid project counts when those categories exist.
