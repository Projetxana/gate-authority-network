# @gate-avn/ap2

Verifier-side AP2 bridge for GATE.

AP2 mandates provide cryptographic evidence of what an agent is authorized to do. GATE adds the live question at the effect boundary: **does the delegated authority still exist now?**

```text
AP2 mandate verification
       ↓
verified mandate evidence
       ↓
GATE live authority
       ↓
ALLOW → checkout/payment effect
DENY  → no effect
```

This package deliberately does **not** implement a partial AP2 SD-JWT / Delegate SD-JWT verifier. It accepts only an explicit `verified: true` result from a conforming AP2 verifier and composes that result with GATE.

Supported AP2 v0.2 mandate types in this Developer Preview:

- `mandate.checkout.1`
- `mandate.checkout.open.1`
- `mandate.payment.1`
- `mandate.payment.open.1`

The AP2 mandate itself is not copied into the GATE Verified Effect meter.
