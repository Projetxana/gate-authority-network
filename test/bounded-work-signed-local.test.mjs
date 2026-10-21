import test from 'node:test';
import assert from 'node:assert/strict';
import { generateEs256KeyPair, signJwt } from '../src/jws.mjs';
import { verifySignedBoundedWorkLocal as verify } from '../src/verify-bounded-work-signed-local.mjs';
import {
  GATE_WORK_EVENT_TYP as EVT, GATE_WORK_CHECKPOINT_TYP as CP
} from '../src/verify-bounded-work-issuer-evidence.mjs';

const pair = generateEs256KeyPair({kid:'scoped-bridge-local-key'});
const other = generateEs256KeyPair({kid:'other-local-key'});
const A = {kind:'oauth-bounded-work',issuer:'https://issuer.example',id:'work-A'};
const B = {...A,id:'work-B'};
const p = 'user:person-1', a = 'agent:one';
const action = {protocol:'mcp',name:'tools/call',resource:'res:1'};
const trust = {issuer:A.issuer,projectId:'project-1',audience:'gate-local',
  publicJwk:pair.publicJwk,lifecycle:{status:'active'}};
const grant = () => ({protocol:action.protocol,name:action.name,resource:action.resource});

function fixture({scope=A, ev={}, cp={}, request={}, privileged={}, eventKey=pair, checkpointKey=pair}={}) {
  const nowMs = Date.now();
  const sec = Math.floor(nowMs/1000);
  const base = {iss:trust.issuer,aud:trust.audience,iat:sec,project_id:trust.projectId};
  const until = new Date(nowMs+60_000).toISOString();
  const edge = (edgeId,status='ACTIVE') => ({edgeId,issuer:p,subject:a,status,validUntil:until});
  const event = {...base,jti:'evt-1',scope,sequence:1,status:'ACTIVE',principal:p,actor:a,
    valid_until:until,delegations:[edge('A1')],permissions:[grant()],...ev};
  const checkpoint = {...base,jti:'cp-1',scope,checkpoint_seq:1,accepted_seq:1,
    not_after_ms:sec*1000+20_000,...cp};
  const eventJwt=signJwt({header:{typ:EVT,alg:'ES256',kid:eventKey.publicJwk.kid},
    payload:event,privateKey:eventKey.privateKey});
  const checkpointJwt=signJwt({header:{typ:CP,alg:'ES256',kid:checkpointKey.publicJwk.kid},
    payload:checkpoint,privateKey:checkpointKey.privateKey});
  return {request:{principal:p,actor:a,authorityContext:scope,action,...request},
    privileged:{trust,expectedScope:scope,previousAcceptedSeq:0,...privileged},
    eventJwt,checkpointJwt,nowMs};
}

function expectDeny(result, authority='UNKNOWN') {
  assert.equal(result.decision,'DENY');
  assert.equal(result.authority,authority);
  assert.equal(result.workScopeEvidence.hostedEnforcementVerified,false);
}

test('signed, scoped direct grant + exact action produces local-only ALLOW',()=>{
  const result=verify(fixture());
  assert.equal(result.decision,'ALLOW');
  assert.equal(result.authority,'VALID');
  assert.deepEqual(result.selectedEdges,['A1']);
  assert.equal(result.workScopeEvidence.signedArtifactsVerified,true);
  assert.equal(result.workScopeEvidence.canonicalStorageCommitted,false);
  assert.equal(result.workScopeEvidence.independentIssuerCurrentStateProven,false);
  assert.equal(result.receipt,undefined);
});

test('revoked governing work cannot be rescued by its active delegation',()=>{
  const result=verify(fixture({ev:{status:'REVOKED'}}));
  expectDeny(result,'INVALID');
  assert.equal(result.reason,'governing_work_revoked');
});

test('unrelated Work B cannot rescue revoked Work A, but B independently ALLOWs',()=>{
  const denied=verify(fixture({ev:{status:'REVOKED'}}));
  expectDeny(denied,'INVALID');
  const permitted=verify(fixture({scope:B}));
  assert.equal(permitted.decision,'ALLOW');
});

test('independent alternate path for the SAME work remains valid',()=>{
  const until=new Date(Date.now()+60_000).toISOString();
  const result=verify(fixture({ev:{delegations:[
    {edgeId:'A1',issuer:p,subject:a,status:'REVOKED',validUntil:until},
    {edgeId:'A2',issuer:p,subject:a,status:'ACTIVE',validUntil:until}
  ]}}));
  assert.equal(result.decision,'ALLOW');
  assert.deepEqual(result.selectedEdges,['A2']);
});

test('principal mismatch in verified event is DENY',()=>{
  expectDeny(verify(fixture({request:{principal:'user:another'}})),'INVALID');
});

test('actor mismatch in verified event is DENY',()=>{
  expectDeny(verify(fixture({request:{actor:'agent:attacker'}})),'INVALID');
});

test('request scope not in trusted expected scope is DENY',()=>{
  expectDeny(verify(fixture({request:{authorityContext:B}})));
});

test('signed scope not in trusted expected scope is DENY',()=>{
  expectDeny(verify(fixture({ev:{scope:B}})));
});

test('unknown signing key prevents local ALLOW',()=>{
  expectDeny(verify(fixture({eventKey:other})));
});

test('cross-project issuer event is denied',()=>{
  expectDeny(verify(fixture({ev:{project_id:'project-other'}})));
});

test('stale checkpoint lease is denied',()=>{
  expectDeny(verify(fixture({cp:{not_after_ms:Date.now()-1000}})));
});

test('same event with consumed sequence is denied',()=>{
  expectDeny(verify(fixture({privileged:{previousAcceptedSeq:1}})));
});

test('unknown signed permission cannot authorize unrelated action',()=>{
  expectDeny(verify(fixture({request:{action:{...action,resource:'res:2'}}})),'INVALID');
});

test('missing action and wildcard action are denied',()=>{
  expectDeny(verify(fixture({request:{action:undefined}})));
  expectDeny(verify(fixture({request:{action:{...action,name:'*'}}})));
});

test('parameterized effect is denied rather than silently ignored',()=>{
  expectDeny(verify(fixture({request:{action:{...action,parameters:{amount:99999}}}})));
});

test('unknown signed permission limits must fail closed',()=>{
  expectDeny(verify(fixture({ev:{permissions:[{...grant(),maxAmount:1}]}})));
});

test('unknown signed governing event restrictions must fail closed',()=>{
  expectDeny(verify(fixture({ev:{customer_ids:['1']}})));
});

test('unknown signed delegation restrictions must fail closed',()=>{
  const until=new Date(Date.now()+60_000).toISOString();
  expectDeny(verify(fixture({ev:{delegations:[
    {edgeId:'A1',issuer:p,subject:a,status:'ACTIVE',validUntil:until,limit:1}
  ]}})));
});

test('unknown signed checkpoint restrictions must fail closed',()=>{
  expectDeny(verify(fixture({cp:{require_live_issuer:true}})));
});

test('request cannot inject a fake workState or edges',()=>{
  expectDeny(verify(fixture({request:{
    workState:{status:'ACTIVE',evidenceState:'FRESH'},edges:[{status:'ACTIVE'}]
  }})));
});

test('no privileged issuer trust configuration means DENY',()=>{
  expectDeny(verify(fixture({privileged:{trust:undefined}})));
});

test('signed event and checkpoint do not bypass scoped identity shortcut',()=>{
  expectDeny(verify(fixture({request:{principal:p,actor:p}})));
});
