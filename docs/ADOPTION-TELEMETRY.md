# GATE verification usage telemetry

Developer Preview telemetry is emitted at the verifier/effect-time boundary, not inferred from npm downloads.

## What is counted

A successful or denied call to:

```text
POST /v1/authority/verify
```

can emit one privacy-minimized usage event.

The event contains only:

- project API key (sent as a bearer credential to the metrics service; the database stores only its hash)
- decision: `ALLOW`, `DENY`, or `ERROR`
- authority: `VALID`, `INVALID`, or `UNKNOWN`
- consistency: `bounded` or `strict`
- verifier latency in milliseconds
- source (`api`)
- verifier client/version label
- timestamp assigned by the metrics service

The event **does not contain** principal, actor, action, resource, action parameters, delegation graph contents, or authorization payloads.

## Edge configuration

Set:

```bash
GATE_METRICS_URL=https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-metrics
GATE_EDGE_VERSION=gate-edge-dev
GATE_METRICS_TIMEOUT_MS=750
```

A calling project supplies its own GATE API key in:

```http
Authorization: Bearer gate_sk_...
```

That key identifies the project for adoption and usage accounting. The telemetry path is best-effort in this Developer Preview: a metrics outage must never change an authority decision.

For internal/test traffic without an inbound bearer key, `GATE_USAGE_API_KEY` may be configured as a fallback. Do not commit API keys to Git.

## Dashboard semantics

- `activated_projects`: projects with at least one recorded verification.
- `active_projects_today`: distinct non-internal projects with usage today.
- `verifications_today`: total recorded verification events today.
- `verifications_30d`: total recorded verification events over the rolling 30-day reporting window.

npm download counts remain separate and must not be interpreted as unique developers.
