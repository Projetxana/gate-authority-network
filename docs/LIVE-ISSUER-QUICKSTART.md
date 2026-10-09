# Real ES256 issuer quickstart (GATE v7)

This walkthrough calls the **real GATE v7 network API** using a disposable Free project. Unlike the hosted two-minute sandbox, these events are signed with a P-256/ES256 key generated locally by the developer. It is an example signer; it does **not** automatically integrate with external Okta, Microsoft Entra, Google, or other third-party issuers.

## Start

1. Visit https://gate-phi-eosin.vercel.app/live.html and create a **new disposable Free GATE project**. Note that project creation is rate-limited per IP.
2. Keep the generated project API key secret. A GATE API key is a bearer credential; the private ES256 signing key should remain local/server-side as well.
3. Download https://gate-beta-nu.vercel.app/live-issuer.mjs to your workstation (Node.js 20+).
4. In your Terminal:

```bash
export GATE_API_KEY='YOUR_DISPOSABLE_GATE_KEY'
export GATE_TEST_ACK=yes
node live-issuer.mjs
```

The example creates a test ES256 key and registers its public JWK using:

`POST /v1/issuers/register`

```json
{
  "issuer": "urn:example:my-independent-issuer",
  "publicJwk": {"kty":"EC","crv":"P-256","kid":"your-key-id","x":"…","y":"…","alg":"ES256","use":"sig"},
  "principalPatterns": ["demo:test:*"]
}
```

It submits compact signed JWS tokens using `POST /v1/authority/events` with body `{ "set": "HEADER.PAYLOAD.SIGNATURE" }` where the claims include:

- `iss`: the registered issuer.
- `aud`: `urn:gate:project:<GATE_PROJECT_UUID>`.
- `iat`: Unix time seconds (10-minute admissible window).
- `jti`: unique anti-replay identifier.
- `events["urn:gate:event:authority-edge-state:v1"]`: `edge_id`, `issuer_principal`, `subject_principal`, `status`, `sequence`, `event_timestamp`, plus `valid_until` for ACTIVE grants.
- JWS `alg`: `ES256` and `kid` matching the registered issuer.

The script runs three metered verification calls:

```
NO GRANT -> INVALID / DENY
SIGNED ACTIVE -> VALID / ALLOW
SIGNED REVOKED -> INVALID / DENY
```

It withdraws the test issuer trust afterward, though records and metered usage may remain according to the plan's retention terms. Avoid using an existing production project for the sample.

## Production integration criteria

Before counting this as a *real external issuer integration*, use your own actual source of authority (e.g., a tool service with independently administered revocations) and demonstrate:

- Your source grants access and supplies or causes an authenticated, signed event to reach GATE.
- A new action checks GATE just before performing the side effect.
- A source-side revocation changes GATE's answer from ALLOW to DENY when no alternate path exists.
- The event delivery delay and error-handling policy are measured and documented.
- Fail-closed DENY or UNKNOWN responses are enforced by your tool server, not only shown in logs.

GATE verifies delegated-authority state; your application remains responsible for authentication, policy, action authorization, tool-side enforcement and compliance. There is no enterprise SLA or multi-region primary/replica deployment at this stage.
