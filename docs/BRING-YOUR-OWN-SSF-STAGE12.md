# Stage 12 — Bring Your Own SSF Transmitter

Stage 12 converts the Stage 11 caep.dev interoperability proof into a provider-neutral receiver surface in `@gate-avn/ssf`.

## Product contract

An operator supplies an SSF Transmitter `issuer` or explicit metadata URL, a bearer access token (or async token supplier), an expected Receiver audience when fixed by deployment, the event types to request, and an `onEvent` handler.

GATE performs metadata discovery, HTTPS endpoint validation, JWKS retrieval, POLL stream creation or audience-bound reuse, RS256/ES256 SET verification, issuer/audience/iat/jti/sub/exp/kid checks, CAEP `session-revoked` normalization, handler dispatch, then ACK only after the handler succeeds.

```js
import { createSsfReceiverConnector } from '@gate-avn/ssf';
const receiver=createSsfReceiverConnector({
  metadataUrl:process.env.SSF_METADATA_URL,
  accessToken:process.env.SSF_ACCESS_TOKEN,
  expectedAudience:process.env.SSF_AUDIENCE,
  onEvent:async verified=>{
    // verified external authority signal -> explicit GATE edge mapping
  }
});
await receiver.open();
await receiver.pollOnce();
```

Security defaults: `requireSubject=true`; existing streams are reused only when audience matches; an unknown `kid` triggers one JWKS refresh; no event is ACKed before a handler succeeds; access tokens are absent from `inspect()`.

Operator example:

```bash
SSF_METADATA_URL=https://idp.example/.well-known/ssf-configuration \
SSF_ACCESS_TOKEN=... \
SSF_AUDIENCE=urn:gate:receiver:prod \
npm run example:ssf:byo
```

Success criterion: the connector works against an arbitrary transmitter domain with no caep.dev hostname in connector logic and verifies, dispatches and ACKs a signed `session-revoked` event only after successful handling.
