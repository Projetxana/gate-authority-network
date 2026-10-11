# @gate-avn/x402

GATE authority enforcement at the x402 pre-effect boundary.

x402 V2 supports lifecycle hooks on the resource server. For the default `exact` authorization flow, payment authorization is verified before the resource handler and settlement occurs afterward. GATE plugs into the verified-payment boundary before the handler executes.

```text
x402 payment verification
        ↓
GATE live authority verification
        ↓
ALLOW ─────────────→ resource handler → x402 settlement
DENY / UNKNOWN ───→ abort before handler
```

For x402 flows that settle before the handler (for example an upfront flow), GATE also registers on the pre-handler settlement hook.

## Usage

```js
import {
  x402ResourceServer,
  HTTPFacilitatorClient
} from '@x402/core/server';
import {
  GateClient,
  createVerifiedEffectReporter
} from '@gate-avn/sdk';
import { registerGateX402AuthorityHooks } from '@gate-avn/x402';

const resourceServer = new x402ResourceServer(
  new HTTPFacilitatorClient({
    url: 'https://x402.org/facilitator'
  })
);

const gate = new GateClient({
  endpoint: process.env.GATE_URL,
  apiKey: process.env.GATE_API_KEY,
  source: 'api'
});

const reporter = createVerifiedEffectReporter({
  endpoint: process.env.GATE_METRICS_URL,
  apiKey: process.env.GATE_API_KEY
});

registerGateX402AuthorityHooks(resourceServer, {
  gate,
  principal: requestPrincipal,
  actor: requestAgent,
  operation: 'POST /paid-resource',
  resource: 'resource:premium-report',
  reporter
});
```

The wallet/payer is not automatically treated as the authority principal. Payment identity and delegated authority are different facts.

The Verified Effect meter receives only the GATE metering contract. Payer, payTo, payment payload, signatures, resource identifiers and amounts are not copied into the meter.
