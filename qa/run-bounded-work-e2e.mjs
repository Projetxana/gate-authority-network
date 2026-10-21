#!/usr/bin/env node
// LOCAL QA ONLY: synthetic ES256 JWS -> verified adapter -> disposable Postgres.
// Never connect to Supabase; never accept a customer key or live DB URL.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateEs256KeyPair, signJwt } from '../src/jws.mjs';
import { buildBoundedWorkAdmissionV2 } from '../src/build-bounded-work-admission-v2.mjs';
import { GATE_WORK_EVENT_TYP, GATE_WORK_CHECKPOINT_TYP } from '../src/verify-bounded-work-issuer-evidence.mjs';

const container=process.env.STAGE18_DOCKER_CONTAINER;
assert.match(container??'',/^gate-stage18-e2e-[a-zA-Z0-9-]+$/);
const p='00000000-0000-4000-8000-000000000001';
const issuerId='00000000-0000-4000-8000-000000000011';
const issuer='urn:test:issuer';
const principal='user:test';
const actor='agent:test';
const pair=generateEs256KeyPair({kid:'stage18-e2e-key'});
const projectRow={id:p,status:'active'};
const issuerRow={id:issuerId,project_id:p,issuer,key_id:pair.publicJwk.kid,
  alg:'ES256',status:'active',public_jwk:pair.publicJwk,
  federation_export_id:null,principal_patterns:[principal]};
function db(query) {
  const ret=execFileSync('docker',['exec','-i',container,'psql','-X','-q','-t','-A',
    '-U','postgres','-d','gate_qa','-v','ON_ERROR_STOP=1'],{
    encoding:'utf8',input:query,stdio:['pipe','pipe','pipe'],timeout:20_000
  }).trim();
  return ret.split('\n').filter(Boolean);
}
function sqlVal(v) {
  if(v===null)return 'NULL';
  if(typeof v==='number') { assert(Number.isSafeInteger(v)); return String(v); }
  if(typeof v==='object')v=JSON.stringify(v);
  assert.equal(typeof v,'string');
  assert(!v.includes('\0'));
  return `'${v.replaceAll("'","''")}'`;
}
function prepare(work,sequence,status='ACTIVE') {
  const ms=Date.now(),s=Math.floor(ms/1000);
  const scope={kind:'oauth-bounded-work',issuer,id:work};
  const validUntil=new Date(ms+90_000).toISOString();
  const base={iss:issuer,aud:`urn:gate:project:${p}`,iat:s,project_id:p,scope};
  const event={...base,jti:`${work}:e:${sequence}`,sequence,status,principal,actor,
    valid_until:validUntil,
    delegations:[{edgeId:`${work}:edge:${sequence}`,issuer:principal,subject:actor,
      status:'ACTIVE',validUntil}],
    permissions:[{protocol:'mcp',name:'tools/call:write',resource:'res:one'}]};
  const checkpoint={...base,jti:`${work}:c:${sequence}`,checkpoint_seq:sequence,
    accepted_seq:sequence,not_after_ms:s*1000+25_000};
  const eventJwt=signJwt({header:{alg:'ES256',typ:GATE_WORK_EVENT_TYP,kid:pair.publicJwk.kid},
    payload:event,privateKey:pair.privateKey});
  const checkpointJwt=signJwt({header:{alg:'ES256',typ:GATE_WORK_CHECKPOINT_TYP,kid:pair.publicJwk.kid},
    payload:checkpoint,privateKey:pair.privateKey});
  return buildBoundedWorkAdmissionV2({eventJwt,checkpointJwt,
    projectRow,issuerRow,expectedScope:scope,acceptedSeq:sequence-1,nowMs:ms});
}
function admit(candidate) {
  assert.equal(candidate.evidence.effectAuthorized,false);
  assert.equal(candidate.evidence.canonicalStorageCommitted,false);
  const x=candidate.params;
  const order=['p_project_id','p_authority_issuer_id','p_issuer','p_signing_kid',
    'p_expected_public_jwk','p_work_id','p_event_jti','p_checkpoint_jti',
    'p_sequence','p_status','p_principal','p_actor','p_valid_until',
    'p_event_issued_at','p_checkpoint_issued_at','p_checkpoint_not_after',
    'p_permissions','p_delegations','p_event_digest','p_checkpoint_digest'];
  const literal=order.map(k=>sqlVal(x[k]));
  const out=db(`select row_to_json(t) from (select * from public.gate_admit_bounded_work_v2(${literal.join(',')})) t;`);
  assert.equal(out.length,1);
  const result=JSON.parse(out[0]);
  assert.equal(result.accepted_sequence,x.p_sequence);
  assert.equal(result.accepted_status,x.p_status);
}
function verify(work,resource='res:one') {
  const out=db(`select row_to_json(t) from (select * from public.gate_verify_bounded_work_effect_v1(
    ${[p,issuerId,work,principal,actor,'mcp','tools/call:write',resource].map(sqlVal).join(',')}
  )) t;`);
  assert.equal(out.length,1);
  return JSON.parse(out[0]);
}
function expect(work,decision,reason=null,resource='res:one') {
  const r=verify(work,resource);
  assert.equal(r.decision,decision,`${work}: ${JSON.stringify(r)}`);
  if(reason!==null)assert.equal(r.reason,reason,`${work}: ${JSON.stringify(r)}`);
  console.log(`PASS: ${work} -> ${r.authority}/${r.decision} (${r.reason})`);
}
// Fixture bootstrap uses the official minimal v2 schema; replace fake JWK with
// the actual ephemeral ES256 public key before ingesting a real signed fixture.
db(`update public.gate_authority_issuers set issuer=${sqlVal(issuer)},
    key_id=${sqlVal(pair.publicJwk.kid)},public_jwk=${sqlVal(pair.publicJwk)}::jsonb
  where id=${sqlVal(issuerId)}::uuid;`);
