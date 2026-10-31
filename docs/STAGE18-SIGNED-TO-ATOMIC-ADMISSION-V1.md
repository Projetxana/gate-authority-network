# GATE — Stage 18 / Signed-to-Atomic Admission v1

**Status:** experimental; not merged, not deployed, no hosted route, no database changes.

## Objective

Connect the existing local ES256 work-event / work-checkpoint verifier to the already drafted PostgreSQL `gate_admit_bounded_work_v2` parameter contract. Both independently signed JWT artifacts are authenticated **before** decoding claims for the SQL request, and SHA-256 digests cover the *entire original JWS compact string* (not a reconstructed payload). All scope, JTI, status, sequence and permissions come from the verified artifacts. The public JWK, issuer row and project row come from server-controlled state, not the API request.

The builder generates a **candidate for atomic admission**, not an authorized effect or a canonical receipt. It does not run SQL or make network requests. SQL still has to atomically check the issuer/project/key/sequence/replay under locks and commit the record. Neither the local verifier nor this builder proves a source is independently reachable at effect time.

## Files

- `src/build-bounded-work-admission-v2.mjs`
- `test/bounded-work-admission-v2.test.mjs` (12 regression tests)

Only these new files are added by this bundle; the existing SQL draft is unchanged.

## Test

From Stage 18 checkout after running `apply_patch.py`:

```bash
node --test test/bounded-work-admission-v2.test.mjs
npm run check
npm test
bash qa/run-postgres17-isolated.sh
```

The test exercises ES256 verification, exact tenant/issuer/work scope binding, swapped JWK, signed claims tampering, checkpoint lease expiry, terminal revocation payload, and unsupported permission claims. It does not run any SQL.

## Unmet release gates

1. Source `projectRow`, `issuerRow`, and `acceptedSeq` from privileged server state bound to the **authenticated** project, never from an HTTP caller. Keep the service role credential server-only.
2. Integrate this builder into a dedicated hardened Edge ingress path; authenticate the project before any project-scoped lookup, constrain request sizes, rate-limit, return safe errors, and map errors to fail-closed outcomes.
3. Present v2 supports **direct local** issuers only. No federation, wildcard principal patterns, payment/amount constraints, or multi-hop delegation. Unsupported claims remain DENY, not a silent fallback to legacy graph-only ALLOW.
4. Enforce key validity periods, rotation policy and stronger provenance within the ingress. Current `gate_authority_issuers` schema has `status`, `key_id`, `public_jwk` but no lifecycle window fields; the adapter assumes an issuer row marked active. Any lifecycle state not represented by that row must be validated independently.
5. Compare the draft migration against the **complete** Supabase schema, and test concurrent ingress in a disposable nonproduction environment before deployment. The current Docker SQL fixture uses minimal mock GATE schema and dummy signing-key material.
6. Add a canonical stored-state reader that rechecks project/issuer trust and checkpoint expiration **at the effect boundary**, with an explicit scope-aware receipt. Prevent a Work B path from reviving a revoked Work A. A read check does not eliminate the verify→effect TOCTOU window by itself.
7. Gate all hosted work-scoped traffic behind an opt-in route or feature flag. The existing `gate-network` graph route does not implement this feature; **never** silently fall back to legacy `ALLOW` when `authorityContext` is present.

**Release status:** this bundle may be committed to the existing DRAFT PR after local review, but must not be merged or claimed as hosted/production enforcement.
