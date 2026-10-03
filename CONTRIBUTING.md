# Contributing

GATE is currently a research/developer preview. The most useful contributions are falsification, interoperability feedback, and concrete cross-domain revocation cases.

Before proposing a feature, please distinguish between:

1. **business-policy authorization** — belongs in AuthZEN/Cedar/OPA/Permit/Cerbos/OpenFGA/etc.; and
2. **live authority-state resolution** — the narrow problem GATE is exploring.

Useful contributions include protocol adapters, attack cases, authority-graph test vectors, revocation/freshness edge cases, and evidence that an existing standard or deployed system already solves the problem universally.

Run before submitting changes:

```bash
npm install
npm test
npm run check
```
