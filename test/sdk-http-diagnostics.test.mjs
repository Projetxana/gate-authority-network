import test from 'node:test';
import assert from 'node:assert/strict';
import { GateClient } from '../packages/sdk/dist/index.js';
import { createMcpEffectGuard } from '../packages/mcp/src/effect-boundary.mjs';
const input={principal:'test:owner',actor:'test:agent',consistency:'bounded'};
const client=(body,status=503)=>new GateClient({endpoint:'https://fixture.invalid',
  fetchImpl:async()=>new Response(typeof body==='string'?body:JSON.stringify(body),{status})});

test('503 preserves safe observed diagnostics without creating a decision result',async()=>{
  const c=client({authority:'UNKNOWN',decision:'DENY',reason:'authority_store_unavailable',
    freshness:{source:'canonical-primary',fresh:false,snapshotAgeMs:null,maxStalenessMs:null}});
  await assert.rejects(c.verify(input),e=>{
    assert.equal(e.message,'gate_http_503');assert.equal(e.status,503);
    assert.equal(e.diagnostics.authority,'UNKNOWN');assert.equal(e.diagnostics.decision,'DENY');
    assert.equal(e.diagnostics.reason,'authority_store_unavailable');
    assert.equal(e.diagnostics.freshness.snapshotAgeMs,null);assert.equal(e.decision,undefined);
    assert.equal(Object.isFrozen(e.diagnostics),true);assert.equal(Object.isFrozen(e.diagnostics.freshness),true);
    return true;
  });
});
test('500 without a structured decision stays an error without fabricated UNKNOWN/DENY',async()=>{
  await assert.rejects(client({error:'internal_error'},500).verify(input),e=>{
    assert.equal(e.message,'internal_error');assert.equal(e.status,500);
    assert.deepEqual(e.diagnostics,{error:'internal_error'});return true;
  });
});
test('unknown text, secrets, headers, payload and prototype keys are not retained',async()=>{
  const secret='SYNTHETIC_SECRET_MUST_NOT_APPEAR';
  const c=client({error:secret,reason:secret,token:secret,principal:secret,action:{parameters:{key:secret}},
    freshness:{snapshotAt:secret,source:secret,snapshotAgeMs:secret,__proto__:{token:secret}}},403);
  await assert.rejects(c.verify(input),e=>{
    assert.equal(e.message,'gate_http_403');assert.deepEqual(e.diagnostics,{});
    assert.equal(JSON.stringify({message:e.message,...e,diagnostics:e.diagnostics}).includes(secret),false);
    return true;
  });
});
test('invalid JSON HTTP error retains status only; successful invalid JSON remains an error',async()=>{
  await assert.rejects(client('not-json').verify(input),e=>e.status===503&&e.message==='gate_invalid_json:503');
  await assert.rejects(client('not-json',200).verify(input),/gate_invalid_json:200/);
});
test('successful response preserves complete snapshot fields and existing action behavior',async()=>{
  const freshness={snapshotAt:'2026-11-06T17:00:00.123Z',snapshotAgeMs:25,effectiveSnapshotLimitMs:5000,
    ageMs:25,maxStalenessMs:null,leaseRemainingMs:60000,fresh:true};
  const c=client({authority:'VALID',decision:'ALLOW',freshness},200);
  const result=await c.verify({...input,action:{name:'test'}});
  assert.deepEqual(result.freshness,freshness);assert.deepEqual(result.action,{name:'test'});
});
test('all non-2xx answers block callback, even if an erroneous body says ALLOW',async()=>{
  for(const status of [401,403,429,500,503]){
    let effects=0;const gate=client({authority:'VALID',decision:'ALLOW',error:'internal_error'},status);
    const guard=createMcpEffectGuard({gate,...input});
    await assert.rejects(guard.enforceToolCall({toolName:'test'},()=>++effects));assert.equal(effects,0);
  }
});
test('transport errors are not converted to observed server decisions',async()=>{
  const transportError=new Error('synthetic offline');
  const c=new GateClient({endpoint:'https://fixture.invalid',fetchImpl:async()=>{throw transportError;}});
  await assert.rejects(c.verify(input),e=>e===transportError&&e.diagnostics===undefined);
});
test('safe diagnostics preserve SQL timestamp offsets and reject malformed values',async()=>{
  const c=client({reason:'canonical_snapshot_stale',freshness:{snapshotAt:'2026-11-06T17:00:00.123456+00:00',
    snapshotAgeMs:6000,effectiveSnapshotLimitMs:5000,fresh:false,isPrimary:true,ageMs:-1,maxStalenessMs:'secret'}});
  await assert.rejects(c.verify(input),e=>{
    assert.equal(e.diagnostics.freshness.snapshotAt,'2026-11-06T17:00:00.123456+00:00');
    assert.equal(e.diagnostics.freshness.snapshotAgeMs,6000);assert.equal(e.diagnostics.freshness.ageMs,undefined);
    assert.equal(e.diagnostics.freshness.maxStalenessMs,undefined);return true;
  });
});
