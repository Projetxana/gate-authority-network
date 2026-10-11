# x402 Effect Boundary — Stage 6

GATE integrates with x402 V2 at the resource-server lifecycle boundary after payment authorization is verified and before the protected resource executes.

For the default `exact` authorization flow:

```text
client payment payload
      |
      v
x402 verify
      |
      v
GATE live authority check
      |
      +-- ALLOW --> resource handler --> x402 settle
      |
      +-- DENY / UNKNOWN --> abort before handler
```

For flows that establish payment validity with a pre-handler settle, the adapter also registers a `beforeSettle` hook and runs GATE only when `phase === "before-handler"`.

## Why this boundary

Payment validity answers whether a payment authorization is acceptable. GATE answers whether the agent still has live delegated authority to cause the paid effect. Those are separate claims.

The wallet/payer must not be silently treated as the authority principal.

## Stage 6 smoke scope

The live smoke uses a protocol-valid x402 V2 verified-payment lifecycle context and the hosted GATE Network. It does **not** move real or testnet funds. A live onchain settlement test requires a funded testnet buyer wallet and a receiver address and is intentionally kept separate from this non-financial integration step.

The x402 Verified Effect is persisted by the same GATE Network meter used by MCP and HTTP.
