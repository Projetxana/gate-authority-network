# @gate-avn/mcp

MCP is an adapter for GATE, not GATE's product boundary. The core resolver remains protocol-neutral through `gate.verify()`.

MCP adapter exposing GATE live cross-domain delegated authority-state resolution.

## Public Developer Preview sandbox

Create a temporary API key at https://gate-phi-eosin.vercel.app/quickstart.html, then:

```bash
GATE_URL="https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-sandbox" \
GATE_API_KEY="gate_sk_..." \
npx @gate-avn/mcp@0.1.0-dev.8
```

## Real Free Network — Developer Preview

Create a disposable Free project at https://gate-phi-eosin.vercel.app/live.html and retain its API key privately. Set `GATE_API_KEY` in your shell without pasting it into screenshots or commits. An MCP client launches this process over **stdio** (do not expect an HTTP listener or a conventional interactive prompt):

```bash
GATE_URL="https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-network" \
GATE_API_KEY="$GATE_API_KEY" \
npx @gate-avn/mcp@0.1.0-dev.8
```

A newly created live Free project has no preloaded authority grants. Register an ES256 issuer and submit signed ACTIVE events before expecting `ALLOW`. The Free plan supports **bounded**, not `strict`, consistency. For a real protected MCP tool, invoke the GATE effect guard inside your own trusted tool handler; merely exposing `gate_verify` does not enforce it.

Tools:

- `gate_verify` — verifies whether the actor still has a live authority path from the principal.
- `gate_status` — reports GATE edge health/freshness.

## Zero-configuration demo

```bash
npx @gate-avn/mcp@0.1.0-dev.8 --demo
```

Demo mode runs a clearly labelled in-memory authority graph:

```text
user:demo
  ├─ agent:A@company-a ─┐
  └─ agent:B@company-b ─┴─ agent:C@company-c
```

Additional demo-only tools:

- `gate_demo_revoke` — revoke upstream path A or B.
- `gate_demo_reset` — restore both paths.

The demo shows alternate-path preservation:

1. both paths active -> `ALLOW`
2. revoke A -> still `ALLOW` through B
3. revoke B -> `DENY`

Demo mode is not a production authority source.

## Environment

- `GATE_URL` — required in real mode
- `GATE_API_KEY` — required for authenticated Free Network project calls; do not embed it in client-visible code or logs
- `GATE_TIMEOUT_MS` — optional, default `2000`

## Security boundary

An MCP tool that merely calls `gate_verify` voluntarily is not a non-bypassable security boundary. Put effect-time enforcement in the trusted tool/resource/API execution path.

Developer Preview. Not production software.

## Effect-boundary guard — Network v1

The Network v1 adoption layer adds a reusable MCP effect guard. The application keeps its own MCP tools; GATE runs immediately before the tool's real side effect.

```js
import {
  createMcpEffectGuard,
  createVerifiedEffectCounter
} from '@gate-avn/mcp/effect-boundary';

const counter = createVerifiedEffectCounter();
const guard = createMcpEffectGuard({
  gate,
  principal: 'user:alice',
  actor: 'agent:assistant@company',
  consistency: 'bounded', // Explicit Free-plan setting; not an upstream freshness SLA.
  counter
});

server.registerTool('send_email', toolDefinition, async input => {
  const { result } = await guard.enforceToolCall(
    { toolName: 'send_email', resource: `mailbox:${input.to}` },
    async () => actuallySendEmail(input)
  );
  return result;
});
```

Each completed authority decision guarding a concrete MCP effect produces one privacy-minimized **Verified Effect** event. `DENY` and `UNKNOWN / DENY` are counted as verification events but the underlying effect is never invoked.

The local counter is a Stage 2 integration primitive, not billing infrastructure. Managed-network metering remains server-side.

## Network Verified Effects

The effect-boundary guard can persist the same privacy-minimized `gate.verified_effect` event to the managed GATE metrics plane:

```js
import { createVerifiedEffectReporter } from '@gate-avn/mcp/verified-effect-reporter';

const reporter = createVerifiedEffectReporter({
  endpoint: process.env.GATE_METRICS_URL,
  apiKey: process.env.GATE_API_KEY
});

const guard = createMcpEffectGuard({
  gate,
  principal,
  actor,
  reporter
});
```

The network meter stores the verification ID, protocol, normalized operation, authority/decision and serving metadata. It does not send principal, actor, resource, parameters, prompts, credentials, tokens or payload content.
