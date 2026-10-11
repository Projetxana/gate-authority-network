import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyLiveAuthority } from '../src/verify-live-authority.mjs';

test('stale source on one independent path does not poison a fresh alternate path',()=>{
  const now=Date.now();
  const edges=[
    {edgeId:'a',issuer:'user:x',subject:'agent:z',status:'ACTIVE',validUntil:new Date(now+60000).toISOString(),source:{transmitter:'issuer-a'}},
    {edgeId:'b',issuer:'user:x',subject:'agent:z',status:'ACTIVE',validUntil:new Date(now+60000).toISOString(),source:{transmitter:'issuer-b'}}
  ];
  const sourceStates=[
    {source:'issuer-a',lastSeq:5,acceptedSeq:4,lastTs:new Date(now).toISOString(),method:'signed-checkpoint',notAfterMs:now+10000},
    {source:'issuer-b',lastSeq:8,acceptedSeq:8,lastTs:new Date(now).toISOString(),method:'signed-checkpoint',notAfterMs:now+10000}
  ];
  const result=verifyLiveAuthority({principal:'user:x',actor:'agent:z',edges,sourceStates,requireFreshSources:true,nowMs:now});
  assert.equal(result.decision,'ALLOW');
  assert.equal(result.validPathCount,1);
  assert.deepEqual(result.selectedEdges,['b']);
  assert.equal(result.sourceFreshness[0].source,'issuer-b');
  assert.equal(result.sourceFreshness[0].freshness,'FRESH');
  const stalePath=result.paths.find(p=>p.edgeIds.includes('a'));
  assert.equal(stalePath.status,'UNKNOWN');
  assert.equal(stalePath.checks[0].sourceFreshness.freshness,'STALE');
});

test('hard expiry is an invalid authority state, not a freshness guess',()=>{
  const now=Date.now();
  const result=verifyLiveAuthority({
    principal:'user:x',actor:'agent:z',nowMs:now,requireFreshSources:true,
    edges:[{edgeId:'expired',issuer:'user:x',subject:'agent:z',status:'ACTIVE',validUntil:new Date(now-1).toISOString(),source:{transmitter:'issuer-a'}}],
    sourceStates:[{source:'issuer-a',lastSeq:1,acceptedSeq:1,lastTs:new Date(now).toISOString(),method:'signed-checkpoint',notAfterMs:now+10000}]
  });
  assert.equal(result.authority,'INVALID');
  assert.equal(result.decision,'DENY');
  assert.equal(result.paths[0].reason,'delegation_hard_expired');
});

test('graph-only proof: W1 and W2 are indistinguishable when the local graph is identical',()=>{
  const now=Date.now();
  const localGraph=[
    {edgeId:'a1',issuer:'user:x',subject:'agent:a',status:'ACTIVE',validUntil:new Date(now+60000).toISOString(),source:{transmitter:'issuer-principal'}},
    {edgeId:'a2',issuer:'agent:a',subject:'agent:z',status:'ACTIVE',validUntil:new Date(now+60000).toISOString(),source:{transmitter:'issuer-a'}},
    {edgeId:'b1',issuer:'user:x',subject:'agent:b',status:'ACTIVE',validUntil:new Date(now+60000).toISOString(),source:{transmitter:'issuer-principal'}},
    {edgeId:'b2',issuer:'agent:b',subject:'agent:z',status:'ACTIVE',validUntil:new Date(now+60000).toISOString(),source:{transmitter:'issuer-b'}}
  ];

  const w1=verifyLiveAuthority({principal:'user:x',actor:'agent:z',edges:structuredClone(localGraph),nowMs:now});
  // In W2 the issuer has revoked upstream, but the revoke has not reached the local graph.
  const w2=verifyLiveAuthority({principal:'user:x',actor:'agent:z',edges:structuredClone(localGraph),nowMs:now});

  assert.deepEqual(w2,w1);
  assert.equal(w1.decision,'ALLOW');
  assert.equal(w1.validPathCount,2);
  assert.equal(w1.freshnessLane,'graph-only');
});
