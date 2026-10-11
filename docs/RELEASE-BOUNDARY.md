# GATE Developer Preview — Source Freshness RC1 Boundary

## Public question

`gate.verify()` answers:

> Does a sufficiently fresh authority path from the principal to the actor still exist now under the requested consistency contract?

Results:

- `VALID / ALLOW` — at least one sufficiently fresh live path exists.
- `INVALID / DENY` — all known paths are revoked, invalid, or hard-expired.
- `UNKNOWN / DENY` — GATE cannot establish sufficiently fresh authority state.

## RC1 correctness boundary

The next preview must keep these independent:

- `replicaFreshness` — GATE's own copy;
- `sourceFreshness` — received and verified issuer evidence;
- `not_after` — hard authority lifetime;
- signing-key lifecycle — whether the signer was authorized at artifact issue time.

No field may imply knowledge of an issuer change that GATE did not observe.

## Receipt contract

The next preview uses `gate.authority-receipt.v2` as the structured decision receipt. It must state:

```text
issuerCurrentStateIncluded = false
```

The receipt includes source evidence from evaluated paths, selected-path provenance, replica freshness when relevant, sequence-continuity status, and hard-expiry enforcement.

Receipt v2 is not yet a portable GATE-signed proof format.

## Source sequence contract

Source events must be accepted contiguously. If `acceptedSeq=17` and event 19 arrives before event 18, event 19 is rejected. The source remains unresolved until continuity is restored.

## Key lifecycle contract

- standby key -> reject;
- pre-activation artifact -> reject, even after later activation;
- active key in-window -> accept;
- graceful retirement -> preserve historical in-window artifacts;
- post-retirement artifact -> reject;
- emergency-revoked key -> reject immediately.

## Current v7 boundary

The public v7 network remains unchanged during RC1 work. Its `strict` mode is still a canonical GATE primary read and does not synchronously prove external issuer freshness.

## Promotion gates

Before promoting RC1 semantics to the public network:

- local full repository CI must be green;
- hosted migration must be versioned rather than mutating v7 snapshot semantics in place;
- signed issuer checkpoints/events must be validated in hosted canary;
- sequence gaps, replay, reorder, channel loss, hard expiry, alternate paths and signing-key lifecycle must be reproducible;
- SDK types and receipt v2 must match the hosted response;
- docs must preserve the W1/W2 information boundary;
- at least one external reviewer should be invited to find an unjustified `ALLOW`.

## Product boundary

GATE remains a live authority-state resolver, not an IdP, credential issuer, business-policy PDP, API gateway, payment consent manager, or portable proof format.
