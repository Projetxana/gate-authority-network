# Stage 17D — External problem validation

Status: validated on 2026-10-12

## Objective

Stage 17D tests whether the problem addressed by GATE is independently
recognized outside the GATE project.

The target is not general interest in agent security. The relevant question is
whether technically credible external work independently identifies the need to
re-evaluate changing delegated authority at or near the final effect boundary,
including revocation after credential issuance and multi-hop or cross-domain
delegation.

The Stage 17 public-validation plan defines the success signal as 3–5
technically credible external confirmations.

## Classification

Evidence is classified as:

- CONFIRMATION — independently recognizes a material part of the live
  authority-state problem at the effect boundary.
- PARTIAL — recognizes an adjacent requirement or leaves the exact
  cross-domain/transitive ownership boundary unresolved.
- COUNTEREXAMPLE — identifies a mature deployed mechanism that already solves
  the GATE problem as defined.
- NO EVIDENCE — does not materially support or falsify the hypothesis.

A project need not mention GATE to count. In fact, evidence that predates GATE
outreach is stronger for problem validation.

## Evidence register

### 1. MCP Transports WG #62 — CONFIRMATION

Thread:

https://github.com/modelcontextprotocol/transports-wg/issues/62

The issue identifies a gap where a long-lived MCP subscription can continue
after its authorization expires or is revoked.

An external participant explicitly describes this as a real authorization
boundary gap and separates expiry from early revocation. Expiry can be enforced
from a known deadline, while early revocation requires a fresh revocation
signal such as introspection, a backchannel, or local policy.

This independently supports the GATE premise that local token validity alone
does not establish current authority after issuance.

GATE follow-up:

https://github.com/modelcontextprotocol/transports-wg/issues/62#issuecomment-6137189023

The remaining open question is ownership of fresh transitive authority state
when the revocation originates upstream in another trust domain.

Classification: CONFIRMATION.

### 2. A2A #1937 — CONFIRMATION

Thread:

https://github.com/a2aproject/A2A/issues/1937

The proposed delegated-authority profile requires final authorization
immediately before effect. It explicitly says that initial validation must not
be treated as permanently valid for later effects.

Its conformance vectors include:

- revoked or status-invalid authority -> deny;
- required revalidation stale or unavailable -> deny;
- multiple effects in one task -> each effect receives its own current
  temporal/status authorization check.

Independent HandoffProbe evidence exercised these boundaries. In the
multi-effect case, the first effect executed while authority was current and a
second protected effect was rejected after authority became non-current.

This is implementation evidence for the effect-time authority boundary. It is
not an A2A conformance claim or accepted A2A specification text.

GATE follow-up:

https://github.com/a2aproject/A2A/issues/1937#issuecomment-6137212465

The remaining open question is which component owns live transitive
cross-domain revalidation and alternate-path resolution.

Classification: CONFIRMATION.

### 3. IETF WIMSE AIMS #86 — CONFIRMATION

Thread:

https://github.com/ietf-wg-wimse/draft-ietf-wimse-aims/issues/86

The issue identifies the full A -> B -> C delegation chain across domains as a
security area that is not yet formally addressed by the draft.

Independent discussion in the same thread states that when an authorization
decision depends on revocation or another status that can change after token
issuance, validating token signature and expiry does not by itself evaluate
that status.

The proposed guidance also distinguishes fresh usable status from unavailable
or too-old status and preserves the source and as-of time of the evidence.

This independently supports both the multi-hop/cross-domain problem and the
distinction between credential validity and current authority state.

GATE follow-up:

https://github.com/ietf-wg-wimse/draft-ietf-wimse-aims/issues/86#issuecomment-6137224917

The remaining question is whether live transitive resolution belongs to
deployment architecture, companion work, or an existing WIMSE/OAuth
component.

Classification: CONFIRMATION.

### 4. OpenID AuthZEN #663 — PARTIAL

Thread:

https://github.com/openid/authzen/issues/663

The discussion distinguishes approval revocation from approval expiry and also
describes cases where a PDP cannot verify an approval because a status source
is unreachable.

This supports re-evaluation, explicit revoked versus unverifiable state, and
fail-safe handling of unavailable current-state inputs.

The thread does not yet establish who owns transitive cross-domain delegation
state or alternate-path resolution.

GATE follow-up:

https://github.com/openid/authzen/issues/663#issuecomment-6137164507

Classification: PARTIAL.

### 5. QAuth #718 — PARTIAL

Thread:

https://github.com/qauth-labs/qauth/issues/718

QAuth's Authority Tree work explicitly includes delegation-tree state,
narrowing, revocation by sid/jti, cascading termination, and effect-side
authorization machinery.

The issue also explicitly places cross-domain trees out of scope.

That boundary is relevant to GATE because it demonstrates a concrete
delegation/revocation implementation whose current scope stops before the
cross-domain resolution problem.

GATE follow-up:

https://github.com/qauth-labs/qauth/issues/718#issuecomment-6137114477

Classification: PARTIAL.

## Additional corroboration

IETF WIMSE AIMS #125 contains implementation-oriented discussion that revoking
an agent credential also needs to terminate or invalidate credentials exchanged
downstream; otherwise delegated sub-agents may continue operating.

The discussion suggests SSF as a possible mechanism for signaling status
changes, while still leaving the receiver-side state and resolution model as a
separate architectural concern.

This is corroborating evidence and is not counted as a separate independent
ecosystem from WIMSE #86.

## Stage 17D conclusion

Stage 17D meets the public-validation success criterion.

Three independent ecosystems provide direct confirmation of material parts of
the hypothesis:

- MCP: early revocation requires fresh authority/revocation input beyond token
  expiry.
- A2A: authority must be revalidated at the final effect boundary and stale or
  unavailable required status fails closed.
- WIMSE: multi-hop cross-domain delegation remains an explicit security
  problem, and signature plus expiry do not evaluate changing revocation
  state.

AuthZEN and QAuth provide additional partial corroboration.

The reviewed evidence does not establish that a mature, broadly deployed,
protocol-neutral component already combines all of the following:

- cross-domain delegated-authority state;
- transitive/upstream revocation;
- alternate valid path preservation;
- explicit bounded or strict freshness semantics;
- effect-time resolution;
- integration without requiring one proprietary authority credential format.

This is a bounded conclusion from the reviewed evidence, not a claim that no
such system exists anywhere.

## Continuing falsification

The five GATE follow-up questions remain open.

New replies must continue to be evaluated as CONFIRMATION, PARTIAL,
COUNTEREXAMPLE, or NO EVIDENCE. A credible counterexample that satisfies the
full GATE problem definition should trigger re-evaluation of positioning even
after Stage 17D is closed.

Stage 17D closure therefore does not end external validation; it records that
the minimum evidence threshold for continuing investment has been reached.
