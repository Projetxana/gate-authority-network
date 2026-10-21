#!/usr/bin/env node
// Strictly ephemeral QA: no Supabase URLs, keys, live services or external effects.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { generateEs256KeyPair, signJwt } from '../src/jws.mjs';
import { buildBoundedWorkAdmissionV2 } from '../src/build-bounded-work-admission-v2.mjs';
import { GATE_WORK_EVENT_TYP as EVT, GATE_WORK_CHECKPOINT_TYP as CP } from '../src/verify-bounded-work-issuer-evidence.mjs';

const container = process.env.STAGE18_DOCKER_CONTAINER;
assert.match(container ?? '', /^gate-stage18-guarded-[0-9]+$/);
const projectId = '00000000-0000-4000-8000-000000000001';
const issuerId = '00000000-0000-4000-8000-000000000011';
const issuer = 'urn:test:issuer';
const principal = 'user:test';
const actor = 'agent:test';
const pair = generateEs256KeyPair({ kid: 'stage18-guarded-key' });
const projectRow = { id: projectId, status: 'active' };
const issuerRow = { id: issuerId, project_id: projectId, issuer,
  key_id: pair.publicJwk.kid, alg: 'ES256', status: 'active',
  public_jwk: pair.publicJwk, federation_export_id: null,
  principal_patterns: [principal] };
const args = ['exec', '-i', container, 'psql', '-X', '-q', '-t', '-A',
  '-U', 'postgres', '-d', 'gate_qa', '-v', 'ON_ERROR_STOP=1'];
function db(sql) {
  return execFileSync('docker', args, { encoding: 'utf8', input: sql,
    stdio: ['pipe', 'pipe', 'pipe'], timeout: 20_000 }).trim().split('\n').filter(Boolean);
}
function sqlValue(v) {
  if (v === null) return 'NULL';
  if (typeof v === 'number') { assert(Number.isSafeInteger(v)); return String(v); }
  if (typeof v === 'object') v = JSON.stringify(v);
  assert.equal(typeof v, 'string');
  assert(!v.includes('\0'));
  return `'${v.replaceAll("'", "''")}'`;
}
function signedCandidate(work, sequence, status = 'ACTIVE') {
  const nowMs = Date.now();
  const iat = Math.floor(nowMs / 1000);
  const scope = { kind: 'oauth-bounded-work', issuer, id: work };
  const until = new Date(nowMs + 90_000).toISOString();
  const base = { iss: issuer, aud: `urn:gate:project:${projectId}`,
    iat, project_id: projectId, scope };
  const event = { ...base, jti: `${work}:e:${sequence}`, sequence, status,
    principal, actor, valid_until: until,
    delegations: [{ edgeId: `${work}:edge:${sequence}`, issuer: principal,
      subject: actor, status: 'ACTIVE', validUntil: until }],
    permissions: [{ protocol: 'mcp', name: 'tools/call:write', resource: 'res:one' }] };
  const checkpoint = { ...base, jti: `${work}:c:${sequence}`,
    checkpoint_seq: sequence, accepted_seq: sequence, not_after_ms: iat * 1000 + 25_000 };
  return buildBoundedWorkAdmissionV2({
    eventJwt: signJwt({header:{alg:'ES256',typ:EVT,kid:pair.publicJwk.kid},payload:event,privateKey:pair.privateKey}),
    checkpointJwt: signJwt({header:{alg:'ES256',typ:CP,kid:pair.publicJwk.kid},payload:checkpoint,privateKey:pair.privateKey}),
    projectRow, issuerRow, expectedScope: scope, acceptedSeq: sequence - 1, nowMs
  });
}
function admit(candidate) {
  assert.equal(candidate.evidence.effectAuthorized, false);
  const x = candidate.params;
  const names = ['p_project_id','p_authority_issuer_id','p_issuer','p_signing_kid',
    'p_expected_public_jwk','p_work_id','p_event_jti','p_checkpoint_jti',
    'p_sequence','p_status','p_principal','p_actor','p_valid_until',
    'p_event_issued_at','p_checkpoint_issued_at','p_checkpoint_not_after',
    'p_permissions','p_delegations','p_event_digest','p_checkpoint_digest'];
  const rows = db(`select row_to_json(t) from (select * from public.gate_admit_bounded_work_v2(${names.map(name=>sqlValue(x[name])).join(',')})) t;`);
  assert.equal(JSON.parse(rows[0]).accepted_sequence, x.p_sequence);
}
const effectParams = (work, effectId, resource='res:one') =>
  [projectId, issuerId, work, principal, actor, 'mcp', 'tools/call:write', resource, effectId];
