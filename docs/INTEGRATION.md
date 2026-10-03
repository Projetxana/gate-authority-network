# Integration contract

## Recommended enforcement order

```text
1. Authenticate credential / actor
2. Evaluate business policy (or prepare AuthZEN request)
3. GATE live-authority verification
4. Execute effect only if all required checks permit
```

For destructive/high-value actions, use `strict` or a very small bounded freshness window.

## Example with an existing PDP

```ts
const policy = await authzen.evaluate({ subject, action, resource, context });
if (!policy.decision) return deny('policy');

const authority = await gate.verify({
  principal: subject.id,
  actor: context.agent.id,
  action: { protocol: 'mcp', name: action.name, resource: resource.id },
  consistency: action.risk === 'high' ? 'strict' : 'bounded',
  maxStalenessMs: action.risk === 'high' ? undefined : 200
});

if (authority.decision !== 'ALLOW') return deny(authority.reason);
return execute();
```

## Failure semantics

- Invalid known authority: `INVALID / DENY`.
- State too old for requested bound: `UNKNOWN / DENY`.
- Strict verification cannot reach authoritative state: `UNKNOWN / DENY`.

Callers may choose a different fallback for genuinely read-only/low-risk operations, but GATE should report the uncertainty rather than converting it into `VALID`.
