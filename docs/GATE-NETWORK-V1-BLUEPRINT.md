# GATE Network v1 Blueprint — Post-Stage-15 Architecture & Adoption Review

**Status:** architecture freeze candidate  
**Reviewed:** 2026-10-11  
**Branch baseline:** `feat/network-v1-adoption-layer` @ `a5d74f3`  
**North Star:** **Verified Effects / day**

## Executive decision

Stages 1–15 proved the core technical thesis. The next work is not more proof-of-concept breadth. It is convergence into a reproducible, self-service, externally usable managed network.

GATE keeps its stage model, but Stages 16–20 are product-convergence stages with explicit release gates.

The Network v1 product definition is:

> **Before an agent acts, verify its authority with GATE.**

Canonical placement:

```text
identity / intent / policy / delegation / authority sources
                         |
                         v
                    GATE Network
                         |
                    gate.verify()
                         |
              trusted effect boundary
                         |
                         v
                consequential effect
```

GATE remains the live authority-state resolver. It does not become an IdP, a business-policy PDP, a payment protocol, an MCP implementation, or a proprietary delegation credential format.

## What is already proven

The current system has working implementations or hosted proofs for protocol-neutral `gate.verify()` and `gate.enforce()`, `VALID / ALLOW`, `INVALID / DENY`, fail-closed `UNKNOWN / DENY`, multi-hop delegated authority, upstream revocation, alternate-path preservation, federated issuer trust, MCP/HTTP/x402/AuthZEN/A2A/AP2 effect-boundary adapters, Verified Effect metering, independent SSF/CAEP interop, BYO SSF, hosted managed SSF, an Authority Source Registry, and multiple authority-source types in one project.

Stage 15 demonstrated the important network invariant:

> Revocation or failure of one independent authority path must not poison another valid independent path.

## Architecture invariants to freeze

1. `gate.verify()` remains protocol-neutral.
2. Business policy stays outside the GATE core.
3. `UNKNOWN` remains a real state and fails closed at consequential effect boundaries.
4. Independent alternate authority paths remain independent.
5. Hard authority expiry is distinct from source freshness.
6. GATE replica freshness is distinct from external issuer/source freshness.
7. GATE never claims knowledge of upstream issuer state it has not observed.
8. Source-event ordering and replay protections remain explicit.
9. Signing-key lifecycle matters in addition to signature validity.
10. A Verified Effect means GATE evaluated authority immediately before a concrete attempted effect; it does not claim the downstream effect ultimately completed.
11. Private source credentials and signing keys do not enter public telemetry.
12. Adapters translate effect boundaries; they do not redefine the authority model.

## Post-Stage-15 audit

### Core verification is stronger than the current product surface

The verifier, adapters, source ingestion and metering are already substantial. The weakest layer is now the developer experience around them.

The current public path still looks like a Developer Preview:

```text
discover GATE
 -> understand principal / actor / graph concepts
 -> choose a sandbox or live endpoint
 -> understand issuers
 -> create/configure authority state
 -> choose an adapter
 -> wire metering
 -> interpret verification responses
```

Network v1 must reduce this to:

```text
create project
 -> get API key
 -> choose effect surface
 -> connect an authority source
 -> install official adapter
 -> run one real protected effect
 -> see one Verified Effect in the console
```

### Repository and live infrastructure are not yet one source of truth

This is the most important engineering finding from the review.

The live Supabase project contains the canonical verifier, sandbox, billing, metrics, beta, source-freshness canaries, SSF services, Source Registry and signed-source service.

The adoption branch contains only part of that exact live surface. In particular:

- the exact live `gate-network` v7 function is not committed under `supabase/functions`;
- the exact live `gate-sandbox` function is not committed there;
- the exact live `gate-billing` and billing webhook functions are not committed there;
- the live `gate-metrics` v2 implementation is materially larger than the small source mirror currently committed;
- the repository contains only the recent metering/SSF/Stage-13-to-15 migrations, while the remote migration history includes the earlier project, billing, federation, snapshot, beta and source-freshness schema migrations.

**Release rule:** before product expansion, exact live production code and migration history must be reconciled into source control.

### Public GitHub truth is behind the actual product branch

The public repository default branch is still `main`, while Stages 11–15 and the adoption layer are on `feat/network-v1-adoption-layer`.

A new visitor therefore does not automatically land on the current product state.

**Release rule:** once Stage 16 reconciliation is green, the adoption branch must be reviewed and converged into `main`. After that, `main` becomes the product truth.

### CI is green, but the release gate is too narrow

Stage 15 CI is green on Node 20/22. Network v1 CI should additionally enforce package dry-run checks, migration/schema replay, public API contract tests, adapter conformance vectors, negative/fail-closed tests, source replay/order tests, dependency/security scanning and a controlled hosted smoke path for release candidates.

### Source Freshness RC1 is correct but not the current public v7 contract

The source-freshness work correctly separates authority lifetime, issuer/source freshness and GATE replica freshness. It also correctly preserves the W1/W2 information boundary: if an issuer changes state but GATE receives neither an event nor freshness evidence, GATE cannot truthfully know that change occurred.

