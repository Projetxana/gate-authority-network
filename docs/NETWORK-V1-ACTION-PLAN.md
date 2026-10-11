# GATE Network v1 — Action Plan

Status: Stage 1 started
Base: Source Freshness RC1 (`00f426c`)
North Star: **Verified Effects / day**

## Product thesis

GATE is not a replacement for OAuth, FIDO, AuthZEN, MCP, A2A, AP2, x402, or a business-policy PDP.

GATE is the protocol-neutral authority verification layer placed immediately before a consequential effect:

`agent -> protocol/tool/API -> gate.verify() -> effect`

The product goal is to make `gate.verify()` a routine infrastructure call before consequential agent actions.

## Economic unit

The network unit is a **Verified Effect**: one authority verification performed at a trusted effect boundary for a concrete attempted action.

GATE should optimize for:
- enormous event volume;
- very low marginal price per verification;
- minimal integration friction;
- network value from live external authority-state sources;
- receipts that make the decision auditable.

Primary business metric: `verified_effects_per_day`.

Supporting metrics:
- active verifier projects;
- verified effects per active project;
- number of authority sources connected;
- protocol adapters installed;
- p50 / p95 verification latency;
- percentage of verifications carrying issuer-derived freshness evidence;
- receipt verification rate;
- free-to-managed-network conversion.

## Architecture

### Layer 1 — Effect Contract
One stable developer primitive:

```js
const decision = await gate.verify({
  principal,
  actor,
  action: {
    protocol,
    name,
    resource,
    parameters
  },
  consistency
});
```

The public mental model is deliberately simple:

`Who -> is acting through whom -> to do what -> may the effect proceed now?`

The internal graph, source freshness, alternate-path logic, issuer checkpoints, key lifecycle, and fail-closed semantics remain behind the contract.

### Layer 2 — Effect Adapters
Official adapters intercept real effects without forcing protocols to adopt a GATE-specific transport:
- MCP
- HTTP / API middleware
- x402
- AuthZEN
- A2A
- AP2 / FIDO-related authority inputs
- OAuth / Shared Signals / issuer feeds

### Layer 3 — Authority Source Network
GATE ingests issuer-derived state and signed evidence from external trust domains. This is the managed-network value that local verification alone cannot reproduce.

### Layer 4 — Authority Receipts
Every managed verification can return a compact structured receipt describing the authority decision and the evidence used.

### Layer 5 — Metering
Every accepted network verification creates one privacy-minimized metering event. Billing can be priced at extremely low per-event rates while keeping local/open verification free.

## Delivery plan

| Stage | Goal | Concrete output | Exit criterion |
|---|---|---|---|
| 1 | Freeze the adoption contract | Effect Boundary Contract + Verified Effect Metering Contract | A developer can understand exactly where one GATE call belongs |
| 2 | Own MCP effect-time enforcement | `@gate-avn/mcp` one-command / minimal-config integration | A real MCP tool call is blocked or allowed by GATE immediately before execution |
| 3 | Add HTTP/API middleware | Node middleware + generic reverse-proxy pattern | A normal API endpoint can integrate GATE in <5 minutes |
| 4 | Add x402 adapter | Verify authority immediately before payment/resource settlement | Same `gate.verify()` primitive works in an agent-payment flow |
| 5 | Add AuthZEN + A2A adapters | Protocol translation packages and demos | Same authority result reused across policy and agent-to-agent surfaces |
| 6 | Build source network flywheel | OAuth/SSF/FIDO/AP2/enterprise issuer connectors | Managed network knows live external authority state unavailable to a purely local verifier |
| 7 | Commercialize verified effects | Usage dashboard, quotas, receipts, billing tiers, SLA | Paid project can move from free sandbox to metered managed verification without code rewrite |

## 90-day execution

### Days 0–14
Freeze Effect Boundary Contract v1.
Ship MCP effect-boundary integration.
Expose a single usage counter: Verified Effects.
Create one public end-to-end demo:
`MCP tool -> GATE -> ALLOW/DENY -> receipt -> effect`.

### Days 15–35
Ship HTTP/API middleware.
Add a local development mode and managed-network mode with the same API.
Add receipt viewer and metering dashboard.
Measure integration time from clean project to first verified effect.

### Days 36–60
Ship x402 adapter and a real agent-payment demo.
Begin AuthZEN mapping.
Create conformance tests for adapters.

### Days 61–90
Ship A2A/AuthZEN integrations.
Add first external issuer/source connector package.
Open managed-network beta around Verified Effects rather than feature tiers.

## Pricing direction

Do not optimize for high ARPU per developer. Optimize for becoming part of high-volume machine execution.

Keep:
- local SDK / local validation: free or open;
- developer sandbox: free quota;
- managed live authority network: metered;
- enterprise SLA / audit / dedicated source connectivity: premium.

The exact unit price should be learned from usage and infrastructure cost. The strategic objective is not the initial price; it is owning the verification position immediately before effects.

## Product discipline

New cryptographic or graph features enter the core only when they improve one of:
- correctness at the effect boundary;
- support for an important authority source;
- adapter interoperability;
- receipt trust;
- latency/availability;
- adoption or monetization.

The conformance suite absorbs adversarial reviewer feedback. The product roadmap remains driven by adoption and Verified Effects.
