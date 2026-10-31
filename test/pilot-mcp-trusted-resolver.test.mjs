import test from 'node:test';
import assert from 'node:assert/strict';
import {createMcpEffectGuard} from '@gate-avn/mcp/effect-boundary';

function setup({principal, actor}) {
  let verifies = 0;
  let effects = 0;
  const guard = createMcpEffectGuard({
    gate: {async verify() {
      verifies++;
      return {authority:'VALID', decision:'ALLOW'};
    }},
    principal,
    actor,
    consistency: 'bounded'
  });
  return {
    guard,
    state: () => ({verifies, effects}),
    effect: async () => {effects++; return 'executed';}
  };
}

for (const missing of [undefined, null, '', '   ']) {
  test(`configured principal resolver (${JSON.stringify(missing)}) cannot fall back to caller identity`, async () => {
    const s = setup({principal: async () => missing, actor:'agent:trusted'});
    await assert.rejects(
      s.guard.enforceToolCall({toolName:'write', principal:'user:attacker'}, s.effect),
      e => e?.code === 'GATE_AUTHORITY_DENIED' &&
           e?.decision?.reason === 'trusted_principal_unavailable');
    assert.deepEqual(s.state(), {verifies:0,effects:0});
  });
  test(`configured actor resolver (${JSON.stringify(missing)}) cannot fall back to caller identity`, async () => {
    const s = setup({principal:'user:trusted', actor: async () => missing});
    await assert.rejects(
      s.guard.enforceToolCall({toolName:'write', actor:'agent:attacker'}, s.effect),
      e => e?.code === 'GATE_AUTHORITY_DENIED' &&
           e?.decision?.reason === 'trusted_actor_unavailable');
    assert.deepEqual(s.state(), {verifies:0,effects:0});
  });
}

test('configured trusted identity resolvers still permit a matching call', async () => {
  const s = setup({principal: async () => 'user:trusted', actor: async () => 'agent:trusted'});
  const result = await s.guard.enforceToolCall({toolName:'write', principal:'user:trusted', actor:'agent:trusted'}, s.effect);
  assert.equal(result.result, 'executed');
  assert.deepEqual(s.state(), {verifies:1,effects:1});
});
