# GATE due diligence — 2026-10-02

## Question tested

**Who already provides real-time, cross-domain, multi-hop authority verification with transitive revocation at the moment an agent action executes?**

The answer is no longer “nobody is close.” Several projects now overlap materially with GATE. The opportunity is therefore narrower and must be positioned with precision.

## Closest commercial / open-source systems

### Tenuo — closest technical overlap

Tenuo is an open-source capability/warrant system for AI agents. It carries signed authority with the task, supports multi-hop attenuation, verifies the full chain at the effect boundary, integrates with MCP and A2A, and supports signed revocation lists. Tenuo Cloud adds managed issuance and revocation distribution.

What overlaps GATE:
- multi-hop delegation chains;
- revocation;
- effect-boundary enforcement;
- MCP and A2A integrations;
- managed revocation distribution.

Material distinction today:
- Tenuo’s primary model is a **Tenuo warrant** whose authority travels with the request and is verified locally;
- GATE’s intended model is **protocol-neutral live authority-state verification** over authority emitted by multiple external systems/domains, without requiring them to adopt a GATE credential.

This distinction is strategically important but must be validated with users; it is not enough to claim a different architecture.

Sources:
- https://tenuo.ai/
- https://github.com/tenuo-ai/tenuo
- https://tenuo.ai/faq/

### Grantex / DAAP — strong overlap

Grantex provides scoped, revocable agent authority and multi-agent delegation. Its specification states that a root grant revocation invalidates the chain, and its product is built around an OAuth Agent Grants profile / Grant Token model.

What overlaps GATE:
- multi-agent chain semantics;
- service-side verification;
- cascade revocation;
- OAuth-oriented integration.

Material distinction today:
- Grantex owns a grant/token profile;
- GATE’s hypothesis is that the paid network should verify authority originating in **other** protocols and domains rather than require a GATE grant format.

Sources:
- https://grantex.dev/
- https://github.com/mishrasanjeev/grantex/blob/main/SPEC.md

### Permit MCP Gateway — strong runtime-enforcement overlap

Permit’s MCP Gateway authorizes every MCP tool call in real time, models human-to-agent trust, and lets users/admins revoke an agent or human. Permit can also deny tokens already in flight.

What overlaps GATE:
- critical-path enforcement;
- runtime revocation;
- delegated human-to-agent trust;
- MCP gateway distribution.

Material distinction today:
- the documented trust/revocation model is inside Permit’s gateway/policy environment;
- it does not present itself as a neutral Internet-wide resolver of multi-hop authority emitted by independent organizations/protocols.

Sources:
- https://docs.permit.io/permit-mcp-gateway/
- https://docs.permit.io/permit-mcp-gateway/http-egress-proxy/authorization/

### Descope

Descope’s Agentic Identity Hub issues short-lived scoped credentials for agents, applies runtime policy/HITL controls, and advertises instant agent revocation. It is highly relevant adjacent infrastructure, but its public positioning is primarily identity/credential/governance rather than a protocol-neutral shared authority graph.

Source:
- https://www.descope.com/use-cases/ai

### AuthProof / IntentBound

AuthProof focuses on cryptographic delegation receipts that pre-date execution; IntentBound binds actions to signed human intent. Both are important adjacent systems for proving original authorization and preventing scope widening, but neither public description currently looks like GATE’s shared live cross-domain revocation-state network.

Sources:
- https://authproof.dev/
- https://intentbound.com/

## Standards are converging rapidly on the same problem

This is the biggest strategic signal.

### Cross-organizational delegation is now an explicit IETF problem statement

The WIMSE draft on cross-organizational delegation says existing workload/token mechanisms do not adequately express, constrain, or verify recursively delegated authority across independent organizations.

Source:
- https://datatracker.ietf.org/doc/html/draft-reece-wimse-cross-org-delegation-01

### OAuth delegation-chain work includes revocation semantics

