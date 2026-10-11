# GATE Verified Effect Metering Contract v1

Status: Draft for Network v1

## Objective

Define the smallest privacy-conscious event that can support usage analytics, quotas, and eventually micro-priced managed authority verification.

A **Verified Effect** is counted when the managed GATE Network evaluates an authority verification request intended to guard a concrete effect boundary.

It is a network usage unit, not a claim that the downstream effect ultimately completed.

## Recommended event

```json
{
  "event": "gate.verified_effect",
  "verificationId": "gv_...",
  "projectId": "proj_...",
  "occurredAt": "2026-10-11T00:00:00Z",
  "protocol": "mcp",
  "operation": "tools/call:send_email",
  "authority": "VALID",
  "decision": "ALLOW",
  "receiptVersion": "gate.authority-receipt.v2",
  "consistency": "strict",
  "servedBy": "gate-network",
  "region": "ca-central-1"
}
```

## Do not meter by payload size

The commercial primitive is the authority decision, not token count, graph depth, or request-body size.

This keeps pricing understandable and aligns GATE with machine-scale event volume.

## Privacy defaults

Metering SHOULD NOT persist by default:
- action parameters;
- message content;
- prompts;
- payment details;
- credentials;
- access tokens;
- raw issuer artifacts;
- arbitrary resource payloads.

Use opaque project and verification identifiers where possible.

## Idempotency

Before commercial billing, every managed verification should receive a stable `verificationId`.

Retries caused by GATE/network transport SHOULD be deduplicated when they represent the same verification attempt.

A later stage may add an explicit client-provided idempotency/effect key. That must be introduced without breaking the existing `gate.verify()` call.

## Dashboard North Star

The first usage dashboard should lead with:

`Verified Effects today`

Secondary:
- ALLOW
- INVALID / DENY
- UNKNOWN / DENY
- p50 / p95 latency
- protocol mix
- authority-source freshness coverage

## Commercial principle

The free/open layer makes integration easy.
The managed network charges for live cross-domain authority verification, evidence, reliability, and scale.

Pricing is intentionally not frozen in this contract. The unit is frozen first.
