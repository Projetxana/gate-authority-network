import test from 'node:test';
import assert from 'node:assert/strict';
import {createMcpEffectGuard} from '@gate-avn/mcp/effect-boundary';

const permit = {authority:'VALID', decision:'ALLOW', servedBy:'test'};
function fixture({principal='user:owner',actor='agent:worker',consistency='strict',maxStalenessMs=100,answer=permit,verifyError=null}={}) {
  const calls=[];
  let effects=0;
  const gate={async verify(request){calls.push(request);if(verifyError)throw verifyError;return answer;}};
  const guard=createMcpEffectGuard({gate,principal,actor,consistency,maxStalenessMs});
  return {guard,calls,effects:()=>effects,effect:async()=>{effects++;return 'effect';}};
}

test('a configured principal cannot be substituted by caller parameters', async()=>{
  const x=fixture();
  await assert.rejects(x.guard.enforceToolCall({toolName:'write',principal:'user:attacker'},x.effect),
    e=>e?.code==='GATE_AUTHORITY_DENIED' && e?.decision?.decision==='DENY');
  assert.equal(x.calls.length,0);
  assert.equal(x.effects(),0);
});

test('a configured actor cannot be substituted by caller parameters',async()=>{
  const x=fixture();
  await assert.rejects(x.guard.enforceToolCall({toolName:'write',actor:'agent:attacker'},x.effect),
    e=>e?.code==='GATE_AUTHORITY_DENIED' && e?.decision?.decision==='DENY');
  assert.equal(x.calls.length,0);
  assert.equal(x.effects(),0);
});

test('a pinned strict contract cannot be downgraded to bounded by the caller',async()=>{
  const x=fixture();
  await assert.rejects(x.guard.enforceToolCall({toolName:'write',consistency:'bounded'},x.effect),
    e=>e?.code==='GATE_AUTHORITY_DENIED' && e?.decision?.decision==='DENY');
  assert.equal(x.calls.length,0);
  assert.equal(x.effects(),0);
});

test('caller cannot widen a pinned maximum staleness budget',async()=>{
  const x=fixture({consistency:'bounded',maxStalenessMs:100});
  const result=await x.guard.enforceToolCall({toolName:'write',maxStalenessMs:500},x.effect);
  assert.equal(result.result,'effect');
  assert.equal(x.calls.length,1);
  assert.equal(x.calls[0].maxStalenessMs,100);
  assert.equal(x.effects(),1);
});

test('caller may request a stricter staleness limit and compatible identities',async()=>{
  const x=fixture({consistency:'bounded',maxStalenessMs:100});
  await x.guard.enforceToolCall({toolName:'write',principal:'user:owner',actor:'agent:worker',maxStalenessMs:50},x.effect);
  assert.equal(x.calls[0].maxStalenessMs,50);
  assert.equal(x.calls[0].consistency,'bounded');
  assert.equal(x.effects(),1);
});

for(const response of [
  {authority:'INVALID',decision:'ALLOW'},
  {authority:'UNKNOWN',decision:'ALLOW'},
  {decision:'ALLOW'},
  {authority:'VALID',decision:'MAYBE'},
  null
]){
  test(`contradictory/malformed decision fails closed: ${JSON.stringify(response)}`,async()=>{
    const x=fixture({answer:response});
    await assert.rejects(x.guard.enforceToolCall({toolName:'write'},x.effect),
      e=>e?.code==='GATE_AUTHORITY_DENIED' && e?.decision?.decision==='DENY');
    assert.equal(x.effects(),0);
  });
}

test('network unavailable never executes a protected callback',async()=>{
  const x=fixture({verifyError:new Error('upstream unavailable')});
  await assert.rejects(x.guard.enforceToolCall({toolName:'write'},x.effect),/upstream unavailable/);
  assert.equal(x.effects(),0);
});

test('a negative authority decision never executes the protected callback',async()=>{
  const x=fixture({answer:{authority:'INVALID',decision:'DENY'}});
  await assert.rejects(x.guard.enforceToolCall({toolName:'write'},x.effect),e=>e?.code==='GATE_AUTHORITY_DENIED');
  assert.equal(x.effects(),0);
});