const acl=db(`select has_function_privilege('anon',
  'public.gate_verify_bounded_work_effect_v1(uuid,uuid,text,text,text,text,text,text)',
  'EXECUTE')::text,has_function_privilege('authenticated',
  'public.gate_verify_bounded_work_effect_v1(uuid,uuid,text,text,text,text,text,text)',
  'EXECUTE')::text,has_function_privilege('service_role',
  'public.gate_verify_bounded_work_effect_v1(uuid,uuid,text,text,text,text,text,text)',
  'EXECUTE')::text;`);
assert.deepEqual(acl,['false|false|true']);
console.log('PASS: read RPC denies anon/authenticated and allows service_role only.');
const A1=prepare('Work-A',1);admit(A1);
const B1=prepare('Work-B',1);admit(B1);
expect('Work-A','ALLOW');
expect('Work-B','ALLOW');
expect('Work-A','DENY','effect_outside_signed_permissions','res:two');
expect('Work-C','DENY','work_or_issuer_trust_unavailable');
const A2=prepare('Work-A',2,'REVOKED');admit(A2);
expect('Work-A','DENY','governing_work_revoked');
expect('Work-B','ALLOW');
assert.throws(()=>admit(A1),'replay of already-accepted Work A must be rejected');
expect('Work-A','DENY','governing_work_revoked');
console.log('PASS: atomic DB rejects replay of an already consumed event.');
// Swapping the same key-id's registered JWK must invalidate current trust.
const foreignKey=generateEs256KeyPair({kid:pair.publicJwk.kid});
db(`update public.gate_authority_issuers set public_jwk=${sqlVal(foreignKey.publicJwk)}::jsonb
  where id=${sqlVal(issuerId)}::uuid;`);
expect('Work-B','DENY','work_or_issuer_trust_unavailable');
db(`update public.gate_authority_issuers set public_jwk=${sqlVal(pair.publicJwk)}::jsonb
  where id=${sqlVal(issuerId)}::uuid;`);
expect('Work-B','ALLOW');
console.log('PASS: same-KID public key replacement fails closed.');
// Simulate an expired lease in this disposable fixture (not signed evidence).
db(`update public.gate_bounded_work_state_v2
  set checkpoint_not_after=pg_catalog.clock_timestamp()-interval '1 second'
  where work_id='Work-B';`);
expect('Work-B','DENY','issuer_checkpoint_stale');
console.log('PASS: stale signed checkpoint cannot authorize effects.');
// Independent global trust revocation overrides even a fresh signed grant.
db(`update public.gate_authority_issuers set status='revoked'
    where id=${sqlVal(issuerId)}::uuid;`);
expect('Work-B','DENY','work_or_issuer_trust_unavailable');
console.log('PASS: signed JWS -> atomic storage -> scoped read; no effect executed.');
