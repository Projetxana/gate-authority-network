import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { signReservedBoundedWorkPermitV1 } from '../src/build-gate-bounded-work-permit-v1.mjs';
import { createBoundedWorkMcpEffectGuard, BoundedWorkEffectDenied } from
  '../packages/mcp/src/bounded-work-effect-boundary.mjs';

const pair=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});
const pub={...pair.publicKey.export({format:'jwk'}),kid:'gate-review-key',alg:'ES256'};
const trusted={issuer:'gate:qa',audience:'mcp:local-resource',
  projectId:'00000000-0000-4000-8000-000000000001',publicJwk:pub};
const authorityContext={kind:'oauth-bounded-work',issuer:'urn:test:issuer',id:'Work-A'};
const request={principal:'user:test',actor:'agent:test',authorityContext,
  action:{protocol:'mcp',name:'tools/call:write',resource:'res:one'},
  inputSha256:'a'.repeat(64)};
function reservation(nowMs=Date.now()) {
  const s=Math.floor(nowMs/1000);
  return {jti:crypto.randomUUID(),project_id:trusted.projectId,
    authority_issuer_id:'00000000-0000-4000-8000-000000000011',
    work_id:authorityContext.id,principal:request.principal,actor:request.actor,
    protocol:request.action.protocol,action_name:request.action.name,
    resource:request.action.resource,input_sha256:request.inputSha256,
    audience:trusted.audience,accepted_sequence:1,issued_at_seconds:s,
    expires_at_seconds:s+4,checkpoint_not_after_ms:s*1000+25000};
}
const sign=(r,req=request,t=trusted,privateKey=pair.privateKey,nowMs=Date.now())=>
  signReservedBoundedWorkPermitV1({trusted:t,reservation:r,
    request:req,privateKey,nowMs});

test('trusted, matching atomic reservation mints signed bound permit, not hosted proof',()=>{
  const s=sign(reservation());
  assert.equal(s.permitJwt.split('.').length,3);
  assert.equal(s.evidence.hostedIssuerProven,false);
  assert.equal(s.evidence.remoteResourceEnforcementProven,false);
});
test('client-replaced fields or other work are rejected before signing',()=>{
  for(const mismatch of [
    r=>({...r,project_id:'00000000-0000-4000-8000-000000000002'}),
    r=>({...r,work_id:'Work-B'}),r=>({...r,input_sha256:'b'.repeat(64)}),
    r=>({...r,resource:'res:other'}),r=>({...r,audience:'mcp:other'}),
    r=>({...r,accepted_sequence:0}),r=>({...r,principal:'attacker'})
  ]) assert.throws(()=>sign(mismatch(reservation())),/untrusted_or_mismatched_sql_reservation/);
});
test('expired or over-long lease and stale checkpoint cannot be signed',()=>{
  const nowMs=Date.now();
  const expired={...reservation(nowMs),expires_at_seconds:Math.floor(nowMs/1000)-1};
  assert.throws(()=>sign(expired,request,trusted,pair.privateKey,nowMs),/sql_reservation_expired_or_invalid/);
  const tooLong={...reservation(nowMs),expires_at_seconds:Math.floor(nowMs/1000)+20};
  assert.throws(()=>sign(tooLong,request,trusted,pair.privateKey,nowMs),/sql_reservation_expired_or_invalid/);
});
test('mismatched GATE private and pinned public key must not mint usable permit',()=>{
  const foreign=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});
  assert.throws(()=>sign(reservation(),request,trusted,foreign.privateKey),/invalid_signature/);
});
test('work-specific signed permit can be consumed only once by the experimental MCP guard',async()=>{
  const consumed=new Set();let writes=0;
  const fixedReservation=reservation();
  const guard=createBoundedWorkMcpEffectGuard({
    trust:trusted,trustedPrincipal:request.principal,trustedActor:request.actor,
    trustedAuthorityContext:authorityContext,
    authorize:async q=>{
      const r={...fixedReservation};
      r.input_sha256=q.inputSha256;
      r.action_name=q.action.name;
      r.resource=q.action.resource;
      return sign(r,{...request,inputSha256:q.inputSha256},trusted,pair.privateKey);
    },
    consumePermit:async ({jti})=>{
      if(consumed.has(jti))return false;
      consumed.add(jti);return true;
    },maxPermitLeaseSec:5
  });
  const output=await guard.enforceToolCall({toolName:'write',resource:'res:one',input:{amount:1}},async()=>{writes++;return true;});
  assert.equal(output.result,true);
  await assert.rejects(guard.enforceToolCall({toolName:'write',resource:'res:one',input:{amount:1}},
    async()=>{writes++;}),e=>e instanceof BoundedWorkEffectDenied);
  assert.equal(writes,1);
});
