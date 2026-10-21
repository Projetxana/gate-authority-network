# Stage18 guarded database effect — review boundaries

## Narrow property demonstrated
1. A valid, signed, scope-bound authority snapshot is already admitted atomically.
2. Reader RPC checks current issuer/project/work trust, leases and exact action and holds SHARE locks until transaction COMMIT.
3. A SECURITY DEFINER function invokes this reader and records an effect under the same transaction.
4. A concurrent issuer status UPDATE must wait for the guarded transaction; once revoked, future guarded database writes fail closed.
5. An effect_id is bound to project, work and action: exact retries are idempotent, attempts to reuse for a different work are denied.

## Explicit non-properties / remaining risks
- Journal record is a **synthetic protected database write**, not a real third-party tool call or completed business effect.
- Revalidation before a network request is insufficient by itself to close the external effect TOCTOU race. Destination systems require coordinated enforcement, short-lived proof with replay defense, or transactionally enforced authorization at their own execution boundary.
- SQL functions are currently SECURITY DEFINER and service_role-only; introducing them to an exposed API would require a separate threat model, authenticated project-binding, least privilege and a restricted execution role.
- Synthetic fixtures do not prove full migration compatibility with production or all federation/source freshness semantics.
- Signed checkpoint leases are not an independent issuer-current-state guarantee.
- Work-bound receipts, hosted integration, billing/adoption metrics and deliberate public API contract are future milestones.
