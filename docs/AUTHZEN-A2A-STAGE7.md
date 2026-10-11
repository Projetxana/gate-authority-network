# AuthZEN + A2A Adoption Surfaces — Stage 7

Stage 7 adds two protocol surfaces to the same GATE Network economic unit.

## AuthZEN

The integration is PEP-side. An AuthZEN Authorization API 1.0 PDP permit is necessary but not sufficient for an agent effect:

```text
AuthZEN decision=true
       |
       v
GATE live authority
       |
       +-- ALLOW --> effect
       |
       +-- DENY / UNKNOWN --> no effect
```

A PDP denial short-circuits without calling GATE.

## A2A

The initial A2A binding protects incoming JSON-RPC 2.0 `message/send` before the receiving agent causes a task effect.

```text
A2A message/send
       |
       v
receiving agent boundary
       |
       v
GATE live authority
       |
       +-- ALLOW --> task/effect
       |
       +-- DENY / UNKNOWN --> JSON-RPC error, no effect
```

The A2A message body is not copied into the Verified Effect meter.

## Economic convergence

MCP, HTTP, x402, AuthZEN and A2A now feed the same event:

`gate.verified_effect`
