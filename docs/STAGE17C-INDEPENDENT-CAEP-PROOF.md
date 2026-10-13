# Stage 17C — Independent authority-source proof

Status: validated on 2026-10-12

## Result

GATE was validated against an authority event originating outside GATE from the independent SSF/CAEP transmitter at `https://ssf.caep.dev`.

Observed chain:

`caep.dev -> signed CAEP SET -> external JWKS verification -> GATE connector -> canonical GATE network -> decision change`

The canonical GATE decision changed:

`VALID / ALLOW -> INVALID / DENY`

Final denial reason:

`all_authority_paths_revoked_or_invalid`

## Independent-source evidence

- Transmitter: `https://ssf.caep.dev`
- SSF spec reported by source: `1_0-ID2`
- Delivery: `urn:ietf:rfc:8936` POLL
- External SET signing algorithm: `RS256`
- External signing keys retrieved from the caep.dev JWKS endpoint
- Event type: CAEP `session-revoked`
- Event JTI: `YzZlMDQ0ZjItZWY3ZS00NzQ5LTg1NjItZWYzY2FkYTcxZDZj`
- Source subject was present in the received SET
- Connector mapping basis: `source-subject`
- No GATE API key was printed by the validation script

## Causality evidence

The validation script first established a real ACTIVE GATE authority edge and confirmed `VALID / ALLOW`.

After the script reported `ready: true`, a `Session Revoked` event was sent from the caep.dev Transmitter UI for `stage17c@gate.network`.

The caep.dev Transmitter log displayed that event at `10/12/26, 10:36 PM`.

The running GATE receiver then consumed and cryptographically verified the external SET and changed the canonical GATE result to `INVALID / DENY`.

This establishes that the revocation signal originated outside GATE and caused a live authority-state transition inside GATE.

## Operational boundary

This proof establishes independent signed-event interoperability and live revocation propagation.

It does not establish a production SLA, continuous upstream freshness, or multi-region issuer-state guarantees. Under the GATE Source Evidence Contract, this remains event-observed evidence unless a stronger source freshness contract is available.