The current public v7 verifier still measures canonical-primary snapshot freshness, not bounded external issuer freshness.

Network v1 must not silently rename current v7 behavior as external-source freshness.

Use explicit source evidence classes:

- **checkpoint-bounded** — signed freshness/checkpoint evidence can support a bounded issuer-freshness statement;
- **poll-observed** — GATE can prove the connector is polling successfully, but that is not automatically proof of no unseen upstream change;
- **event-observed** — GATE can prove a signed event was received and verified, but silence is not a freshness heartbeat.

`strict` must not imply synchronous upstream freshness unless the source contract can actually establish it.

### Receipt v2 is valuable, but portable signed receipts are not a precondition for usability

Keep a structured, source-aware receipt, bind selected paths to source provenance, preserve excluded paths for audit, and keep `issuerCurrentStateIncluded = false`.

Do not make a new portable GATE-signed proof format a prerequisite for first external adoption. Sign receipts later only when a concrete relying-party or interoperability requirement justifies portability.

### Runtime QA/canary surface needs classification

The live Supabase project hosts production-preview endpoints beside multiple QA runners, canaries and demo functions. Stage 16 must classify every function as production, preview, QA/canary or obsolete, then isolate or retire deliberately. Nothing should be deleted until its purpose and replacement are documented.

### Billing exists technically, but commercial adoption is not proven

Free / Pro / Scale entitlements, Stripe checkout routing, a billing portal and webhook infrastructure exist. The current live database has no production billing subscriptions.

Billing infrastructure is implemented; commercial adoption is not proven. Expose the existing path coherently during self-service productization rather than adding more billing mechanics now.

### Adoption is not yet demonstrated by current telemetry

The hosted environment currently contains only a small number of Verified Effect events, no paid subscriptions, and no beta applications. Existing projects are predominantly sandbox, QA and stage-validation projects.

The engineering thesis is much further validated than the market/adoption thesis.

### Frontend/deployment ownership must be normalized

The repository contains the adoption dashboard and quickstart, but the currently connected Vercel account cannot inspect the historical GATE deployments. Before Network v1, the customer-facing site/console must have one documented owner, one reproducible deployment path, one production project and a stable domain strategy.

## Standards review — 2026-10-11

### MCP

The current MCP specification is `2026-07-28`. Its stateless request/response core and `Mcp-Method` / `Mcp-Name` HTTP headers make gateways and interceptors natural effect boundaries. MCP now has formal Working Groups / SEPs, an active Interceptors Working Group, gateway work and authorization work.

**GATE consequence:** the MCP product should be an effect-boundary interceptor/gateway integration first, not a voluntary `gate_verify` tool. After implementation evidence exists, standardization should go through the relevant MCP working group / SEP process rather than a proprietary MCP extension.

### A2A

A2A v1 is the stable line, and Agent Card signatures use JWS plus RFC 8785 JCS canonicalization. Cross-SDK canonicalization defects have already appeared in the ecosystem.

The current GATE adapter documentation still targets the older 0.3-style JSON-RPC surface.

**GATE consequence:** do not advertise Network v1 A2A conformance until the adapter is updated to A2A v1 and tested with language-neutral Agent Card signing vectors across SDK implementations. Ambiguous signature interpretation must fail closed.

### AuthZEN

Authorization API 1.0 is a Final OpenID Specification and its working group is developing certification.

**GATE consequence:** keep the current composition model: AuthZEN answers policy; GATE answers live delegated authority. For combined AuthZEN/MCP enforcement, add operation-binding / TOCTOU tests so the operation authorized is the operation actually executed.

### Shared Signals / CAEP

OpenID SSF 1.0 and CAEP 1.0 are Final Specifications.

**GATE consequence:** Stages 11–15 are strategically aligned. SSF should move from demo/status proof toward a supported authority-source family.

### AP2 / FIDO

AP2 v0.2 focuses on Human-Not-Present flows, while FIDO has launched agentic-authentication standardization work drawing from AP2 and Verifiable Intent.

**GATE consequence:** keep consuming already-verified intent/mandate evidence. Do not implement a competing identity/intent credential or partial AP2 verifier.

### x402

x402 now has vendor-neutral Linux Foundation governance.

**GATE consequence:** maintain x402 as a high-volume effect-boundary surface, while keeping payment verification and live authority verification as separate facts.

## Product moat

The verifier algorithm alone is not the moat.

```text
authority sources GATE understands
        x
protocol/effect surfaces GATE can protect
        x
relying parties that accept GATE decisions/receipts
        x
real Verified Effects flowing through the network
```

The next stages must increase source connectivity, integration simplicity and real effect volume.

## Golden Path for Network v1

```text
1. Sign in / create GATE project
2. Receive a project API key
3. Choose Protect HTTP, Protect MCP, or SDK
4. Connect an authority source
   - hosted SSF/CAEP
   - signed authority feed
5. Copy the generated integration snippet
6. Run a real action through the effect boundary
7. See Authority VALID / Decision ALLOW / Verified Effect 1
8. Revoke upstream authority
9. Re-run the same real action
10. See DENY / effect blocked / audit evidence
```

