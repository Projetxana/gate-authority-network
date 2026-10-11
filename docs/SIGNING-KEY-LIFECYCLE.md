# Source Signing-Key Lifecycle — RC1

GATE validates source artifacts against both cryptographic signature validity and the signing key's authority window.

## States

- `standby` — key is known but not trusted for artifacts.
- `active` — artifacts are accepted when their `iat` is within the active window.
- `retired` — historical artifacts remain verifiable only when their `iat` falls within `[valid_from, valid_until]`.
- `revoked` — immediate distrust, including historical artifacts.

## Required checks

For an artifact signed by `kid = K`:

1. resolve K through the trusted issuer source;
2. verify ES256 signature;
3. verify issuer and audience binding;
4. verify any explicit tenant/scenario/project binding required by the adapter;
5. reject standby or revoked keys;
6. reject `iat < valid_from`;
7. reject `iat > valid_until` when a retirement boundary exists;
8. apply replay and contiguous-sequence checks.

Cryptographic validity alone is not signing authority validity.
