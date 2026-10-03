# Public validation plan

The purpose of the Developer Preview is to test one narrow hypothesis, not to claim a new authorization standard.

## Hypothesis

At the final effect boundary, a relying system sometimes needs to know whether an agent's upstream cross-domain authority is **still current**, even when the presented credential remains cryptographically valid.

GATE is useful only if that current-state question is not already solved universally by the deployed authorization stack.

## First external conversations

Target communities:

- OpenID AuthZEN
- OAuth / WIMSE delegation and revocation work
- MCP security / authorization implementers
- A2A security implementers
- agent identity and delegation projects such as Tenuo / Grantex

Start with the problem, not the product.

### Primary question

> In a cross-domain agent delegation chain, what component proves at the final effect boundary that every upstream authority dependency is still current when the presented credential itself remains cryptographically valid?

### Evidence to collect

For each answer, record:

- mechanism used for live revocation;
- whether it works across organizations;
- whether every participant must adopt one credential format;
- alternate-path semantics;
- maximum stale-ALLOW window;
- component that owns the availability/SLA;
- whether a shared external state network is required.

## Continue criteria

Continue investing if multiple credible implementers independently describe the same operational gap or currently assemble several mechanisms to solve it.

## Pivot / stop criteria

Pivot or stop if a mature, deployed mechanism already provides all of these together:

- protocol-neutral authority-state verification;
- cross-domain delegation chains;
- transitive/cascading revocation;
- alternate valid path preservation;
- bounded/strict freshness semantics;
- production shared state/distribution network;
- integration without forcing a proprietary authority credential.

## Developer Preview success signal

The first milestone is not stars or downloads. It is **3–5 technically credible external confirmations** that the current-state authority problem exists in real agent systems and is operationally painful.
