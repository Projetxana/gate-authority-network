# GATE v7 — Live status and documented limits

Last reviewed: 2026-10-08. **Developer Preview, not general availability.**

## Try GATE

- **Two-minute interactive demo:** https://gate-beta-nu.vercel.app/demo.html
- **Self-hosted API signed-issuer reference:** https://gate-beta-nu.vercel.app/integration.html
- **First external developer cohort:** https://gate-beta-nu.vercel.app/
- **Technical explanation:** https://gate-beta-nu.vercel.app/article.html
- **Live API:** `https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-network`
- **Developer-preview sandbox:** `https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-sandbox`

## Which endpoints are real?

The `gate-network` Edge Function v7 exposes:

| Method | Route | What it does |
|---|---|---|
| `GET` | `/health` | Public API status, not an availability SLA |
| `POST` | `/projects/register` | Create an independent Free project and one API key |
| `GET` | `/v1/project` | Authenticated plan and usage |
| `GET` | `/v1/regions/status` | Authenticated region/topology disclosure |
| `POST` | `/v1/issuers/register` | Register an issuer's ES256 public JWK |
| `GET` | `/v1/issuers` | List issuer trust and effective trust status |
| `POST` | `/v1/issuers/revoke` | Revoke trust in a local issuer |
| `POST` | `/v1/authority/events` | Accept signed authority-edge security events |
| `POST` | `/v1/authority/verify` | Perform a live, metered authority-path verification |
| `POST` | `/v1/federation/exports` | Create a project-targeted issuer-trust export |
| `POST` | `/v1/federation/imports` | Import targeted issuer trust in an independent project |
| `POST` | `/v1/federation/exports/revoke` | Withdraw the cross-project trust export |
| `GET` | `/v1/audit` | Authenticated project verification audit |

All API key-scoped operations require a project bearer key. Keep signing private keys and bearer API keys server-side; never paste them into public issues or feedback forms.

The separate **sandbox** endpoint creates a temporary demo project with a *synthetic, pre-seeded* authority graph. Its `/sandbox/revoke` action is a demo operation and should not be described as a third-party signed issuer event.

## Decision boundary

- `VALID / ALLOW`: a currently trusted authority path survives.
- `INVALID / DENY`: all relevant known paths are revoked or invalid, or no path exists.
- `UNKNOWN / DENY`: GATE cannot establish the necessary state with the available snapshot freshness and source trust.

This is an **authority-state result**, not full business authorization, identity verification, authentication, resource policy or an enforcement gateway. The consuming tool/server must enforce the decision before the effect.

## Freshness and topology — do not overclaim

- One canonical PostgreSQL primary in **Canada Central** (`ca-central-1`).
- **No physical regional replica** configured or measured as of this status date.
- The live v7 `/v1/regions/status` endpoint reports `single-primary`, with an empty `configuredReplicaRegions` list.
- Region-specific requests for nonexistent replica regions are explicitly refused, returning `UNKNOWN / DENY` with HTTP 503.
- The live authority snapshot joins delegation edges and issuer trust in one PostgreSQL statement.
- `maxStalenessMs` on the current primary is a **primary database snapshot age budget** (subject also to a server-side 5-second ceiling). It is **not** an external issuer propagation SLA, and it does not measure regional replica lag.
- `strict` is restricted by plan and currently means a canonical primary read, **not** synchronous authoritative confirmation of all upstream third-party sources.
- No cross-region replication lag guarantees, signed cross-region lease production deployment or fault-tolerance SLA exist yet.

## Independent test evidence (not an external customer integration)

The GATE v6 live ES256 QA output reported 18 successful HTTP checks: signed ACTIVE/REVOKED authority edges, issuer trust revocation, invalid-signature protection and strict-plan control. The GATE v7 regional guardrail QA output reported 9 successful HTTP checks: signed-in regional status, unavailable-region denial and no metering of rejected regional requests. Earlier GATE project-to-project federation QA reported 35 successful HTTP checks across two autonomous QA projects.

Those tests validate the reported behaviors **at the time of testing**, but do not prove an independent third-party source was connected, commercial availability, compliance certification, or a multi-region SLA.

## Current commercial status

The Developer Preview has a Free tier and planned Pro/Scale entitlements. Code and payment integrations exist, but a fully exercised paying-customer lifecycle, support response process, security audit, and legally reviewed customer agreements are not complete. **Do not present GATE as enterprise GA.**

## Security contact

`gate.security.network@gmail.com` — share sensitive findings privately, not in public GitHub issues.
