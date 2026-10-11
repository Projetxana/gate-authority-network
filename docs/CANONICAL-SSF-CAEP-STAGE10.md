# Canonical SSF / CAEP Project Bridge — Stage 10

Stage 10 connects the external authority-source side to the real canonical GATE v7 project authority store without modifying the public v7 data-plane code.

The smoke creates a disposable Free GATE project and never prints its API key.

```text
external authority source
       |
       | signed OpenID SSF SET
       v
SSF / CAEP verifier
       |
       | session-revoked
       v
trusted GATE connector
       |
       | explicit subject -> edge mapping
       | connector-signed canonical authority event
       v
GATE v7 canonical project store
       |
       v
same /v1/authority/verify call
VALID / ALLOW  ->  INVALID / DENY
```

## Trust split

Two signing identities are intentionally separate:

1. **external SSF source key** — signs the original `secevent+jwt`;
2. **GATE connector key** — registered by the project and signs the normalized canonical GATE authority event after source verification and mapping.

This prevents GATE from pretending that a third-party CAEP transmitter already speaks GATE's native authority-edge event vocabulary.

## Safety

- disposable Free project;
- canonical GATE API used as documented;
- no modification to public v7 function code;
- connector issuer trust revoked after the proof;
- generated bearer project key is never printed;
- no payment or production customer data.
