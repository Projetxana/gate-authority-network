# GATE — External Pilot Readiness Gate

**Date:** 2026-10-28

**Evidence updated:** 2026-10-30

**Decision:** **HOLD independent-expert integration pitch / HOLD paid production claims.**

**Allowed:** existing public Developer Preview, free self-controlled demo, and *explicitly exploratory* technical conversations. No unsolicited claim that GATE is enterprise-ready.

## Observed evidence, not assumed guarantees

| Feature | Evidence | Limit |
| --- | --- | --- |
| Public network | Supabase Canadian production project active; `gate-network` v7 deployed | Does not establish third-party propagation freshness or uptime SLA |
| SDK/MCP distribution | Public npm `@gate-avn/sdk@0.1.0-dev.4` and `@gate-avn/mcp@0.1.0-dev.8` installed and audited with 0 consumer alerts | Does not audit the whole monorepo, hosted runtime, or x402 |
| Signed authority events | Local ES256 signer + real hosted Free network grant/revoke checks | Issuer is developer-controlled, not external independent IdP |
| Guarded effect | One operator-run real MCP `tools/call` + hosted Free network + ES256 grant/revoke, with one harmless local effect, reported 2026-10-30 | Still not an unaffiliated cold trial, independent issuer integration or production authorization guarantee |
| Delegation policy | Network checks current known principal-to-actor authority path | `action` is contextual in Stage 17, not scoped permission authorization |
| Production connectors | Hosted SSF, source registry, signed-source functions exist | Deployment does not prove every third-party source integration works |
| Free plan | 50k checks/mo, one issuer, bounded | `strict` prohibited by plan; bounded is not an issuer-freshness SLA |

## Blocking release gates (all must pass before inviting experts to integrate)

- [ ] **P0-A, onboarding**: new user + new Free project can complete the published docs *without assistance*, including the MCP tool guard. CI verifies the exact example selected `bounded`, not `strict`; no `@latest` / `@dev` drift in trial commands. Credentials never logged.
- [x] **P0-B, end-to-end MCP**: one deterministic independent-reproducible scenario on a real Free project executes actual `tools/call`, uses a signed self-controlled issuer with `ACTIVE -> ALLOW -> REVOKED -> DENY`, ensures no second side effect, handles `UNKNOWN -> DENY`, and visibly distinguishes self-controlled and external issuer claims. A local file write is sufficient; do not send emails or payments.
- [ ] **P0-C, security boundary**: explicitly document and test trusted principal/actor derivation; prevent untrusted arguments from choosing someone else's authorization path. Explain tool policy and scope remain application-owned. Error/timeout must fail closed. Review effect boundary for bypass/TOCTOU and parameter/credential leakage.
- [ ] **P0-D, runtime & trust**: confirm hosted network/connector behavior, issuer key trust lifecycle, event replay rejection, alternate-path semantics, response/error contract and observed revocation latency. No SLA, external-source 'now', or multi-region claims.
- [ ] **P0-E, supply chain**: documented SDK/MCP consumer audit clean; review and resolve or formally contain monorepo x402/Zod advisories before any x402/enterprise launch. Confirm published tarballs contain intended code and no secrets.
- [ ] **P0-F, independent cold trial**: one developer who did not build GATE follows the guide without private help; record errors, time-to-first-ALLOW, whether revocation blocks effect, and whether they would adopt. No API keys/JWS secrets in feedback.

## Evidence ledger (2026-10-30)

- Operator-supplied hosted Free result: no authority -> `DENY / 0 effects`; signed grant -> `VALID / ALLOW / 1 effect`; signed revoke -> `DENY / still 1 effect`; issuer trust cleanup confirmed.
- Operator-supplied local test results: 6/6 live MCP fixtures, 12/12 guard-security tests and 94/94 full suite tests. Eight package dry-runs passed. GitHub check runs for commit `9d107ce` passed on Node 20, Node 22 and Stage 16 reproducibility.
- Review hardening includes regression tests for missing trusted identity-resolver values. These new tests and the revised commit require a fresh CI pass before merge.
- **Unmet:** P0-F unaffiliated cold trial; P0-D additional runtime/trust verification; supply-chain HIGH advisory assessment; new versioned MCP tarball/reproducibility review. No enterprise readiness or third-party source freshness claims.

## Post-gate commercial segmentation

- **Pilot-ready:** developers explicitly testing revoked authority after credentials were issued, or alternate delegation paths; demo remains Developer Preview with a self-controlled issuer.
- **Exploratory only:** maintainers of Keycloak, IdP, OAuth revocation and cross-domain agent systems; ask for their authority-source boundary and point to known limitations.
- **Not ready to sell to:** enterprise teams requiring turnkey Entra/Keycloak authority sync SLAs, production action/resource-scoped permits, atomic work authorization, SOC/compliance, high availability, or independent assurance. Stage 18 is draft, not production.

## Responsibility rule

Never substitute green unit tests, a public package, a live endpoint, or a marketing site for evidence from an unaffiliated first-time user. Do not move the gate to GO to meet a calendar target; the 90-day challenge is for real adoption, not superficial publishing milestones.
