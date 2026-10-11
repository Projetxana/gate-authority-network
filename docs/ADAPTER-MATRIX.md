# GATE Network v1 — Adapter Matrix

| Surface | Where GATE sits | Normalization target | First public proof |
|---|---|---|---|
| MCP | Tool server before handler execution | `principal`, `actor`, `action.protocol=mcp`, tool name/resource | A real tool call blocked after upstream authority loss |
| HTTP/API | Middleware / gateway before state-changing route | `protocol=http`, method+operation, resource | ✅ POST route protected by hosted `gate.verify()` and metered as a Verified Effect |
| x402 | Resource-server lifecycle after payment verification / before paid effect | `protocol=x402`, paid resource operation | ✅ x402 V2 lifecycle hook protected by hosted `gate.verify()` and metered as a Verified Effect |
| AuthZEN | PEP-side after Authorization API decision, before effect | `protocol=authzen`, action/resource | ✅ AuthZEN 1.0 evaluation permit composed with hosted GATE live authority and network metering |
| A2A | Receiving task executor before side effect | `protocol=a2a`, method/task resource | ✅ A2A 0.3 JSON-RPC `message/send` protected by hosted GATE and network metering |
| AP2 / FIDO | Consume verified mandate / intent evidence before commerce effect | `protocol=ap2`, mandate type + effect | ✅ AP2 v0.2 pre-verified mandate evidence composed with hosted GATE live authority and metering; FIDO standardization tracked |
| OAuth / SSF | Hosted/canonical authority-source connector | signed SET + explicit source-to-edge mapping | ✅ Independent caep.dev interop proven; provider-neutral BYO SSF receiver supports issuer/metadata discovery, audience-bound stream reuse, JWKS verification and ACK-after-handler semantics |

## Priority

Implementation order for Network v1:

1. MCP
2. HTTP/API
3. x402
4. AuthZEN
5. A2A
6. AP2/FIDO + OAuth/SSF source expansion

The sequence is chosen for adoption speed first, then machine-payment volume, then wider protocol embedding.
