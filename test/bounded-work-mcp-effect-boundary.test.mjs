import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  createBoundedWorkMcpEffectGuard,
  BOUNDED_WORK_PERMIT_TYP,
  BoundedWorkEffectDenied
} from '../packages/mcp/src/bounded-work-effect-boundary.mjs';

const {privateKey,publicKey}=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});
const pub={...publicKey.export({format:'jwk'}),kid:'gate-test-kid',alg:'ES256'};
const other=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});
const scopeA={kind:'oauth-bounded-work',issuer:'issuer:business',id:'A'};
const scopeB={...scopeA,id:'B'};
const now=Date.parse('2026-10-21T14:00:00Z');
const sec=Math.floor(now/1000);
const trust={projectId:'00000000-0000-4000-8000-000000000001',issuer:'gate:qa',
  audience:'mcp:local-resource',publicJwk:pub};
const sign=(payload,key=privateKey)=>{
  const a=Buffer.from(JSON.stringify({alg:'ES256',typ:BOUNDED_WORK_PERMIT_TYP,kid:pub.kid})).toString('base64url');
  const b=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig=crypto.sign('sha256',Buffer.from(`${a}.${b}`),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
  return `${a}.${b}.${sig}`;
};
let id=0;
function fixture({modify=(p)=>p,authorizeOverride,consumeOverride,scope=scopeA,key=privateKey}={}) {
  let minted=null, called=0;
  const used=new Set();
  const authorize=async req=>{
    const permit={iss:trust.issuer,aud:trust.audience,jti:`permit-${++id}`,
      project_id:trust.projectId,principal:req.principal,actor:req.actor,
      authority_context:req.authorityContext,action:req.action,
      input_sha256:req.inputSha256,decision:'ALLOW',authority:'VALID',
      accepted_seq:1,iat:sec,exp:sec+4,checkpoint_not_after_ms:now+4500};
    minted=sign(modify(permit),key);
    return authorizeOverride ? authorizeOverride(req,minted) : {permitJwt:minted};
  };
  const consume=consumeOverride ?? (async ({jti})=>{
    if(used.has(jti))return false;
    used.add(jti);return true;
  });
  const guard=createBoundedWorkMcpEffectGuard({trust,
    trustedPrincipal:'person:1',trustedActor:'agent:1',trustedAuthorityContext:scope,
    authorize,consumePermit:consume,clock:()=>now,maxPermitLeaseSec:5});
  const effect=async input=>{called++;return {input};};
  return {guard,effect,used,get called(){return called},get minted(){return minted}};
}
const run=(f,options={})=>f.guard.enforceToolCall({toolName:'send_email',resource:'mailbox:1',
  input:{to:'mailbox:1',body:'hello'},...options},f.effect);
const denied=async p=>assert.rejects(p,e=>e instanceof BoundedWorkEffectDenied &&
  e.code==='GATE_BOUNDED_WORK_EFFECT_DENIED');

test('only a signed, exact-work, exact-action permit can allow the MCP callback',async()=>{
  const f=fixture(); const result=await run(f);
  assert.equal(result.decision.decision,'ALLOW');
  assert.equal(result.decision.source,'signed-bounded-work-preview');
  assert.equal(f.called,1);
  assert.deepEqual(result.result.input,{body:'hello',to:'mailbox:1'});
  assert.equal(Object.isFrozen(result.result.input),true);
});
test('a legacy graph ALLOW without a signed permit is never enough',async()=>{
  const f=fixture({authorizeOverride:()=>({authority:'VALID',decision:'ALLOW'})});
  await denied(run(f)); assert.equal(f.called,0);
});
test('a signed permit for unrelated Work B cannot authorize Work A',async()=>{
  const f=fixture({modify:p=>({...p,authority_context:scopeB})});
  await denied(run(f));assert.equal(f.called,0);
});
test('a permit for wrong principal, actor, tenant or resource is refused',async()=>{
  for(const modification of [
    p=>({...p,principal:'person:other'}),p=>({...p,actor:'agent:other'}),
    p=>({...p,project_id:'another-project'}),p=>({...p,action:{...p.action,resource:'mailbox:other'}})
  ]){const f=fixture({modify:modification});await denied(run(f));assert.equal(f.called,0);}
});
test('a permit for one input digest cannot authorize altered parameters',async()=>{
  const f=fixture({modify:p=>({...p,input_sha256:'0'.repeat(64)})});
  await denied(run(f));assert.equal(f.called,0);
});
test('an unsigned or modified token is denied',async()=>{
  const f=fixture({authorizeOverride:(_req,token)=>({permitJwt:token.slice(0,-2)+'zz'})});
  await denied(run(f));assert.equal(f.called,0);
});
test('a JWT from an untrusted key, even with the matching KID, is denied',async()=>{
  const f=fixture({key:other.privateKey});await denied(run(f));assert.equal(f.called,0);
});
test('expired permit and stale issuer checkpoint both deny',async()=>{
  for(const modification of [p=>({...p,exp:sec-1}),
    p=>({...p,checkpoint_not_after_ms:now-1}),
    p=>({...p,checkpoint_not_after_ms:now+31_000}),
    p=>({...p,checkpoint_not_after_ms:now+500}),
    p=>({...p,iat:sec+6})]){
    const f=fixture({modify:modification});await denied(run(f));assert.equal(f.called,0);
  }
});
test('extra unrecognized restrictions cannot be ignored',async()=>{
  const f=fixture({modify:p=>({...p,require_fresh_upstream:true})});
  await denied(run(f));assert.equal(f.called,0);
});
test('failure to persist an atomic replay token must fail closed',async()=>{
  const f=fixture({consumeOverride:async()=>false});await denied(run(f));assert.equal(f.called,0);
});
test('a consumed signed permit cannot execute the effect twice',async()=>{
  const used=new Set();let fixed;
  const f=fixture({authorizeOverride:(_req,t)=>({permitJwt:fixed??(fixed=t)}),
    consumeOverride:async({jti})=>{if(used.has(jti))return false;used.add(jti);return true;}});
  await run(f); await denied(run(f));assert.equal(f.called,1);
});
test('unverifiable JSON input cannot be silently bound as an effect',async()=>{
  const f=fixture();await denied(run(f,{input:{to:'mailbox:1',amount:NaN}}));
  assert.equal(f.called,0);
});
test('effect errors are not mislabeled as authorization denials',async()=>{
  const f=fixture();
  await assert.rejects(f.guard.enforceToolCall({toolName:'send_email',resource:'mailbox:1',input:{}},
    async()=>{throw new Error('destination_mutated_then_failed');}), /destination_mutated_then_failed/);
});