function effectSql(work, effectId, resource='res:one') {
  return `select row_to_json(t) from (select * from public.gate_record_bounded_work_guarded_effect_DRAFT_v1(${effectParams(work,effectId,resource).map(sqlValue).join(',')})) t;`;
}
function guarded(work, effectId, resource='res:one') {
  const rows = db(effectSql(work,effectId,resource));
  assert.equal(rows.length,1);
  return JSON.parse(rows[0]);
}
function count() {
  return Number(db('select count(*) from public.gate_bounded_work_guarded_effects_DRAFT_v1;')[0]);
}
function expectDeny(work,effectId,resource='res:one') {
  assert.throws(() => guarded(work,effectId,resource), /Command failed/);
}
// Install real ephemeral issuer JWK into the disposable base fixture.
db(`update public.gate_authority_issuers set issuer=${sqlValue(issuer)},
  key_id=${sqlValue(pair.publicJwk.kid)},public_jwk=${sqlValue(pair.publicJwk)}::jsonb
  where id=${sqlValue(issuerId)}::uuid;`);
const acl = db(`select has_function_privilege('anon',
'public.gate_record_bounded_work_guarded_effect_draft_v1(uuid,uuid,text,text,text,text,text,text,text)', 'EXECUTE')::text,
 has_function_privilege('authenticated',
'public.gate_record_bounded_work_guarded_effect_draft_v1(uuid,uuid,text,text,text,text,text,text,text)', 'EXECUTE')::text,
 has_function_privilege('service_role',
'public.gate_record_bounded_work_guarded_effect_draft_v1(uuid,uuid,text,text,text,text,text,text,text)', 'EXECUTE')::text;`);
assert.deepEqual(acl, ['false|false|true']);
const tableAcl = db(`select has_table_privilege('service_role',
'public.gate_bounded_work_guarded_effects_draft_v1','INSERT')::text;`);
assert.deepEqual(tableAcl, ['false']);
console.log('PASS: guarded effect RPC is service_role-only; service_role cannot write journal directly.');

admit(signedCandidate('Work-A',1));
admit(signedCandidate('Work-B',1));
assert.throws(() => db(`set role anon; ${effectSql('Work-A','effect-anon')}`), /Command failed/);
assert.equal(count(), 0);
const serviceResult=db(`set role service_role; ${effectSql('Work-A','effect-a1')}`);
assert.equal(JSON.parse(serviceResult.at(-1)).applied, true);
assert.equal(count(), 1);
console.log('PASS: actual anon RPC call is rejected; actual service_role RPC call records the protected effect.');
assert.equal(guarded('Work-A','effect-a1').applied, false);
assert.equal(count(),1);
console.log('PASS: valid signed Work-A performs one database-side effect; retry is idempotent.');
expectDeny('Work-B','effect-a1');
expectDeny('Work-A','effect-bad-resource','res:two');
expectDeny('Work-C','effect-missing-work');
assert.equal(count(),1);
console.log('PASS: different work, wrong resource and absent work perform no effect.');
admit(signedCandidate('Work-A',2,'REVOKED'));
expectDeny('Work-A','effect-after-revocation');
assert.equal(guarded('Work-B','effect-b1').applied,true);
assert.equal(count(),2);
console.log('PASS: revoked Work-A denied; independent Work-B still writes.');

// Concurrent transaction A records Work-B effect and holds the locks for ~2s.
// Revocation UPDATE in B must wait for A COMMIT; AFTER B commits no new effect.
const sqlA = `BEGIN;\n${effectSql('Work-B','effect-b-locked')}\n\\echo GATE_LOCK_HELD\nselect pg_sleep(2.0);\nCOMMIT;\n`;
const childA = spawn('docker', args, { stdio: ['pipe','pipe','pipe'] });
let outA='',errA='';
let announced=false;
let signalResolve,signalReject;
const signal = new Promise((resolve,reject)=>{signalResolve=resolve;signalReject=reject;});
childA.stdout.on('data',d=>{outA+=String(d);if(!announced && outA.includes('GATE_LOCK_HELD')){
  announced=true;signalResolve();
}});
childA.stderr.on('data',d=>{errA+=String(d);});
const finished = new Promise((resolve,reject)=>{childA.on('error',reject);childA.on('close',code=>code===0?resolve():reject(new Error(`A session exited ${code}: ${errA}`)));});
childA.stdin.end(sqlA);
await Promise.race([signal, new Promise((_,reject)=>setTimeout(()=>reject(new Error('lock marker timeout')),10000))]);
const start=Date.now();
const update = `update public.gate_authority_issuers set status='revoked' where id=${sqlValue(issuerId)}::uuid;`;
const childB=spawn('docker',[...args.slice(0,3),...args.slice(3),'-c',update],{stdio:['ignore','pipe','pipe']});
let errB='';childB.stderr.on('data',d=>errB+=String(d));
const doneB=new Promise((resolve,reject)=>{childB.on('error',reject);childB.on('close',code=>code===0?resolve():reject(new Error(`B session exited ${code}: ${errB}`)));});
await Promise.all([finished,doneB]);
const elapsed=Date.now()-start;
assert(elapsed>=900,`issuer revocation unexpectedly bypassed guarded effect lock: ${elapsed}ms`);
assert.equal(count(),3);
expectDeny('Work-B','effect-after-trust-revoke');
assert.equal(count(),3);
console.log('PASS: concurrent issuer revocation waits for guarded-effect transaction and then denies all subsequent writes.');
console.log('PASS: signed JWT -> atomic state -> guarded database journal; NOT external MCP enforcement.');
