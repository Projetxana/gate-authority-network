# External validation prompts

Use these in standards/community discussions. The goal is problem discovery, not promotion.

## Core question

> In a cross-domain agent delegation chain, what component is responsible for proving at the final effect boundary that every upstream authority dependency is still current — especially when the presented credential itself remains cryptographically valid?

## Follow-ups

- How do you propagate a root or intermediate revocation across organizational boundaries?
- What is your maximum permitted stale-ALLOW window?
- How do you preserve an independently authorized alternate path when another path is revoked?
- Is revocation checked online, via locally replicated signed state, short token lifetime, or another mechanism?
- Which component owns the SLA for that current-state check?
- Does the solution require all parties to adopt one proprietary credential format?
- How should AuthZEN consume this state without making the PDP itself the global revocation database?

## What would falsify GATE

A mature answer that already provides protocol-neutral, cross-domain, alternate-path-aware live authority resolution with a production-grade shared state network.
