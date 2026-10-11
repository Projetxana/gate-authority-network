# GATE Authority Receipt v2

Status: RC1 contract.

Receipt v2 separates graph evidence, source evidence, and replica evidence. It is a structured decision receipt; it is not yet a portable GATE-signed proof format.

## Example — ALLOW with one stale alternate path

```json
{
  "version": "gate.authority-receipt.v2",
  "authority": "VALID",
  "decision": "ALLOW",
  "selectedPath": ["user:123", "agent:B", "agent:C"],
  "selectedEdges": ["edge-root-b", "edge-b-c"],
  "validPathCount": 1,
  "evaluatedPathCount": 2,
  "freshness": {
    "gateReplica": {
      "scope": "gate-replica",
      "ageMs": 18,
      "leaseRemainingMs": 812,
      "maxStalenessMs": 250,
      "fresh": true
    },
    "sources": [
      {
        "source": "issuer-a",
        "checkpointSeq": 42,
        "acceptedSeq": 41,
        "method": "signed-checkpoint",
        "state": "STALE",
        "reason": "event_sequence_gap"
      },
      {
        "source": "issuer-b",
        "checkpointSeq": 77,
        "acceptedSeq": 77,
        "method": "signed-checkpoint",
        "state": "FRESH",
        "reason": null
      }
    ]
  },
  "evidence": {
    "issuerCurrentStateIncluded": false,
    "signedSourceEvidence": true,
    "sequenceContinuityVerified": true,
    "hardExpiryEnforced": true
  }
}
```

Receipt v2 includes source evidence from evaluated candidate paths, including a stale path that was excluded from the final ALLOW. This makes alternate-path preservation auditable instead of hiding the stale branch.

## Example — fail closed

```json
{
  "version": "gate.authority-receipt.v2",
  "authority": "UNKNOWN",
  "decision": "DENY",
  "reason": "no_active_path_and_authority_state_unknown",
  "freshness": {
    "gateReplica": null,
    "sources": [
      {
        "source": "issuer-b",
        "checkpointSeq": 18,
        "acceptedSeq": 17,
        "state": "STALE",
        "reason": "event_sequence_gap"
      }
    ]
  },
  "evidence": {
    "issuerCurrentStateIncluded": false,
    "signedSourceEvidence": true,
    "sequenceContinuityVerified": true,
    "hardExpiryEnforced": true
  }
}
```

## Semantics

- `issuerCurrentStateIncluded: false` is mandatory. GATE reports only issuer evidence it received and verified.
- `signedSourceEvidence` says whether every source item in the receipt came from a signed source method. It does not mean GATE knows unseen issuer state.
- `sequenceContinuityVerified` says the serving lane enforces contiguous source-event acceptance.
- `gateReplica` is present for bounded edge decisions and is separate from source freshness.
- `hardExpiryEnforced` means edge `not_after` is evaluated independently of freshness.
