# GATE Integration Model

GATE is designed to compose with existing identity, authorization and gateway infrastructure.

## Four separate questions

A production agent action can involve four different questions:

1. **Who is this?** — authentication / identity.
2. **What credential or delegation was issued?** — OAuth, warrants, grants or equivalent.
3. **Is the requested business action permitted?** — policy/PDP.
4. **Is the delegated authority behind this actor still live right now?** — GATE.

GATE focuses on question 4.

## Effect-time flow

```text
Agent requests an effect
        |
        v
Existing identity / policy checks
        |
        v
gate.verify({
  principal,
  actor,
  action,
  consistency
})
        |
        +--> VALID   / ALLOW
        +--> INVALID / DENY
        +--> UNKNOWN / DENY
        |
        v
Trusted effect boundary
```

## External authority state

The long-term network value is not a proprietary token. It is the ability to resolve fresh authority state across heterogeneous issuers and trust domains.

The Developer Preview already demonstrates:

- live path evaluation;
- alternate paths;
- upstream revocation;
- bounded/strict consistency contracts;
- fail-closed behavior.

External issuer adapters are an integration layer and should be added without changing the core `gate.verify()` contract.
