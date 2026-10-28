# GATE — 14-day external Developer Preview pilot (27 October 2026)

**North-star metric:** number of *independent* developers who independently protect one real tool effect and observe a source-initiated revocation. Keep synthetic test-issuer activations separate.

## Market message

GATE checks whether an agent's delegated authority is **still current** immediately before an effect, and distinguishes invalid authority from unknown/stale evidence. It complements OAuth, MCP, AuthZEN and existing policy engines. It does not replace the resource owner's action policy.

Avoid claiming that GATE is the only system with revocation, a native payment authorization engine, enterprise GA, globally distributed, or independently synchronized to an issuer it does not control.

## Roadmap — release by evidence rather than calendar promises

| Priority | Deliverable | Proof / acceptance |
| --- | --- | --- |
| P0 (now) | One-command disposable Free Network activation | An unaffiliated developer reproduces DENY -> ALLOW -> DENY without private assistance; no credential leak |
| P0 (now) | Landing page with `Try sandbox`, `Create Free live project`, `Integrate signed issuer`, clear security caveats | All links work and correspond to the package versions actually on npm |
| P0 | Fix SDK/MCP repo-vs-npm version drift | `npm view @gate-avn/sdk dist-tags --json` and MCP equivalent; pin examples to tested published tags |
| P1 | Actual MCP `tools/call` with independent tool owner | Effect blocked after fresh upstream revocation, with delivery latency measured; source is not a fixture |
| P1 | Stage18 on separate GATE-STAGING | SQL ACL/security review, protected backend, GATE signing key, audience-bound reserve & consume, race tests |
| P1 | First three pilot developers | Recorded external installs and verbatim feedback; no internal-only count |
| P2 | Payment and metering proof | Real opt-in checkout and usage event tied to an external project; no QA/self-charge |

## First outreach, without pretending to have customers

Select five technically credible maintainers or teams who have published on **MCP effect-time security**, **AuthZEN policy integrations**, or **upstream delegation revocation**. Personalized messages must focus on the precise technical gap and an installable test, not general promotion. Do not spam GitHub standardization discussions or post promotional links into standards threads.

### Example short outreach (English)

> I'm validating GATE, a Developer Preview for checking whether delegated agent authority remains current at effect time. We have a reproducible signed grant → ALLOW → signed revoke → DENY flow on a managed Free project. The first issuer is self-controlled test infrastructure, not a claim of third-party integration. Would you be willing to try the quickstart and tell us where your existing MCP authorization stack already solves this—or fails? No migration or paid commitment is needed.

### Proposed pilot feedback fields

Record: contact permission, team pseudonym, date, use case, existing IAM/MCP stack, new/existing developer, activation URL/commit, time-to-first-verification, issuer type (fixture / controlled real / independent), live effect confirmed yes/no, revocation-to-DENY latency if measured, return at J7 yes/no, actual paid charges, blocker, next action. Never collect tokens, JWS private keys, prompts, or sensitive effect arguments.

## Explicit no-go gates

Do not merge Stage18 draft PR #16 directly into production; do not treat local Node/SQL tests as externally installable; no production SQL/secret changes; no publishing paid claims without checking Stripe and entitlement continuity; no independent live-source claim while proof is still a test issuer.

## Updated public claim

**Developer Preview now:** network-backed delegation state and revocation checks, with a Free onboarding path and bounded primary snapshot semantics.

**Not yet publicly launched:** Stage18 exact-work signed permits, hosted atomic permit lifecycle, non-bypassable external effect enforcement, independent upstream freshness SLA.
