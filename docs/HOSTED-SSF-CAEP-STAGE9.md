# Hosted SSF / CAEP Source Ingestion — Stage 9

Stage 9 moves the SSF/CAEP source connector from an in-process proof to an isolated hosted GATE source-ingestion preview.

Public production v7 remains untouched.

```text
external authority source
        |
        v
signed ES256 Security Event Token
        |
        v
hosted GATE SSF receiver
        |
        v
OpenID CAEP session-revoked
        |
        v
configured subject -> authority edge mapping
        |
        v
hosted authority state REVOKED
        |
        v
same hosted verify endpoint
ALLOW -> DENY
```

## Hosted preview contract

Service:

`gate-ssf-bridge-preview`

Routes:

- `POST /scenarios`
- `POST /verify`
- `POST /events/ssf`
- `GET /health`

The scenario endpoint is only for isolated Developer Preview testing. It creates a 30-minute source scenario with a random bearer token and an explicitly configured SSF subject-to-GATE-edge mapping.

## Security properties exercised

- ES256 signature verification
- `typ=secevent+jwt`
- issuer binding
- audience binding
- SSF `sub` prohibition
- SSF `exp` prohibition
- bounded `iat`
- explicit `sub_id` mapping
- CAEP `session-revoked`
- JTI replay rejection
- live hosted authority transition `ALLOW -> DENY`

## Next boundary

The next step is to connect a registered external issuer/JWKS or SSF stream configuration to GATE's canonical project authority store rather than an isolated preview scenario.
