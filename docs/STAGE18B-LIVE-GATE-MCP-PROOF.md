# Stage 18B — Live GATE → MCP subscription authority proof

Status: validated on 2026-10-13

## Result

A pinned external MCP subscription-lifetime prototype was connected to the
public GATE Network.

Observed sequence:

MCP protected subscription
→ live GATE verification
→ VALID / ALLOW
→ protected notification delivered
→ signed upstream authority revocation ingested by GATE
→ live GATE verification
→ INVALID / DENY
→ MCP authorization ended
→ zero protected notifications after DENY

## External implementation

Repository:

RamjotSingh/typescript-sdk

Pinned commit:

429e72bcdf02a6a3da76ab6f580e8986449553ab

The external prototype was used without modifying its authorization-lifetime
implementation. The GATE fixture supplied the asynchronous authority decision
through the prototype's provider-neutral authorize callback.

## Live GATE evidence

The test used:

- a disposable public GATE project;
- a locally generated ES256 issuer key;
- a signed ACTIVE authority event;
- live gate.verify() calls against the hosted GATE Network;
- a signed REVOKED authority event;
- a subsequent live gate.verify() decision.

Observed before revocation:

VALID / ALLOW

Observed after revocation:

INVALID / DENY

Reason:

all_authority_paths_revoked_or_invalid

The MCP access token remained unchanged and cryptographically live throughout
the authority-state transition.

Protected notifications after effective DENY:

0

MCP stream termination reason:

revoked

## Timing observation

The observed interval from sending the signed revocation event to the effective
DENY in this single test run was 379 ms.

This is an observed end-to-end test interval only.

It is not a production latency commitment, benchmark, percentile, or SLA.

## Security and privacy

The disposable GATE API key was not printed.

The test withdrew issuer trust during cleanup.

No new hosted GATE function or service was introduced for this proof.

## Evidence boundary

This proves that the pinned external MCP prototype can consume live authority
decisions from GATE and stop protected subscription delivery after GATE changes
from ALLOW to DENY.

It does not establish:

- MCP conformance;
- MCP adoption or endorsement of GATE;
- independent developer adoption;
- an independent third-party production integration;
- a latency SLA;
- lossless or gap-free stream semantics;
- commercial validation.

Stage 18 independent adoption and first-revenue criteria remain open.
