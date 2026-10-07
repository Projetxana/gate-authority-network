# GATE Developer Quickstart

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
