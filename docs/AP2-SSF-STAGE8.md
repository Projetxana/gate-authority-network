# AP2 + SSF/CAEP — Stage 8

Stage 8 starts the transition from effect-surface coverage to external authority-source coverage.

## AP2 evidence bridge

AP2 mandates establish cryptographic authorization evidence for agentic commerce. GATE does not replace mandate verification. The verifier first validates the AP2 mandate chain; GATE then evaluates whether the delegated authority is still live at the effect boundary.

```text
AP2 mandate verification
        |
        v
verified mandate evidence
        |
        v
gate.verify()
        |
        +-- ALLOW --> commerce effect
        |
        +-- DENY / UNKNOWN --> no effect
```

The Stage 8 hosted smoke uses an explicitly pre-verified fixture. It validates the GATE integration contract and Network metering, not AP2 SD-JWT cryptography.

## OpenID SSF / CAEP source connector

The SSF connector verifies a signed `secevent+jwt` and normalizes CAEP `session-revoked`.

```text
external identity / authority source
        |
        v
signed SSF Security Event Token
        |
        v
CAEP session-revoked
        |
        v
configured subject -> GATE edge mapping
        |
        v
edge REVOKED
        |
        v
same gate.verify() call: ALLOW -> DENY
```

The mapping is intentionally explicit. A CAEP subject identifier and a GATE delegation edge are not assumed to be the same object.

## Strategic result

Effect surfaces:
MCP + HTTP + x402 + AuthZEN + A2A + AP2

Authority-source surface:
OpenID SSF / CAEP

This is the start of the source-plane moat: GATE can consume external state changes without requiring each protected application to rewrite its effect integration.
