# HTTP/API Effect Boundary — Stage 5

Stage 5 adds the second protocol feeding the GATE Network Verified Effects counter.

```text
HTTP request
    |
    v
normalized route boundary
    |
    v
gate.verify()
    |
    +-- ALLOW --> network meter --> route effect
    |
    +-- DENY / UNKNOWN --> network meter --> no route effect
```

Use normalized low-cardinality operations such as `POST /orders` or `DELETE /customers/:id`. Concrete resource identifiers and parameters may be sent to `gate.verify()` when required, but are not copied into the Verified Effect meter.

MCP and HTTP now feed the same economic unit: `gate.verified_effect`.
