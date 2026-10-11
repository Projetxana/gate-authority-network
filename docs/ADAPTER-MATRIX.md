# GATE Network v1 — Adapter Matrix

| Surface | Where GATE sits | Normalization target | First public proof |
|---|---|---|---|
| MCP | Tool server before handler execution | `principal`, `actor`, `action.protocol=mcp`, tool name/resource | A real tool call blocked after upstream authority loss |
| HTTP/API | Middleware / gateway before state-changing route | `protocol=http`, method+operation, resource | POST/DELETE route protected by the same `gate.verify()` |
| x402 | Facilitator/resource server before payment/resource effect | `protocol=x402`, settlement/resource operation | Agent payment allowed then denied after authority revocation |
| AuthZEN | Alongside policy decision flow, before PEP effect | `protocol=authzen`, action/resource | Business policy permits but GATE denies stale/revoked authority |
| A2A | Receiving task executor before side effect | `protocol=a2a`, task operation/resource | Delegated agent-to-agent task loses authority live |
| AP2 / FIDO | Consume/bridge intent and delegated-authority evidence | `protocol=ap2` or source evidence mapping | Human intent evidence plus live authority verification |
| OAuth / SSF | Source connector and resource-server integration | authority state / revocation / events | External issuer state changes GATE result without app rewrite |

## Priority

Implementation order for Network v1:

1. MCP
2. HTTP/API
3. x402
4. AuthZEN
5. A2A
6. AP2/FIDO + OAuth/SSF source expansion

The sequence is chosen for adoption speed first, then machine-payment volume, then wider protocol embedding.
