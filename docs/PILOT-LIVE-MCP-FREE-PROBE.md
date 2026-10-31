# Stage 17 Pilot Readiness P0-B — Live MCP guarded effect

Status: **operator-run hosted Free E2E passed on 2026-10-30; unaffiliated cold trial pending.**

## Scope

Tests a real MCP `tools/call` in a child `stdio` server, which uses `createMcpEffectGuard` at the trusted effect boundary and `GateClient` to query the **hosted Free network**. The test creates a single developer-owned disposable ES256 issuer, sends signed ACTIVE and REVOKED events, and permits exactly **one harmless local file marker**.

This is **not** a test of independently operated external issuer propagation, stage18 task-scoped permits, business-policy authorization, real external/business side effects, production performance, customer adoption or a security certification. It does not change production services.

## Prerequisites

- Node.js 20+ and `npm ci` at the repository root.
- A **new disposable** Free project from https://gate-phi-eosin.vercel.app/live.html, with **0 active issuers**.
- A fresh bearer key kept **only in your local shell**. Never paste it in a chat, GitHub issue or logs.
- For live verification use the canonical `gate-network` endpoint (default); never the sandbox.

## Run the fixture first (no hosted calls)

```bash
node --test test/pilot-live-free-mcp-effect.test.mjs
```

## Run the hosted Free test

```bash
read -s 'GATE_API_KEY?Disposable GATE Free API key: ' && echo
export GATE_API_KEY
node scripts/run-live-free-mcp-effect.mjs
unset GATE_API_KEY
```

These `read` commands use zsh (macOS default). Do not run in `set -x` mode.

Expected output:

```text
PASS before_grant: INVALID / DENY; effects=0
PASS after_signed_active: VALID / ALLOW; effects=1
PASS after_revocation: INVALID / DENY; effects=1
PASS: actual MCP tools/call + hosted GATE signed revoke + no second effect
CLEANUP: test issuer trust revoked
```

The exact reason and `UNKNOWN`/`INVALID` status may vary on initial missing authority; only an authenticated `DENY` is necessary before grant. A clean pass must have **one effect only**, 3 counted MCP verifications, and cleanup confirmed.

### Safety and limitations

- The script refuses a Free project that already has an active issuer.
- If issuer cleanup prints a WARNING, the script now exits nonzero; manually revoke the **disposable issuer** in the project before reusing it.
- The script uses a short-lived ES256 key held in process memory, a unique principal/actor and a temporary effect file; it removes its temporary file on exit.
- The MCP tool never accepts principal/actor as client input; those are trusted server-side parameters.
- The Stage 17 network checks a delegated authority **path**, not the action's business policy or task scope. The marker is a safe test action, not a real operation authorization claim.
- Before/after revocation is tested in sequence; it is **not** a propagation-latency SLA.

## Hosted network evidence (operator-reported, 2026-10-30)

```text
PASS before_grant: INVALID / DENY; effects=0
PASS after_signed_active: VALID / ALLOW; effects=1
PASS after_revocation: INVALID / DENY; effects=1
PASS: actual MCP tools/call + hosted GATE signed revoke + no second effect
LIMIT: developer-controlled ES256 issuer, disposable local effect, bounded Free; NOT independent issuer, scoped work permit, or SLA.
CLEANUP: test issuer trust revoked
```

This records an operator-supplied terminal result, **not** a cold installation by an unaffiliated developer, independent external-issuer verification, or production certification. The generic guard review requires testing that missing trusted identity-resolver results cannot be replaced by caller identities.

## Promotion condition

Keep the patch isolated until `npm run check`, `npm test`, `npm run pack:check`, fixture tests, one real disposable Free network run, and a security review of failing network calls all pass. A subsequent independent clean-machine trial is still mandatory before prospect outreach.
