# GATE Effect Boundary Contract v1

Status: Draft for Network v1 adoption layer

## Purpose

This contract defines the stable integration point for GATE:

> Call `gate.verify()` immediately before a consequential effect.

The application retains business-policy responsibility. GATE answers whether the actor still has live delegated authority from the principal under the requested consistency contract.

## Canonical call

```js
const decision = await gate.verify({
  principal: 'user:alice',
  actor: 'agent:procurement@company-c',
  action: {
    protocol: 'mcp',
    name: 'purchase_order_create',
    resource: 'purchase-order:1234',
    parameters: {
      amount: 2400,
      currency: 'USD'
    }
  },
  consistency: 'strict'
});

if (decision.decision !== 'ALLOW') {
  throw new Error(decision.reason ?? 'authority_denied');
}

await createPurchaseOrder();
```

For cooperative enforcement, the SDK already exposes:

```js
await gate.enforce(request, async decision => {
  return performEffect(decision);
});
```

## Required semantics

### principal
The authority origin whose delegation is being relied upon.

Examples:
- `user:alice`
- `org:acme`
- `service:billing`

### actor
The agent, service, delegated principal, or execution identity attempting the effect.

Examples:
- `agent:procurement@company-c`
- `service:invoice-bot`

### action.protocol
The integration surface on which the effect occurs.

Initial vocabulary:
- `mcp`
- `http`
- `x402`
- `authzen`
- `a2a`
- `ap2`
- `oauth`
- `internal`

The protocol value is descriptive and interoperable. It does not change the fundamental authority question.

### action.name
A stable operation name at the effect boundary.

Examples:
- `tools/call:send_email`
- `purchase_order_create`
- `payment_settle`
- `customer_delete`

### action.resource
The concrete resource or target of the effect when available.

### action.parameters
Minimal effect context needed for audit, protocol mapping, or future constrained-authority evaluation.

Applications SHOULD avoid placing secrets or unnecessary personal data in this object.

## Decision contract

GATE returns:

- `VALID / ALLOW`: at least one sufficiently fresh live authority path exists.
- `INVALID / DENY`: known authority paths are revoked or invalid.
- `UNKNOWN / DENY`: GATE cannot establish sufficiently fresh authority for the requested contract.

`UNKNOWN` is not converted to ALLOW by adapters.

## Receipt contract

Managed Network v1 should return `gate.authority-receipt.v2` or its compatible successor with:
- principal;
- actor;
- decision;
- selected authority path when available;
- evaluated-path counts;
- GATE replica freshness;
- issuer/source freshness evidence;
- hard-expiry enforcement evidence.

A receipt proves what evidence GATE used for the decision. It must not claim issuer state that GATE did not receive.

## Placement rule

The check belongs at a **non-bypassable effect boundary**.

Good placements:
- inside an MCP tool server immediately before the tool implementation;
- API gateway / resource server before mutation;
- payment facilitator before settlement;
- job consumer before irreversible processing;
- A2A task executor before side effects.

Weak placement:
- user interface only;
- prompt instruction;
- agent self-check that can be skipped;
- logging after the effect.

## Adapter invariant

Every official adapter MUST reduce to the same semantic operation:

```text
protocol-specific request
        |
        v
normalize principal / actor / action
        |
        v
gate.verify()
        |
        +---- ALLOW ---> execute effect
        |
        +---- DENY ----> block effect
        |
        +---- UNKNOWN -> block effect
```

No adapter may silently weaken GATE's fail-closed semantics.

## Compatibility rule

Network v1 must preserve the existing public SDK call shape. Protocol adapters map into the existing `principal`, `actor`, `action`, `consistency`, and `maxStalenessMs` fields rather than creating independent authorization models.

This allows the same application to move from sandbox to managed GATE Network without rewriting its effect integration.
