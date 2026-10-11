# Hosted MCP Verified Effect — Stage 3

This smoke path proves that an actual MCP `tools/call` can use the public hosted GATE sandbox as its authority decision source immediately before a real effect.

```text
MCP tools/call
      |
      v
@ gate-avn/mcp effect guard
      |
      v
hosted GATE sandbox
      |
      v
gate.verify()
      |
      +-- ALLOW --> effect executes --> gate.verified_effect
      |
      +-- DENY / UNKNOWN --> effect does not execute
```

The Stage 3 smoke uses the existing Developer Preview sandbox identities:

- principal: `user:demo`
- actor: `agent:C@company-c`

The effect is intentionally harmless: it writes one line to a temporary local file. The file is written only inside the guarded callback after GATE returns `ALLOW`.

Run with a valid temporary sandbox key already loaded in the environment:

```bash
export GATE_URL="https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-sandbox"
export GATE_API_KEY="gate_sk_..."
npm run smoke:mcp:hosted
```

The API key is never printed by the smoke script.

