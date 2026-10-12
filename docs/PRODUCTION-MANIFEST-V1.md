# GATE Network v1 — Production Manifest

Status: Stage 16 architecture freeze
Branch: feat/network-v1-adoption-layer
Supabase project: ufqtoyakmrddqytrkcje

This document defines the runtime boundary for GATE Network v1.

The purpose is to distinguish customer-facing production components from
preview/demo surfaces and internal QA/canary infrastructure.

No QA or preview function should be treated as a production dependency unless
it is explicitly promoted through a reviewed change to this manifest.

---

## 1. Production / Product Truth

These functions are part of the current GATE product backend.

### gate-network
Canonical GATE authority verification service.

Responsibilities:
- project registration and API access
- issuer registration
- authority event ingestion
- live authority graph
- authority verification
- fail-closed decision semantics
- bounded / strict consistency behavior

This is the canonical verification plane.

### gate-metrics
Verified Effect and usage metering service.

Responsibilities:
- usage events
- Verified Effect events
- project summaries
- privacy-minimized metering

### gate-billing
Customer billing/control-plane API.

Responsibilities:
- plan status
- checkout
- billing portal

### gate-billing-webhook
Billing provider event ingestion.

Responsibilities:
- subscription lifecycle synchronization
- plan entitlement updates

### gate-ssf-connectors
Managed enterprise SSF connector service.

Responsibilities:
- hosted SSF transmitter connections
- stream discovery / polling
- verified SET processing
- delivery into canonical GATE authority events

### gate-source-registry
Authority Source Registry.

Responsibilities:
- authority-source inventory
- adapter identity
- ingestion health
- source metadata
- freshness-contract classification

### gate-signed-sources
GATE signed authority-feed connector.

Responsibilities:
- external issuer registration
- ES256 event verification
- replay protection
- canonical GATE event forwarding
- privacy-minimized receipts

---

## 2. Public Preview / Onboarding

These surfaces are customer-visible or useful for onboarding, but are not part
of the canonical production verification plane.

### gate-sandbox
Public developer sandbox.

Purpose:
- low-friction GATE evaluation
- temporary sandbox projects
- synthetic authority examples

It must not be confused with production authority federation.

### gate-beta
External beta application / onboarding surface.

### gate-demo-mirror
Public demo support service.

### gate-network-rc1-preview
Network RC1 preview implementation.

This is not the canonical production verifier.

### gate-rc1-demo
RC1 public demonstration surface.

### gate-ssf-bridge-preview
Hosted SSF/CAEP preview bridge.

This remains preview until superseded by the managed SSF connector golden path.

---

## 3. Internal QA / Canary

These functions exist to validate behavior and must not be presented as
customer-facing product APIs.

- gate-live-qa-runner
- gate-billing-qa-check
- gate-billing-qa-webhook
- gate-network-provenance-canary
- gate-network-source-freshness-canary
- gate-source-issuer-canary
- gate-network-source-freshness-canary-v3
- gate-source-freshness-qa-runner
- gate-source-freshness-qa-expiry
- gate-source-issuer-canary-v4
- gate-network-source-freshness-canary-v4
- gate-source-freshness-qa-v4-sequence
- gate-source-freshness-qa-v4-rotation
- gate-network-source-freshness-canary-v5
- gate-source-freshness-qa-v5-activation
- gate-source-freshness-qa-v5-retirement
- gate-rc1-preview-smoke

QA/canary services may remain deployed during Stage 16.

They must not be deleted until their dependencies, schedules and tests have
been inventoried.

---

## 4. Runtime Classification

Current deployed function count:

- Production / Product Truth: 7
- Public Preview / Onboarding: 6
- Internal QA / Canary: 17
- Total: 30

There are currently no functions classified as safe-to-delete solely from this
manifest.

Retirement requires a separate dependency review.

---

## 5. Database History

The canonical database history for Network v1 is the migration history applied
to the live Supabase project.

Stage 16 reconciled that history into:

    supabase/migrations/

The repository must preserve the live migration identities and ordering rather
than maintaining separately reconstructed or squashed equivalents.

---

## 6. Production Rule

A component is considered part of GATE Network v1 production only when:

1. its source is versioned in the repository;
2. its database dependencies are represented by canonical migrations;
3. its runtime role is documented here;
4. its failure behavior is defined;
5. its release path is reproducible;
6. its public documentation does not overstate its guarantees.

---

## 7. Network v1 Boundary

Canonical product flow:

    authority source
          |
          v
    source connector
          |
          v
      gate-network
          |
          v
      gate.verify()
          |
          v
    consequential effect
          |
          v
    Verified Effect

GATE's product boundary is authority verification immediately before effect.

Identity systems, business-policy engines, transport protocols and payment
systems remain external concerns unless explicitly integrated through an
adapter.

---

## 8. Stage 16 Freeze Policy

During Stage 16:

- do not modify canonical gate-network decision semantics merely to simplify
  documentation;
- do not delete QA/canary infrastructure before dependency analysis;
- do not promote preview services by renaming them;
- do not claim source freshness stronger than the source contract supports;
- do not introduce new protocol adapters unless required for reproducibility;
- prioritize repository/live parity and external usability.

The next architecture artifact is SOURCE-EVIDENCE-CONTRACT-V1.md.
