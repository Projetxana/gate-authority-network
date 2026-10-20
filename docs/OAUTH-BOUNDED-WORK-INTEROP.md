# OAuth Bounded Work ↔ GATE interoperability

Status: implementation-boundary probe, 2026-10-18

## Why this matters

`draft-liu-mcguinness-oauth-bounded-work-00` defines three distinct objects:

1. a bounded work proposal;
2. a governing authorization with current lifecycle state;
3. approval evidence that records what was approved.

The draft makes a distinction that is directly relevant to GATE:

> approval evidence records why authority existed; it does not establish that
> the authority is still active now.

It also requires independently approved work performed by the same agent to
remain independent when one governing authorization ends.

GATE already resolves live authority state and preserves alternate independent
paths, but the current public `gate.verify()` contract identifies only
`principal`, `actor`, and optional action context. It does not currently let a
caller select the governing authorization / bounded-work instance whose
authority must be live.

That creates an interoperability gap when two independent pieces of work share
the same principal, actor, resource and action.

This document and the companion live probe exist to prove that gap before any
new core API is introduced.

## Current GATE contract

Today:

```js
await gate.verify({
  principal,
  actor,
  action,
  consistency: "bounded"
});
```

The graph resolver asks whether **any live path** exists from `principal` to
`actor`.

That is correct for the current GATE contract.

It is not sufficient to implement OAuth Bounded Work isolation when two
governing authorizations share the same actor/effect boundary.

## Collision scenario

```text
Alice
  ├── Work A ──> Agent X ──> resource R / action Y
  └── Work B ──> Agent X ──> resource R / action Y
```

Initial state:

```text
Work A = ACTIVE
Work B = ACTIVE
```

Then:

```text
Work A = ENDED / REVOKED
Work B = ACTIVE
```

A generic principal → actor resolver correctly finds a live path through Work B.

But an effect that is being performed **under Work A** must not be rescued by
the unrelated Work B authorization.

Therefore a Bounded Work integration needs a stable context selector.

## Proposed protocol-neutral GATE binding

Do not make OAuth Bounded Work part of GATE's core vocabulary.

Introduce an optional protocol-neutral authority context:

```js
authorityContext: {
  kind: "oauth-bounded-work",
  id: "<governing-authorization-id>"
}
```

Other integrations may later use their own `kind`, while preserving the same
GATE semantic.

## Required semantics

When `authorityContext` is present:

1. a path belonging only to a different context MUST NOT satisfy the request;
2. unrelated active work MUST NOT rescue an ended requested work;
3. context-bound evidence must be freshness checked like every other authority input;
4. `INVALID` and `UNKNOWN` remain distinct;
5. an independent path may preserve ALLOW only when it independently authorizes
   the **same requested authority context**;
6. action/resource bounds remain application/PDP/Resource-Server policy.

When `authorityContext` is absent, legacy unscoped GATE behavior must remain
backward compatible.

## Live collision probe

Run:

```bash
npm run smoke:oauth:bounded-work-collision
```

The probe creates a disposable Free GATE project, registers one local ES256
issuer, and creates two independent authority edges between the same principal
and actor.

It then revokes one edge while leaving the other active.

Expected observation on the current public API:

```text
before: ALLOW
after revoking Work A while Work B remains active: ALLOW
```

This is **not** labeled a vulnerability in the current contract.

It is evidence that the current API has no way to ask:

> Is Work A's governing authorization still live?

The next implementation step is to add the context binding only after this
probe is reproduced.

## Source

OAuth 2.0 Bounded Work Authorization:

https://datatracker.ietf.org/doc/draft-liu-mcguinness-oauth-bounded-work/
