# Stage18 read boundary — engineering review

## Contract
- Project-id, issuer-id, specific work-id, principal, actor, exact protocol/name/resource.
- Work A and Work B never share graph evidence or revocation status.
- Current issuer trust, key JWK and project status are rechecked by joining rows `FOR SHARE`.
- Governing work REVOKED is terminal; signed checkpoint and work lease hard-expire.
- At least one active, unexpired direct delegation and one exact permission are required.
- No permissions for params/amounts/wildcards or federated/multi-hop issuers.
- `PUBLIC`, `anon`, `authenticated` lack `EXECUTE`; service_role only.

## Non-goals, blockers
1. Local signed checkpoint is not independent live issuer-current-state evidence.
2. SQL ALLOW verdict does not itself prevent revoke between read and external effect.
3. Hosted API, SDK and MCP still do not use this contract.
4. No work-bound signed receipt, action-parameter binding or proof of end-user adoption.
5. Current SQL uses privileged service role and is deliberately not a public verification API.
6. Synthetic isolated fixtures do not establish compatibility with all production schema migrations.

**Go/no-go:** Run isolated QA; a human code review is required before any production migration.
