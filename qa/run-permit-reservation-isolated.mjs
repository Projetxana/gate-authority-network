#!/usr/bin/env node
// Docker-backed and ephemeral: synthetic keys, no network, no Supabase mutation.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {generateEs256KeyPair,signJwt} from '../src/jws.mjs';
import {buildBoundedWorkAdmissionV2} from '../src/build-bounded-work-admission-v2.mjs';
import {GATE_WORK_EVENT_TYP as EVT,GATE_WORK_CHECKPOINT_TYP as CP} from
 '../src/verify-bounded-work-issuer-evidence.mjs';
import {signReservedBoundedWorkPermitV1} from '../src/build-gate-bounded-work-permit-v1.mjs';
import {createBoundedWorkMcpEffectGuard,BoundedWorkEffectDenied} from
 '../packages/mcp/src/bounded-work-effect-boundary.mjs';
const container=process.env.STAGE18_DOCKER_CONTAINER;
assert.match(container??'',/^gate-stage18-permit-\d+$/);
const project='00000000-0000-4000-8000-000000000001';
const issuerId='00000000-0000-4000-8000-000000000011';
const issuer='urn:test:issuer',principal='user:test',actor='agent:test';
const pair=generateEs256KeyPair({kid:'qa-upstream-issuer'});
const gatePair=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});
const gatePublic={...gatePair.publicKey.export({format:'jwk'}),kid:'gate-ephemeral-review',alg:'ES256'};
const trusted={issuer:'gate:qa',audience:'mcp:local-resource',projectId:project,publicJwk:gatePublic};
const projectRow={id:project,status:'active'};
const issuerRow={id:issuerId,project_id:project,issuer,key_id:pair.publicJwk.kid,
  alg:'ES256',status:'active',public_jwk:pair.publicJwk,
  federation_export_id:null,principal_patterns:[principal]};
const args=['exec','-i',container,'psql','-X','-q','-t','-A','-U','postgres','-d','gate_qa','-v','ON_ERROR_STOP=1'];
function db(query){return execFileSync('docker',args,{input:query,encoding:'utf8',
  timeout:20000,stdio:['pipe','pipe','pipe']}).trim().split('\n').filter(Boolean);}
function lit(x){if(x===null)return 'NULL';if(typeof x==='number')return String(x);
  if(typeof x==='object')x=JSON.stringify(x);
  assert.equal(typeof x,'string');return "'"+x.replaceAll("'","''")+"'";}
function row(q){const out=db(`select row_to_json(x) from (select * from ${q}) x;`);
  assert.equal(out.length,1);return JSON.parse(out[0]);}
function candidate(work,seq,status='ACTIVE'){
 const ms=Date.now(),iat=Math.floor(ms/1000),scope={kind:'oauth-bounded-work',issuer,id:work};
 const until=new Date(ms+90000).toISOString();
 const base={iss:issuer,aud:`urn:gate:project:${project}`,iat,project_id:project,scope};
 const event={...base,jti:`${work}:evt:${seq}`,sequence:seq,status,principal,actor,
  valid_until:until,delegations:[{edgeId:`${work}:edge:${seq}`,issuer:principal,
  subject:actor,status:'ACTIVE',validUntil:until}],
  permissions:[{protocol:'mcp',name:'tools/call:write',resource:'res:one'}]};
 const checkpoint={...base,jti:`${work}:cp:${seq}`,checkpoint_seq:seq,
  accepted_seq:seq,not_after_ms:iat*1000+25000};
 return buildBoundedWorkAdmissionV2({eventJwt:signJwt({header:{alg:'ES256',typ:EVT,
  kid:pair.publicJwk.kid},payload:event,privateKey:pair.privateKey}),
  checkpointJwt:signJwt({header:{alg:'ES256',typ:CP,kid:pair.publicJwk.kid},
  payload:checkpoint,privateKey:pair.privateKey}),projectRow,issuerRow,
  expectedScope:scope,acceptedSeq:seq-1,nowMs:ms});
}
function admit(work,seq,status='ACTIVE'){
 const x=candidate(work,seq,status).params;
 const names=['p_project_id','p_authority_issuer_id','p_issuer','p_signing_kid',
  'p_expected_public_jwk','p_work_id','p_event_jti','p_checkpoint_jti',
  'p_sequence','p_status','p_principal','p_actor','p_valid_until',
  'p_event_issued_at','p_checkpoint_issued_at','p_checkpoint_not_after',
  'p_permissions','p_delegations','p_event_digest','p_checkpoint_digest'];
 const r=row(`public.gate_admit_bounded_work_v2(${names.map(n=>lit(x[n])).join(',')})`);
 assert.equal(r.accepted_sequence,seq);
}
const action={protocol:'mcp',name:'tools/call:write',resource:'res:one'};
const digest='a'.repeat(64);
function reserve(work='Work-A',resource='res:one',hash=digest){
 return row(`public.gate_reserve_bounded_work_effect_permit_DRAFT_v1(${[
  project,issuerId,work,principal,actor,'mcp','tools/call:write',resource,
  hash,trusted.audience].map(lit).join(',')})`);
}
function consume(r, override={}){
 const x={...r,...override};
 const params=[x.project_id,x.jti,x.authority_issuer_id,x.work_id,
  x.principal,x.actor,x.protocol,x.action_name,x.resource,x.input_sha256,
  x.audience,x.accepted_sequence];
 return db(`select public.gate_consume_bounded_work_effect_permit_DRAFT_v1(${params.map(lit).join(',')})::text;`)[0]==='true';
}
const expectDeny=(fn,label)=>{assert.throws(fn,/Command failed/);console.log(`PASS: ${label}`)};
// Install actual synthetic issuer public key instead of fixture's placeholder.
db(`update public.gate_authority_issuers set issuer=${lit(issuer)},
 key_id=${lit(pair.publicJwk.kid)},public_jwk=${lit(pair.publicJwk)}::jsonb
 where id=${lit(issuerId)}::uuid;`);
