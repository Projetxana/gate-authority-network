# GATE — Product Positioning

## Canonical definition

**GATE is the live authority-state resolver for delegated agents across trust domains.**

Its core question is:

> Does a live delegation path from this principal to this actor still exist right now?

GATE is deliberately narrower than an identity platform, policy engine, credential issuer or gateway.

## Where GATE fits

```text
Identity / credentials / delegation / policy systems
(OAuth, IdPs, agent identity, authorization engines, issuer systems)
                         |
                         | authority state + trust signals
                         v
              +----------------------+
              |         GATE         |
              | live authority-state |
              |       resolver       |
              +----------------------+
                 |               |
          gate.verify()      gate.enforce()
                 |               |
                 +-------+-------+
                         v
                 trusted effect boundary
```

MCP is one integration surface for GATE. It is not the definition of GATE.

## What GATE owns

GATE's differentiation is the combination of:

- live authority-state resolution at effect time;
- multi-hop delegated authority;
- upstream revocation across trust boundaries;
- preservation of alternate valid paths;
- federated issuer trust/state;
- explicit freshness semantics (`bounded` / `strict`);
- explicit `VALID`, `INVALID` and `UNKNOWN` authority states;
- fail-closed enforcement semantics;
- a protocol-neutral `gate.verify()` integration surface.

**Multi-hop by itself is not the differentiation.** The product claim is the live resolution of delegated authority state across heterogeneous trust domains.

## What GATE does not own

GATE does not:

- authenticate a human or an agent;
- mint OAuth access tokens or proprietary delegation credentials;
- replace an IdP;
- replace a business-policy PDP;
- replace API, AI or MCP gateways;
- decide application-specific policy such as amount limits or resource entitlements;
- claim that every external identity or policy product is already integrated;
- currently issue a portable cryptographically signed authority proof.

The Developer Preview returns a live resolution result. A future signed GATE receipt may make that result portable, but that is not a current release claim.

## Composition model

```text
credential valid?     -> OAuth / identity system
business action OK?   -> PDP / AuthZEN / Cedar / OPA / equivalent
authority still live? -> GATE
enforce action        -> gateway / tool server / resource server
```

## Public language

Preferred:

> GATE resolves whether a live delegation path from a principal to an agent still exists at effect time — across trust domains.

Also acceptable:

> Is this agent still authorized to act right now?

Avoid:

- "GATE is authorization for MCP."
- "GATE replaces OAuth."
- "GATE is a policy engine."
- "GATE's moat is multi-hop."
- "GATE provides portable proof" until signed receipts actually exist.