The OAuth delegation-chain draft describes multi-hop delegation and includes a dedicated delegation-revocation section with detection mechanisms such as introspection, short-lived tokens and back-channel notifications.

Source:
- https://datatracker.ietf.org/doc/draft-liu-oauth-chain-delegation/

### Explicit agent revocation / cascade propagation is being standardized experimentally

The OAuth agent-revocation draft explicitly targets batch revocation, cascade propagation and cross-domain agent networks.

Source:
- https://datatracker.ietf.org/doc/html/draft-chen-oauth-agent-revocation-00

### “Revocation closure” is extremely close to GATE’s core insight

A September 2026 individual draft defines a protocol-neutral model with **authority graphs, consequential sinks, revocation cut sets, closure states and closure receipts**. Its premise is that revoking a credential does not prove every path to a consequential effect has been closed.

This is not an adopted standard, but it is a strong signal that the exact problem GATE identified is real — and that the terminology/solution space may standardize quickly.

Source:
- https://datatracker.ietf.org/doc/html/draft-watts-oauth-agent-revocation-closure-00

### Research is independently converging on alternate-path-preserving revocation

VERA (Aug 2026) studies federated AI-agent workflows and specifically distinguishes correct edge revocation from tree-style cascading that can over-revoke shared agents. This closely matches GATE v0.2’s alternate-valid-path behavior.

Source:
- https://arxiv.org/abs/2608.30091

## Current conclusion

### What is validated

The market/standards ecosystem strongly validates the **problem**:
- authority is delegated recursively;
- credentials can remain locally valid after upstream authority changes;
- multi-hop/cross-domain revocation is difficult;
- authorization must be enforced at the effect boundary;
- alternate independent authority paths matter.

### What is not validated

It is **not** yet validated that developers will pay for an independent external network on every critical action rather than:
- use Tenuo/Grantex-style portable credentials + local revocation data;
- rely on their existing PDP/gateway;
- adopt forthcoming OAuth/WIMSE standards directly;
- keep everything inside one organizational trust domain.

### GATE must therefore avoid these claims

Do not position GATE as:
- “the first agent authorization protocol”;
- “the only solution to delegated-agent revocation”;
- a proprietary token or warrant;
- another MCP authorization gateway;
- another PDP.

### Defensible positioning to test

**GATE is a neutral live-authority resolver across heterogeneous authorization systems.**

The product hypothesis is strongest when:
1. multiple organizations/protocols participate in one delegation path;
2. no single issuer/PDP has complete live state;
3. credentials remain cryptographically valid after upstream authority changes;
4. the verifier needs a current answer with an explicit freshness contract;
5. GATE can ingest/normalize external revocation/trust evidence without requiring a GATE credential.

## Kill / pivot criteria

Pivot or stop the current network thesis if a broadly adopted standard/provider supplies all of the following together:
- heterogeneous cross-domain authority graph resolution;
- live/cascading revocation state;
- alternate-path-aware verification;
- protocol-neutral adapters;
- shared/global state that eliminates the need for a separate GATE network;
- low-latency critical-path verification with production SLA.

Tenuo is the closest product to watch. The OAuth/WIMSE revocation/delegation drafts and revocation-closure work are the closest standards to watch.

## External validation questions

Do not ask “do you like GATE?”. Ask implementers:

1. When an agent delegates across two organizations, where is the authoritative current revocation state checked at the final effect boundary?
2. If an upstream grant is revoked while downstream credentials are still cryptographically valid, what component guarantees the final action is denied?
3. If the downstream agent has two independent valid authority paths and only one is revoked, how is over-revocation avoided?
4. Who owns propagation latency and the maximum stale-ALLOW window?
5. Would you accept a third-party verifier on the critical path if it removed custom cross-domain revocation integration? What latency/SLA would be required?
6. Would you prefer local signed revocation material (Tenuo-like) or an online resolver (GATE-like), and for which action classes?

These answers determine whether GATE should become a network product, a standards implementation, or an adapter/distribution layer for emerging revocation-closure standards.
