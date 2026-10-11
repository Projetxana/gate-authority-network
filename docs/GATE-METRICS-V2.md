# gate-metrics v2 — Verified Effects

The hosted `gate-metrics` Edge Function keeps the existing `/events` verification telemetry route and adds:

- `POST /verified-effects`
- idempotency via `(project_id, verification_id)`
- aggregate-only public exposure through `GET /summary`
- `verifiedEffects` and `verifiedEffectsDaily` in the summary response

Accepted payload:

```json
{
  "event": "gate.verified_effect",
  "verificationId": "gv_...",
  "protocol": "mcp",
  "operation": "tools/call:send_email",
  "authority": "VALID",
  "decision": "ALLOW",
  "receiptVersion": "gate.authority-receipt.v2",
  "consistency": "strict",
  "servedBy": "gate-network:...",
  "region": "ca-central-1"
}
```

The endpoint authenticates the same GATE project API key used for verification. It does not persist principal, actor, resource, parameters, prompt, credentials, tokens, or payload content.

The database migration in `supabase/migrations/20261011120000_verified_effect_metering_v1.sql` is the canonical storage contract.

