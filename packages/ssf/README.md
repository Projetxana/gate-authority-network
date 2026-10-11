# @gate-avn/ssf

Authority-source connector for OpenID Shared Signals Framework (SSF) and CAEP 1.0.

Initial support:

- ES256 `secevent+jwt` verification
- SSF issuer / audience / `iat` validation
- SSF restrictions on `sub` and `exp`
- CAEP `session-revoked`
- explicit subject-to-GATE-edge mapping

```text
Identity / authority source
       ↓
signed SSF SET
       ↓
CAEP session-revoked
       ↓
configured GATE edge mapping
       ↓
authority edge REVOKED
       ↓
same gate.verify() call changes ALLOW → DENY
```

The mapping is explicit because a CAEP session identifier is not automatically equivalent to a GATE delegation edge.
