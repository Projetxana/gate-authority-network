# GATE Network v1 — Source Evidence Contract

Status: Stage 16 architecture freeze

This contract defines what GATE may and may not claim about the freshness and
current state of an external authority source.

It exists to prevent a verifier from confusing:

- a fresh GATE graph;
- a recently observed source;
- and proof that an upstream issuer has not changed state.

These are different facts.

---

## 1. Core Principle

GATE answers:

> Does a valid delegation path from this principal to this actor exist under
> the authority evidence currently available to GATE?

GATE must never imply knowledge of an external issuer's present state unless
the source contract provides evidence that supports that claim.

Silence from a source is not evidence of continued authority.

---

## 2. Three Independent Clocks

Network v1 separates three freshness dimensions.

### 2.1 Authority lifetime

Examples:

- delegation `not_before`
- delegation `not_after`
- explicit revocation
- key lifecycle validity

A hard expiry is an authority-state failure.

It is not a freshness estimate.

### 2.2 Source evidence freshness

How recently GATE has defensible evidence about an external issuer.

This depends on the source contract described below.

### 2.3 GATE replica freshness

How recently the verifier's local or regional GATE state reflects the
canonical GATE state.

Replica freshness must never be presented as issuer freshness.

---

## 3. Source Evidence Classes

Network v1 recognizes three evidence classes.

---

### 3.1 checkpoint-bounded

A source can provide bounded issuer freshness when GATE receives a
cryptographically authenticated checkpoint or equivalent freshness artifact.

Typical evidence includes:

- issuer identity;
- monotonically ordered checkpoint sequence;
- accepted event sequence;
- issue timestamp;
- validity / lease window;
- cryptographic signature.

Example model:

    source
      checkpointSeq = 42
      acceptedSeq   = 42
      lease valid until T

If the checkpoint is authentic, current and all required events through the
checkpoint are present, GATE may describe source evidence as bounded within the
declared lease.

If:

    checkpointSeq > acceptedSeq

and the missing source events required to reach the checkpoint are unavailable,
the affected authority path must not be treated as fresh.

Possible state:

    STALE / UNKNOWN
    fail closed for that path

A different independent authority path may still remain valid.

This is the strongest Network v1 source-evidence class.

---

### 3.2 poll-observed

A managed connector may periodically query an upstream source.

A successful poll proves:

> GATE successfully queried this source at time T and observed response R.

It does NOT automatically prove:

> No upstream authority change exists after time T.

Unless the upstream protocol itself provides a cryptographically or
semantically authoritative bounded-state guarantee, poll success is observation
evidence only.

Allowed claims include:

- last poll time;
- last successful poll time;
- polling health;
- observed upstream response;
- ingestion delay.

Disallowed claim:

- "issuer state is definitely current now"

solely because the last poll succeeded.

---

### 3.3 event-observed

A push/event source may deliver authenticated authority events to GATE.

Examples:

- signed GATE authority feed;
- SSF / CAEP event delivery;
- other signed event streams.

A verified event proves:

> GATE received and authenticated this event.

It does NOT prove:

> No newer upstream event exists.

Silence after an event is not a heartbeat.

Therefore an event-driven source without an independent checkpoint, heartbeat
contract or bounded lease must not be advertised as providing bounded current
issuer freshness.

Allowed claims include:

- event authenticated;
- event received at T;
- event sequence observed;
- source issuer identified;
- authority graph updated from that event.

Disallowed claim:

- bounded current upstream state merely because no later event was received.

---

## 4. Ingestion Health Is Not Authority Freshness

The Authority Source Registry may report operational states such as:

- fresh
- aging
- stale
- observed
- error
- unknown
- paused
- revoked

These describe connector / ingestion health unless explicitly backed by a
checkpoint-bounded source contract.

Example:

    signed_push
    ingestionHealth = observed

means:

> GATE has recently observed an authenticated event.

It does not mean:

