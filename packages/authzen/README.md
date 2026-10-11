# @gate-avn/authzen

PEP-side GATE integration for the OpenID AuthZEN Authorization API 1.0 model.

AuthZEN answers the policy question. GATE then verifies whether the delegated authority chain is still live at the effect boundary.

```text
AuthZEN PDP
 decision=true
      ↓
PEP
      ↓
GATE live authority
      ↓
ALLOW → effect
DENY  → no effect
```

A PDP denial short-circuits: GATE is not called because the effect is already prohibited by policy.

The adapter uses the AuthZEN Subject / Action / Resource request model and keeps GATE's principal/actor mapping explicit rather than assuming the AuthZEN subject is necessarily the delegated actor.
