# MCP secure distribution candidate

## Status after public validation — 2026-11-02

`@gate-avn/mcp@0.1.0-dev.9` is now published, with `@gate-avn/sdk@0.1.0-dev.4` pinned as its SDK dependency. The original candidate was fused into main by PR #23 (`699b4702c98dac8815256b91a2231f2312bd6d52`). Mission 011 downloaded dev.9 from npm, verified SHA-512 and byte-for-byte equality with the candidate, and passed 34 installed-package security regressions. Mission 012 then exercised the hosted Free network through actual MCP calls; neither result establishes independent adoption.

[Start the no-clone Free MCP trial](FREE-MCP-TRIAL.md).

The published archive's README still says “not yet published”: that is historical candidate copy inside an immutable published artifact. It does not mean npm dev.9 is unavailable. Do not overwrite or republish that version to change the README.

Main subsequently changed CLI tool descriptions/schema descriptions in PR #24 without changing the version field. **Packing current main tests current source, not equality with the published dev.9 archive.** Any future distribution needs an explicit version decision, fresh archive checks and owner publication approval. No tag or registry manifest change is part of this documentation correction.

## Repository packaging check (does not publish)

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
