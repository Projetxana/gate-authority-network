# GATE — Developer acquisition launch · 28 October 2026

## Launch scope

Market **what is available now**: a public Free Developer Preview of the managed authority-state resolver; signed authority events, delegated-path verification, SDK `0.1.0-dev.4` and MCP adapter `0.1.0-dev.8`. A developer-controlled ES256 issuer demonstrates a network-backed grant → ALLOW → revoke → DENY flow with one locally guarded effect.

Do **not** market Stage 18 work-bound signed permits, automatic external issuer synchronization, enterprise SLA, multi-region production replicas, or independently verified third-party MCP effects as public features.

## Customer promise

**Headline:** A valid credential doesn't mean an agent still has authority.

**Explanation:** GATE re-checks delegated authority state at the final protected effect boundary, complementing OAuth, your IdP and your existing business-policy engine.

**Demonstration:** Create Free project → follow signed-issuer quickstart → observe DENY / ALLOW / DENY on the actual GATE Network, with one guarded local effect.

## Acquisition routes, in priority order

| Channel | Entry point | What to measure |
| --- | --- | --- |
| Product website | `/` → `/live.html` → `docs/LAUNCH-FIRST-REAL-EFFECT.md` | Site-to-project conversion (analytics not yet connected; no fake counters) |
| GitHub | Repo README → live Free project / activation guide | GitHub referral and external issue/PR feedback |
| npm | `@gate-avn/sdk@dev`, `@gate-avn/mcp@dev` | Package downloads, not users |
| MCP Registry | `server.json` now aligns with `dev.8`; registry must be re-published separately | Verify displayed registry version and outgoing links |
| Targeted developer pilots | 20 personalized invites to teams working on MCP effect boundary and delegated revocation | 5 replies; 3 independent activations; 1 real protected effect |
| Problem-specific technical articles | Search phrases: MCP tool authorization, delegated agent revocation, signed token still valid, live authority state | Qualified referrals to live onboarding |

## Immediate launch checklist

1. Deploy this site via a separate PR / Vercel preview; visually inspect mobile and desktop, run `node --test test/marketing-site.test.mjs` and `npm test`.
2. Verify `/`, `/live.html`, `/quickstart.html`, `/adoption.html`, `/robots.txt`, `/sitemap.xml` and HTTP status codes on the deployed preview.
3. Merge only after confirming no regression to the Free project creation, Stripe Upgrade flow or adoption dashboard. The copy of the old landing page becomes `adoption.html`.
4. Update / re-publish the Official MCP Registry entry from `server.json`. A Git commit alone does **not** re-publish registry metadata.
5. Change GitHub repository homepage to the public site and add precise discoverability topics (`agent-authorization`, `mcp`, `delegation`, `revocation`, `authzen`, `security`). Verify actual topics through GitHub settings; don't assume they changed automatically.
6. Have an **unaffiliated** developer create a new Free project, install npm packages, and reproduce the signed-issuer demonstration. Do not count the creator's prior internal QA as external adoption.
7. Record consented feedback, time to first successful verification, whether the developer used their own issuer, whether a real MCP resource effect was protected, and whether they return at day 7. Never request customer keys, issuer private keys or protected action inputs.

## Integrity rules

- Front page static. It reads no API key, sets no cookie and sends no conversion beacon. Existing project and network telemetry remain independent.
- Download counts are not unique people. Registration counts are not paying customers. Verification counts are not proof of independently controlled upstream authority.
- `server.json` reflects the new npm package, but the Official MCP Registry is **not updated by a change to that file**.
- `npm audit --omit=dev` in the whole monorepo still identifies x402 → Zod 3 advisories; the clean external SDK/MCP consumer installation does not imply an audit of x402, production infrastructure or non-bypassable real effects.
- Avoid mass unsolicited posts to standards discussions. Offer a reproducible challenge with a genuine question to maintainers who have publicly described the effect-time revocation problem.

## Outreach question to ask, not an unverified endorsement

> We are validating GATE, a Developer Preview that checks delegated authority state at an MCP/HTTP effect boundary. The current Free Network demo reproduces a signed ACTIVE → ALLOW → signed REVOKED → DENY scenario. The issuer is deliberately developer-controlled. Would you be open to trying the quickstart and telling us where your existing system already solves the upstream-revocation question—or where it doesn't?

## Weekly decision gate

Continue distribution improvements if external testers can reproduce the flow and can name a meaningful operational gap. Change positioning if maintainers demonstrate an existing deployed component with equal guarantees. Do not start a broad paid acquisition campaign until the first 3 independent integrations and a clear buyer problem are documented.
