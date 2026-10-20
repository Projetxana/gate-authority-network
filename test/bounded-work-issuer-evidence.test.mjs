import test from 'node:test';
import assert from 'node:assert/strict';
import { generateEs256KeyPair, signJwt } from '../src/jws.mjs';
import {
  verifyBoundedWorkIssuerEvidence as verify,
  GATE_WORK_EVENT_TYP as EVT,
  GATE_WORK_CHECKPOINT_TYP as CP
} from '../src/verify-bounded-work-issuer-evidence.mjs';

const pair = generateEs256KeyPair({kid:'work-demo-key'});
const otherPair = generateEs256KeyPair({kid:'other-key'});
const scopeA = {kind:'oauth-bounded-work',issuer:'https://issuer.test',id:'A'};
const scopeB = {...scopeA,id:'B'};
const p='user:test', a='agent:test';
const now=Date.now(), sec=Math.floor(now/1000);
const trust={issuer:scopeA.issuer,projectId:'project-1',audience:'gate-test',
  publicJwk:pair.publicJwk,lifecycle:{status:'active'}};
const base={iss:trust.issuer,aud:trust.audience,iat:sec,jti:'artifact-1',project_id:trust.projectId};
const edge=(id, status='ACTIVE')=>({edgeId:id,issuer:p,subject:a,status,validUntil:new Date(now+60_000).toISOString()});
function create({scope=scopeA,ev={},cp={},eventKey=pair,checkpointKey=pair}={}) {
  const event={...base,scope,sequence:1,status:'ACTIVE',principal:p,actor:a,
    valid_until:new Date(now+60_000).toISOString(),delegations:[edge('e1')],
    permissions:[{protocol:'mcp',name:'tools/call',resource:'res:1'}],...ev};
  const checkpoint={...base,jti:'cp-1',scope,checkpoint_seq:1,accepted_seq:1,
    not_after_ms:sec*1000+20_000,...cp};
  const eventJwt=signJwt({header:{alg:'ES256',typ:EVT,kid:eventKey.publicJwk.kid},payload:event,privateKey:eventKey.privateKey});
  const checkpointJwt=signJwt({header:{alg:'ES256',typ:CP,kid:checkpointKey.publicJwk.kid},payload:checkpoint,privateKey:checkpointKey.privateKey});
  return {eventJwt,checkpointJwt,trust,expectedScope:scopeA,previousAcceptedSeq:0,nowMs:now};
}
test('accepts two signed, bound artifacts, strictly contiguous',()=>{
  const result=verify(create());assert.equal(result.accepted,true);
  assert.equal(result.governingWork.status,'ACTIVE');
  assert.deepEqual(result.edges[0].authorityContext,scopeA);
  assert.equal(result.evidence.signedArtifactsVerified,true);
  assert.equal(result.evidence.hostedEnforcementVerified,false);
  assert.equal(result.evidence.independentIssuerCurrentStateProven,false);
});
test('refuses tampered signed state',()=>{
  const o=create();const parts=o.eventJwt.split('.');
  parts[1]=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(parts[1],'base64url').toString()),status:'REVOKED'})).toString('base64url');
  assert.throws(()=>verify({...o,eventJwt:parts.join('.')}),/invalid_signature/);
});
test('refuses unregistered issuer signing key',()=>{
  assert.throws(()=>verify(create({eventKey:otherPair})),/unknown_kid/);
});
test('refuses cross-project signed event',()=>{
  assert.throws(()=>verify(create({ev:{project_id:'project-2'}})),/artifact_binding_mismatch/);
});
test('refuses cross-project checkpoint',()=>{
  assert.throws(()=>verify(create({cp:{project_id:'project-2'}})),/artifact_binding_mismatch/);
});
test('refuses wrong audience',()=>{
  assert.throws(()=>verify(create({ev:{aud:'wrong-audience'}})),/audience_mismatch/);
});
test('refuses another governing work scope',()=>{
  assert.throws(()=>verify(create({scope:scopeB})),/work_scope_mismatch/);
});
test('refuses expired signed checkpoint lease',()=>{
  assert.throws(()=>verify(create({cp:{not_after_ms:now-1}})),/work_checkpoint_not_fresh/);
});
test('refuses excessively long source-freshness lease',()=>{
  assert.throws(()=>verify(create({cp:{not_after_ms:now+120_000}})),/work_checkpoint_not_fresh/);
});
test('refuses signed sequence gap and replay',()=>{
  assert.throws(()=>verify(create({ev:{sequence:3},cp:{checkpoint_seq:3,accepted_seq:3}})),/authority_event_sequence_gap/);
  assert.throws(()=>verify({...create(),previousAcceptedSeq:1}),/stale_authority_event/);
});
test('refuses checkpoint mismatched with event sequence',()=>{
  assert.throws(()=>verify(create({cp:{checkpoint_seq:2}})),/work_checkpoint_sequence_mismatch/);
});
test('refuses revoked signing key',()=>{
  assert.throws(()=>verify({...create(),trust:{...trust,lifecycle:{status:'revoked'}}}),/signing_key_revoked/);
});
test('accepts signed governing revocation but does not itself ALLOW effects',()=>{
  const state=verify(create({ev:{status:'REVOKED'}}));
  assert.equal(state.governingWork.status,'REVOKED');
  assert.equal(state.evidence.hostedEnforcementVerified,false);
});
test('rejects wildcard permissions rather than overgranting',()=>{
  assert.throws(()=>verify(create({ev:{permissions:[{protocol:'mcp',name:'*',resource:'res:1'}]}})),/invalid_signed_work_permission/);
});
test('refuses signed checkpoint from a different key',()=>{
  assert.throws(()=>verify(create({checkpointKey:otherPair})),/unknown_kid/);
});

test('rejects a third-party/multi-hop authority edge signed by one issuer',()=>{
  assert.throws(()=>verify(create({ev:{delegations:[{...edge('m1'),issuer:'unrelated-issuer'}]}})),/signed_work_indirect_delegation_untrusted/);
});
test('rejects duplicate edge IDs within the signed scope',()=>{
  assert.throws(()=>verify(create({ev:{delegations:[edge('d1'),edge('d1')]}})),/duplicate_signed_work_edge/);
});
test('rejects string-encoded event sequence',()=>{
  assert.throws(()=>verify(create({ev:{sequence:'1'},cp:{checkpoint_seq:'1',accepted_seq:'1'}})),/invalid_work_sequence_type/);
});
