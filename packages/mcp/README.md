# @gate-avn/mcp

MCP is an adapter for GATE, not GATE's product boundary. The core resolver remains protocol-neutral through `gate.verify()`.

MCP adapter exposing GATE live cross-domain delegated authority-state resolution.

## Release candidate — not yet published

Version `0.1.0-dev.9` is prepared locally. Commands below target that exact version
and become usable from npm only after a separately approved publication. Existing
npm tags and the MCP Registry manifest remain unchanged. Do not substitute the
older published guard for this candidate.

Requires Node.js 20+ and npm. For a local candidate, install the verified `.tgz`
in a separate project. See `docs/MCP-DISTRIBUTION-CANDIDATE.md` in the repository
for the packaging and archive-test procedure.

## Public Developer Preview sandbox

Create a temporary API key at https://gate-phi-eosin.vercel.app/quickstart.html, then:

```bash
GATE_URL="https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-sandbox" \
GATE_API_KEY="$GATE_API_KEY" \
npx @gate-avn/mcp@0.1.0-dev.9
```

## Real Free Network — Developer Preview

Create a disposable Free project at https://gate-phi-eosin.vercel.app/live.html and retain its API key privately. Set `GATE_API_KEY` in your shell without pasting it into screenshots or commits. An MCP client launches this process over **stdio** (do not expect an HTTP listener or a conventional interactive prompt):

```bash
GATE_URL="https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-network" \
GATE_API_KEY="$GATE_API_KEY" \
npx @gate-avn/mcp@0.1.0-dev.9
```

A newly created live Free project has no preloaded authority grants. Register an ES256 issuer and submit signed ACTIVE events before expecting `ALLOW`. The Free plan supports **bounded**, not `strict`, consistency. For a real protected MCP tool, invoke the GATE effect guard inside your own trusted tool handler; merely exposing `gate_verify` does not enforce it.

Tools:

- `gate_verify` — verifies whether the actor still has a live authority path from the principal.
- `gate_status` — reports GATE edge health/freshness.

## Zero-configuration demo

```bash
npx @gate-avn/mcp@0.1.0-dev.9 --demo
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

Use server-authenticated principal/actor values for each session/request. Do not
share a guard across unrelated sessions or let a client choose these values.
Missing or invalid configured identity-resolver results fail closed. A guard with
no configured identity accepts request identities only for trusted server code
that has already authenticated them; never forward untrusted tool arguments.

Only `VALID / ALLOW` can invoke the effect. UNKNOWN, malformed results, network
errors and SDK timeouts block it. The SDK must use an abort-aware fetch
implementation; the guard does not impose its own deadline on arbitrary custom
verifiers. Pin `maxStalenessMs` on the server when required; callers may tighten
but cannot relax that budget. Free mode must explicitly use `bounded`.

Authenticate the user and enforce action/resource policy in your application.
GATE's Stage 17 action fields are context, not scoped permission authorization.
The check and effect are not an atomic transaction; no external issuer freshness
SLA or Stage 18 permit guarantee is established here. For bearer requests,
configure server-side fetch with `redirect: 'error'` when redirects are not intended.

Never expose API keys or private signing keys in tool arguments, browser code,
prompts, source control, shell history, screenshots or logs. Load them privately
from the server environment/secret store. `GATE_API_KEY` must already be set
before launching the stdio process; do not paste its value into the command.

Developer Preview. Not production software.

## Effect-boundary guard — Network v1

The Network v1 adoption layer adds a reusable MCP effect guard. The application keeps its own MCP tools; GATE runs immediately before the tool's real side effect.

```js
import {
  createMcpEffectGuard,
  createVerifiedEffectCounter
} from '@gate-avn/mcp/effect-boundary';

// authenticateToolSession() is application-owned middleware. It must derive
// identities from a verified server session, never from tool input or prompts.
const session = await authenticateToolSession();
const counter = createVerifiedEffectCounter();
const guard = createMcpEffectGuard({
  gate,
  principal: () => session.principal,
  actor: () => session.actor,
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
  consistency: 'bounded', // Explicit Free-plan setting.
  reporter
});
```

The network meter stores the verification ID, protocol, normalized operation, authority/decision and serving metadata. It does not send principal, actor, resource, parameters, prompts, credentials, tokens or payload content.
