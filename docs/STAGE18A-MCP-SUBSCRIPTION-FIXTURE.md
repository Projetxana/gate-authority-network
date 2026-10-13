# Stage 18A — Provider-neutral MCP subscription authority fixture

Status: reproducible

## Purpose

This fixture tests the effect-boundary behavior discussed in
modelcontextprotocol/transports-wg#62 without making GATE, or any other
authority provider, an MCP protocol dependency.

It runs against the external Authorization Lifetime prototype pinned at:

`429e72bcdf02a6a3da76ab6f580e8986449553ab`

Repository:

`RamjotSingh/typescript-sdk`

## Case A — Fresh upstream revocation with unchanged token

A protected subscription is established while authority is allowed.

The bearer token remains unchanged and remains within its declared lifetime.

An upstream authority signal changes the effective authorization decision
to DENY.

Observed invariant:

`effective DENY -> zero subsequent protected notifications`

The fixture records signal receipt, effective DENY, last protected
notification and stream termination.

Artificial millisecond intervals produced by the deterministic fake clock
are test sequencing evidence, not GATE network latency measurements.

## Case B — Authority source unavailable

The fixture models a previously established authority decision with an
explicit freshness deadline shorter than the access-token lifetime.

While the cached authority decision remains within the freshness window,
protected delivery may continue.

At the freshness boundary, the stream fails closed and no later protected
notification is emitted.

The upstream prototype currently represents this policy-cap deadline using
the `token_expiry` end reason. The fixture records that vocabulary but does
not claim that the bearer token itself expired.

## Case C — Expiry-only control

Token expiration is tested independently from upstream authority revocation
and source availability.

After token expiry, the stream ends with the prototype's `token_expiry`
reason and emits no later protected notification.

## Reproduction

Run:

`npm run smoke:mcp:subscription-authority`

The runner:

1. clones the external MCP SDK prototype;
2. checks out the exact pinned commit;
3. installs from its frozen lockfile;
4. builds the upstream workspace;
5. injects the provider-neutral fixture;
6. executes only the Stage 18A fixture.

## Observed result

Initial reproducible run:

- 3/3 Stage 18A fixture tests passed;
- fresh upstream revocation: zero protected notifications after DENY;
- authority-source unavailable: zero protected notifications after freshness expiry;
- expiry-only control: zero protected notifications after token expiry.

## Evidence boundary

This artifact demonstrates that the pinned external MCP prototype can enforce
the provider-neutral authority contract being discussed.

It does not yet demonstrate:

- a live GATE Network decision driving the MCP prototype;
- MCP adoption or endorsement of GATE;
- MCP conformance certification;
- production GATE network latency;
- token revocation caused by an upstream authority event;
- lossless or gap-free subscription resumption.

A GATE-backed implementation is the next validation step.
