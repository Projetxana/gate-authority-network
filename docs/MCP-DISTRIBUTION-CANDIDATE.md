# MCP secure distribution candidate

Candidate: `@gate-avn/mcp@0.1.0-dev.9`, SDK dependency pinned to the unchanged
published `@gate-avn/sdk@0.1.0-dev.4`. This candidate is not published. Neither npm
tags nor the public MCP Registry manifest are changed. The hardened guard is
retained byte-for-byte from main `016849a1edf86ba32804588baa476ef842482428`.

From a clean checkout with Node.js 20+ and npm:

```sh
npm ci
npm test
npm run check
npm pack --dry-run --workspace @gate-avn/mcp
npm run test:mcp:package
```

The last command packs an actual archive, checks its exact five-file allowlist,
compares every file with the candidate source, scans credential/private-key
patterns, checks integrity and version alignment, installs the archive in an
isolated consumer with the published SDK, then runs the same security regression
suite against that installed package. It cleans up temporary verification files.
It requires npm registry access, but calls no hosted GATE endpoint and publishes
nothing. Set `GATE_MCP_ARTIFACT_DIR` to retain the tested archive and JSON report.

Regression coverage includes server identity override, absent/invalid/throwing
identity resolvers, contradictory UNKNOWN/ALLOW, strict downgrade, server
staleness budget preservation and tightening, HTTP errors, malformed replies,
disconnects, and SDK timeout with an actual loopback HTTP server. A positive
server-derived identity case ensures the suite also exercises successful effects
(in-memory counters only). No client account or business effect is used.

Passing does not prove external adoption, production readiness, upstream freshness,
or atomic verification/effect execution. The guard relies on an abort-aware SDK
transport; arbitrary custom verifiers must enforce their own deadlines. Publication
and tag changes require a separate explicit instruction after review. The older
published dev.8 guard is not equivalent to this candidate.
