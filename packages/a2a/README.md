# @gate-avn/a2a

GATE live authority enforcement for incoming A2A operations before the receiving agent causes an effect.

Initial Network v1 support targets A2A JSON-RPC 2.0, including the standard `message/send` method.

```text
A2A message/send
      ↓
receiving agent
      ↓
GATE live authority
      ↓
ALLOW → task/effect
DENY  → JSON-RPC error, no effect
```

Message content is not copied into the Verified Effect meter. The meter receives the normalized A2A method only.

`gateDeniedToA2AError()` maps a GATE denial to a documented custom JSON-RPC server error in the `-32000` to `-32099` range.