const signature='public.gate_consume_bounded_work_effect_permit_draft_v1(uuid,uuid,uuid,text,text,text,text,text,text,text,text,bigint)';
assert.deepEqual(db(`select has_function_privilege('anon',${lit(signature)},'EXECUTE')::text,
  has_function_privilege('authenticated',${lit(signature)},'EXECUTE')::text,
  has_function_privilege('service_role',${lit(signature)},'EXECUTE')::text;`),
  ['false|false|true']);
assert.deepEqual(db(`select has_table_privilege('service_role',
 'public.gate_bounded_work_permit_reservations_draft_v1','INSERT')::text;`),['false']);
console.log('PASS: permit consume RPC restricted to service_role; no direct journal INSERT.');
admit('Work-A',1);admit('Work-B',1);
const permit=reserve('Work-A');
assert.equal(permit.work_id,'Work-A');
const jwt=signReservedBoundedWorkPermitV1({trusted,reservation:permit,
  request:{principal,actor,authorityContext:{kind:'oauth-bounded-work',issuer,id:'Work-A'},
   action,inputSha256:digest},privateKey:gatePair.privateKey});
assert.equal(jwt.evidence.hostedIssuerProven,false);
assert.equal(consume(permit),true);
assert.equal(consume(permit),false);
console.log('PASS: signed GATE permit reserved and consumed exactly once.');
const oldA=reserve('Work-A');
assert.equal(consume(oldA,{work_id:'Work-B'}),false);
assert.equal(consume(oldA,{resource:'res:two'}),false);
assert.equal(consume(oldA,{input_sha256:'b'.repeat(64)}),false);
assert.equal(consume(oldA,{audience:'mcp:other-resource'}),false);
assert.equal(consume(oldA),true);
expectDeny(()=>reserve('Work-A','res:other'),'reserve rejects unsigned scope/resource permissions');
console.log('PASS: cross-work, resource, digest and audience substitutions rejected.');
// Revoke governing Work A after reservation. It MUST NOT be consumable afterward.
const pendingA=reserve('Work-A');
admit('Work-A',2,'REVOKED');
assert.equal(consume(pendingA),false);
expectDeny(()=>reserve('Work-A'),'Work-A cannot reserve after governing revocation');
const b=reserve('Work-B');assert.equal(consume(b),true);
console.log('PASS: Work A revoked after mint fails consume; independent Work B survives.');
const pendingB=reserve('Work-B');
db(`update public.gate_authority_issuers set status='revoked' where id=${lit(issuerId)}::uuid;`);
assert.equal(consume(pendingB),false);
expectDeny(()=>reserve('Work-B'),'issuer trust revocation blocks new reservations');
console.log('PASS: issuer revoked after mint prevents permit consumption.');
console.log('PASS: staged SQL permit reservation + GATE local JWS sign + current-state consumption; NO hosted endpoint or external tool effect.');
