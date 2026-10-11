# Network Metering — Stage 4

North Star: **Verified Effects / day**.

Stage 4 moves the economic unit from an in-process demo counter to GATE-managed persistence.

A Verified Effect is counted when GATE evaluates live authority for a concrete effect boundary. The count does not claim that the downstream side effect completed.

## Flow

```text
MCP tools/call
      |
      v
GATE effect guard
      |
      v
hosted gate.verify()
      |
      v
gate.verified_effect
      |
      v
gate-metrics /verified-effects
      |
      v
project + protocol daily rollup
      |
      v
public aggregate dashboard
```

The event is idempotent per project through `verificationId`.

Privacy-minimized fields only:

- verification ID
- protocol
- normalized operation name
- authority / decision
- receipt version
- consistency
- serving edge / region

Never persisted by this meter: principal, actor, resource, action parameters, prompts, credentials, tokens, payment details, or arbitrary payloads.

## Dashboard

The public adoption dashboard now leads with:

- Verified Effects today
- Verified Effects / 30 days
- ALLOW / DENY / UNKNOWN mix
- protocol mix
- raw `gate.verify()` volume as a secondary telemetry signal

This separates discovery/verification volume from the economic unit GATE can eventually price.

