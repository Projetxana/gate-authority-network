# @gate-avn/ssf

Authority-source connector for OpenID Shared Signals Framework (SSF) and CAEP 1.0.

Initial support:

- ES256 `secevent+jwt` verification
- SSF issuer / audience / `iat` validation
- SSF restrictions on `sub` and `exp`
- CAEP `session-revoked`
- explicit subject-to-GATE-edge mapping

```text
Identity / authority source
       ↓
signed SSF SET
       ↓
CAEP session-revoked
       ↓
configured GATE edge mapping
       ↓
authority edge REVOKED
       ↓
same gate.verify() call changes ALLOW → DENY
```

The mapping is explicit because a CAEP session identifier is not automatically equivalent to a GATE delegation edge.


## Bring Your Own SSF Transmitter

```js
import { createSsfReceiverConnector } from '@gate-avn/ssf';
const receiver=createSsfReceiverConnector({
  issuer:'https://identity.example.com',
  accessToken:process.env.SSF_ACCESS_TOKEN,
  expectedAudience:'urn:gate:receiver:prod',
  onEvent:async verified=>{/* explicit GATE authority mapping */}
});
await receiver.open();
await receiver.pollOnce();
```

The connector discovers metadata/JWKS, creates or reuses an audience-bound POLL stream, verifies RS256/ES256 SETs, normalizes CAEP session revocation and ACKs only after the handler succeeds.
