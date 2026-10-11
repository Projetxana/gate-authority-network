# @gate-avn/http

Framework-neutral HTTP/API effect-boundary adapter for GATE.

```text
HTTP request
    ↓
route / gateway
    ↓
GATE verify
    ↓
ALLOW → effect
DENY  → no effect
```

```js
import { GateClient, createVerifiedEffectReporter } from '@gate-avn/sdk';
import { createHttpEffectGuard } from '@gate-avn/http';

const gate = new GateClient({
  endpoint: process.env.GATE_URL,
  apiKey: process.env.GATE_API_KEY,
  source: 'api'
});

const reporter = createVerifiedEffectReporter({
  endpoint: process.env.GATE_METRICS_URL,
  apiKey: process.env.GATE_API_KEY
});

const guard = createHttpEffectGuard({
  gate,
  principal: 'user:alice',
  actor: 'agent:orders@company',
  reporter
});

await guard.enforce(
  {
    operation: 'POST /orders',
    resource: 'order:PO-123'
  },
  async () => createOrder()
);
```

Use normalized route templates such as `POST /orders` or `DELETE /customers/:id`; do not use raw URLs containing IDs, email addresses, tokens or secrets.