The synthetic sandbox remains useful for education, but it must not be the primary proof of product usability.

## Final roadmap — exactly five convergence stages

### Stage 16 — Architecture Freeze & Reproducible Production

**Goal:** make repository, live infrastructure and public claims describe the same system.

Outputs:

- exact live Edge Function snapshot in source control for every production component;
- complete migration history needed to reproduce the live schema;
- deployment/config manifest with production vs preview vs QA/canary classification;
- explicit Network v1 freshness/evidence contract;
- stable public API surface and versioning decision;
- current SDK/MCP versions reflected in docs;
- current standards matrix;
- expanded CI for package/schema/contract/conformance checks;
- adoption branch reviewed and merged into `main`;
- customer-facing deployment ownership documented.

**Exit criterion:** a clean environment can reconstruct the Network v1 candidate from `main`, and an external reviewer can identify exactly what is production, preview and test-only.

### Stage 17 — Self-Service Golden Path

**Goal:** first real Verified Effect without help from the GATE team.

Outputs:

- customer console for project creation and API-key lifecycle;
- source onboarding for hosted SSF and signed authority feed;
- adapter selector with generated snippets;
- managed Network endpoint defaults in official SDKs;
- project-level source health and first-Verified-Effect confirmation;
- stable install path instead of requiring `@dev` for the supported beta lane;
- one canonical quickstart;
- time-to-first-Verified-Effect instrumentation.

**Exit criterion:** a developer unfamiliar with GATE can protect a real HTTP or MCP effect in less than 10 minutes without opening Supabase or requiring manual GATE-side intervention.

### Stage 18 — Production Operations & Commercial Beta

**Goal:** make a small external deployment operable and supportable.

Outputs:

- customer usage dashboard;
- Verified Effects, decisions, source health, audit and plan usage;
- integrated Free -> Pro/Scale checkout and billing status;
- production/QA environment separation;
- SLOs, incident runbook and external health monitoring;
- dedicated private vulnerability-reporting channel;
- threat model and release security checklist;
- key/source lifecycle operations;
- support boundary and retention policy.

**Exit criterion:** one external team can run GATE continuously with observable health, controlled credentials, supportable failure modes and a commercial path.

### Stage 19 — Conformance & Trust

**Goal:** make GATE auditable and interoperable rather than merely compatible in demos.

Outputs:

- source-aware structured Authority Receipt contract;
- source provenance on selected and excluded paths;
- A2A v1 adapter + cross-SDK Agent Card JWS/JCS vectors;
- MCP 2026-07-28 interceptor/gateway conformance;
- AuthZEN 1.0 operation-binding tests;
- x402 lifecycle compatibility suite;
- SSF/CAEP Final-spec vectors;
- public negative/fail-closed conformance corpus;
- external security/architecture review.

Portable signed GATE receipts remain conditional on an actual relying-party requirement.

**Exit criterion:** an independent implementation can reproduce the expected allow/deny/fail-closed behavior from published conformance vectors.

### Stage 20 — External Pilot -> GATE Network v1

**Goal:** prove GATE as infrastructure outside GATE-created test environments.

Minimum exit gates:

- at least 3 independent external projects complete onboarding;
- at least 2 effect surfaces are used on externally owned workloads, with HTTP and/or MCP first;
- at least 1 authority source is owned by an external organization rather than a GATE QA transmitter;
- sustained real Verified Effects are observed over multiple days;
- at least one real upstream authority-loss event blocks an effect as designed;
- at least one paying or contractually committed commercial pilot;
- production `main` is reproducible and release CI is green;
- stable supported SDK/adapter versions are published;
- security reporting and operational runbooks are active.

Only then tag **GATE Network v1.0**.

## Deliberately deferred pre-v1

Unless an external pilot creates the requirement, do not spend pre-v1 cycles on a proprietary delegation credential, a new identity system, a new business-policy engine, portable signed GATE receipts, many additional protocol adapters, multi-region marketing claims before real replicas exist, artificial network-density metrics based only on GATE-owned QA sources, or elaborate pricing optimization before real usage exists.

## Stage 16 priority order

1. Capture exact live truth — functions, complete migration history, deployment/config manifest.
2. Classify runtime surface — production / preview / QA / obsolete.
3. Reconcile public truth — docs, package versions, API endpoints, default branch.
4. Freeze source evidence semantics — checkpoint-bounded / poll-observed / event-observed.
5. Refresh adapters against current standards — especially MCP and A2A.
6. Expand release CI — package, schema, contracts, fail-closed and conformance.
7. Converge the reviewed product branch into `main`.
8. Begin self-service product work only after the system is reproducible.

## Network v1 release question

Every proposed feature from this point forward must answer:

> Does this materially help an external developer connect a real authority source, protect a real effect, trust the result, or produce more real Verified Effects?

If not, it is probably post-v1 work.
