# Security policy

GATE is an experimental developer preview and **must not be used to protect production actions**.

## Reporting a vulnerability

Please do not publish exploitable details in a public issue. Until a dedicated security contact is established, open a GitHub issue containing only a short request for a private security contact channel and no exploit details.

## Security model under test

The preview assumes:

- cryptographic issuer identity is verified before authority state is accepted;
- authority issuers are constrained to principals/namespaces they are permitted to speak for;
- replayed and stale authority events are rejected;
- stale edge replicas fail closed under the requested consistency contract;
- `UNKNOWN` is not silently converted into `ALLOW` for consequential actions.

The implementation is a research prototype. These properties have tests, not a production security audit.
