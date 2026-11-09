# GATE LRA r3 — reference evaluation runner

GATE-provided code, intended to be run manually by the vector author on their own machine. This directory is the selected runner-r3, not the historical r2 kit. Download, installation, tests and dry-run do not authorize hosted execution.

## Pinned references

- Effective mapping: `evidence/GATE-LRA-MAPPING-r3.md`, SHA256 `0ad66be335a92d284b3da23a789b59b4d57ee8bf25504de66cf23344504dc9ed`.
- Frozen `plan.json`, SHA256 `615ac7c26fc913df585df69868b154247530716d31022168a7848b0ed70242d3`.
- SDK `0.1.0-dev.4`, MCP `0.1.0-dev.9`; exact dependency lock, registry SHA512 integrity.
- Archived service v7 source in `evidence/deployed-v7.ts`: historical comparison evidence, NOT a day-of deployment attestation.

The frozen plan still contains historical r2 metadata (`mappingRevision3Received: false`). These bytes are intentionally unchanged. The approved r3 mapping, disabled authorization template and r3 regression tests establish the effective documentary reference. Do not interpret the stale metadata as selection of the r2 runner or silently rewrite the plan.

## Preparation only — no GATE network

Run from this directory after checking out the exact commit provided separately:

```sh
node --version
npm --version
shasum -a 256 -c SHA256SUMS
npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
node cli.mjs deps
npm test
REHEARSAL="$(mktemp -d)"
node cli.mjs dry-run --profile full --out "$REHEARSAL"
node cli.mjs decision --authorization authorization.template.json --mapping evidence/GATE-LRA-MAPPING-r3.md
```

Installation downloads only published npm dependencies. There are no install/start lifecycle hooks. Tests and dry-run use in-process fixtures, mocked service transport and a virtual clock; they are NOT hosted evidence. Expected dry-run: OFFLINE_SYNTHETIC, 42 attempts, 23 guarded calls, cleanup PASS. The decision command must report HOLD / HOSTED_NOT_AUTHORIZED. Its process exit 0 means a decision was reported, not execution permission.

Local validation: macOS arm64, Node 24.21.0 / npm 11.21.0. The tester's reported Node 24.11.1 / npm 11.6.2 have not been run here; confirm preparation on that machine. Do not update pinned packages to repair a failure.

## Scope and boundaries

Full profile: LRA-01/02/04/06/08/10, 23 guarded calls, 11 signed events, 42 total planned attempts including historical health 1, hard ceiling 50, no retry. One disposable Free project and one issuer. The two SDK objects share one dispatch queue and durable ledger. Same-offset calls are serialized; skew is recorded.

LRA-04 requires DENY and records the observed reason without imposing one. LRA-10 requires UNKNOWN/DENY with authority_lease_expired and no alternative path. LRA-06 and LRA-08 remain PARTIAL by design: graph paths do not prove credential applicability, and two SDK objects do not prove distributed replica behavior.

The published MCP effect guard is exercised, not MCP wire-transport conformance. No APS conformity, exact-request business authorization, source-side revocation discovery, live-read profile, SLA or atomic check/effect is claimed. A <=5000 ms reported GATE snapshot bound is distinct from upstream freshness. Local durable marker counts are separate from ALLOW and completed callbacks.

Read RUNBOOK.md before any later approved execution. A fresh, explicit human GO and day-of service check are mandatory. No timer or automatic launch is installed. The templates remain disabled.

## Reporting a preparation failure

Report only command name, exit code, Node/npm versions and sanitized assertion identifier. Never send API keys, authorization headers, JWS, private keys, recovery-secret.json, raw HTTP bodies or entire run folders. No additional hosted probe or second client should be started to diagnose preparation.