> The issuer guarantees that no newer authority change exists.

---

## 5. Consistency Modes

GATE consistency and source evidence are separate dimensions.

### bounded

A bounded GATE verification may use a replica subject to GATE's declared
replica-staleness limit.

This says nothing by itself about upstream issuer freshness.

A result may therefore have:

    GATE replica freshness: bounded
    source evidence: event-observed

These statements are not contradictory.

### strict

Strict verification means the authorization decision is evaluated against the
canonical GATE state according to the supported production semantics.

Strict does NOT automatically mean that GATE synchronously contacted every
external authority source.

Source evidence remains constrained by that source's evidence contract.

Therefore:

    strict GATE consistency
    !=
    synchronous upstream issuer confirmation

unless a future source adapter explicitly provides such a guarantee.

---

## 6. Fail-Closed Rule

If an authority path requires evidence that cannot satisfy its declared source
contract, GATE must not silently treat the path as current.

Examples:

- expired checkpoint lease;
- checkpoint sequence ahead of accepted sequence;
- unverifiable source signature;
- missing required event;
- source evidence outside permitted freshness;
- issuer key invalid or revoked.

The affected path becomes unusable for an ALLOW decision until sufficient
evidence exists.

Depending on the failure:

    authority = INVALID
or
    authority = UNKNOWN

and the decision must fail closed for that path.

---

## 7. Alternate-Path Preservation

Source failure is path-specific.

Example:

    Principal
       |
       +---- Source A ---- Actor
       |
       +---- Source B ---- Actor

If Source A is revoked, stale or unknown while Source B independently provides
a valid authority path, Source B may preserve ALLOW.

GATE must not globally invalidate the actor merely because one independent
authority path failed.

Conversely, when every valid path is revoked, expired, stale or otherwise
unusable:

    decision = DENY

---

## 8. Evidence Provenance

Network v1 should preserve enough provenance to distinguish:

- which authority path was selected;
- which source adapter supplied each relevant edge;
- which paths were excluded;
- why they were excluded;
- which evidence class applied;
- what GATE actually observed.

Provenance must not claim facts unavailable to GATE.

Structured provenance is evidence about GATE's decision process.

It is not automatically a cryptographic proof of the current external issuer
state.

Portable signed GATE authority receipts are not required for the Stage 16
production freeze.

They may be introduced later if external relying parties require them.

---

## 9. Source Registry Contract

Authority sources should identify at least:

    adapter
    sourceType
    externalIssuer
    deliveryMethod
    freshnessContract
    lastPollAt
    lastSuccessAt
    lastEventAt
    lastErrorAt

Where applicable, checkpoint-capable sources may additionally expose:

    checkpointSeq
    acceptedSeq
    checkpointIssuedAt
    checkpointNotAfter

Source-specific metadata must not be transformed into stronger semantic claims
than the source actually supports.

---

## 10. Network v1 Evidence Matrix

| Evidence class | Proves authenticated observation | Can prove bounded issuer freshness | Silence is freshness |
|---|---:|---:|---:|
| checkpoint-bounded | yes | yes, within contract | no |
| poll-observed | yes | not by polling alone | no |
| event-observed | yes | no | no |

---

## 11. Public Language

Acceptable:

> GATE received a signed authority revocation from the issuer.

> This source was successfully polled 12 seconds ago.

> Issuer freshness is bounded by a signed checkpoint valid until T.

> This authority path is stale; an independent valid path still exists.

Not acceptable without supporting evidence:

> The issuer definitely has no newer changes.

> Strict mode always checks the issuer live.

> No event means authority is still valid.

> GATE knows the external source is current because its own replica is current.

---

## 12. Network v1 Rule

Every ALLOW decision must be explainable without assuming information that GATE
did not observe.

When the external world can have changed without GATE having evidence of that
change, the result must preserve that epistemic boundary.

The implementation may improve how much authority evidence GATE can observe.

It must never improve certainty merely by changing wording.
