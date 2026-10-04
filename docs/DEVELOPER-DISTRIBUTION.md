# GATE Developer Distribution

The goal is to let developers discover, install, challenge, and integrate GATE without requiring a sales-led enterprise pilot.

## Distribution surfaces

1. GitHub — source, architecture, tests, issues, contributions.
2. npm — installable SDK and MCP server.
3. Official MCP Registry — standardized discovery metadata for the MCP server.
4. Later: ecosystem directories and a hosted GATE edge/network.

## Packages

### `@gate-avn/sdk`

Protocol-neutral Node.js client.

Primary API:

```js
await gate.verify({ principal, actor, action });
```

Effect-time cooperative enforcement:

```js
await gate.enforce(request, effect);
```

`enforce()` never runs the effect unless the GATE decision is `ALLOW`.

### `@gate-avn/mcp`

Stdio MCP server exposing:

- `gate_verify`
- `gate_status`

Demo mode additionally exposes:

- `gate_demo_revoke`
- `gate_demo_reset`

Zero-config demo:

```bash
npx @gate-avn/mcp --demo
```

Real mode:

```bash
GATE_URL=https://edge.example npx @gate-avn/mcp
```

## Security statement

Calling `gate_verify` is not by itself a non-bypassable security boundary.

GATE must be enforced at a trusted effect boundary. The SDK `enforce()` helper demonstrates the required ordering:

```text
agent request
    |
    v
GATE live authority check
    |
    +-- DENY/UNKNOWN --> stop
    |
    +-- ALLOW --------> effect
```

Production deployments must ensure that the protected effect cannot be reached through an alternate path that skips GATE.

## Publication order

1. Verify npm ownership of the `@gate-avn` scope.
2. Run the repository test suite.
3. Run package dry-runs.
4. Publish `@gate-avn/sdk`.
5. Publish `@gate-avn/mcp`.
6. Validate `server.json` with `mcp-publisher`.
7. Authenticate to the Official MCP Registry with the GitHub identity controlling `io.github.projetxana/*`.
8. Publish the registry metadata.
9. Verify installation from a clean directory.
10. Only then announce publicly.

## What comes next

The next developer-distribution milestone should add a stable Authority Adapter contract so developers can contribute real authority sources without changing the GATE verification engine.
