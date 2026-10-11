import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyLiveAuthority } from '../src/verify-live-authority.mjs';
import { buildAuthorityReceipt } from '../src/authority-receipt.mjs';

test('receipt v2 never claims access to unobserved issuer current state',()=>{
  const now=Date.now();
  const result=verifyLiveAuthority({
    principal:'user:x',actor:'agent:z',nowMs:now,requireFreshSources:true,
    edges:[{edgeId:'e1',issuer:'user:x',subject:'agent:z',status:'ACTIVE',validUntil:new Date(now+60000).toISOString(),source:{transmitter:'issuer-a'}}],
    sourceStates:[{source:'issuer-a',checkpointSeq:4,acceptedSeq:4,lastTs:new Date(now).toISOString(),method:'signed-checkpoint',notAfterMs:now+10000}]
  });
  assert.equal(result.receipt.version,'gate.authority-receipt.v2');
  assert.equal(result.receipt.evidence.issuerCurrentStateIncluded,false);
  assert.equal(result.receipt.evidence.signedSourceEvidence,true);
  assert.equal(result.receipt.evidence.sequenceContinuityVerified,true);
  assert.equal(result.receipt.freshness.sources[0].checkpointSeq,4);
  assert.equal(result.receipt.freshness.sources[0].state,'FRESH');
});

test('receipt exposes stale excluded path while preserving a fresh alternate ALLOW',()=>{
  const now=Date.now();
  const decision=verifyLiveAuthority({
    principal:'user:x',actor:'agent:z',nowMs:now,requireFreshSources:true,
    edges:[
      {edgeId:'a',issuer:'user:x',subject:'agent:z',status:'ACTIVE',validUntil:new Date(now+60000).toISOString(),source:{transmitter:'issuer-a'}},
      {edgeId:'b',issuer:'user:x',subject:'agent:z',status:'ACTIVE',validUntil:new Date(now+60000).toISOString(),source:{transmitter:'issuer-b'}}
    ],
    sourceStates:[
      {source:'issuer-a',checkpointSeq:5,acceptedSeq:4,lastTs:new Date(now).toISOString(),method:'signed-checkpoint',notAfterMs:now+10000},
      {source:'issuer-b',checkpointSeq:8,acceptedSeq:8,lastTs:new Date(now).toISOString(),method:'signed-checkpoint',notAfterMs:now+10000}
    ]
  });
  assert.equal(decision.decision,'ALLOW');
  assert.equal(decision.validPathCount,1);
  const bySource=Object.fromEntries(decision.receipt.freshness.sources.map(s=>[s.source,s]));
  assert.equal(bySource['issuer-a'].state,'STALE');
  assert.equal(bySource['issuer-a'].reason,'event_sequence_gap');
  assert.equal(bySource['issuer-b'].state,'FRESH');
});

test('bounded receipt carries GATE replica freshness separately from source freshness',()=>{
  const decision={authority:'UNKNOWN',decision:'DENY',reason:'replica_freshness_requirement_not_met',principal:'u',actor:'a',sourceFreshness:[],evaluatedPathCount:0};
  const replica={scope:'gate-replica',ageMs:900,leaseRemainingMs:-1,maxStalenessMs:250,fresh:false};
  const receipt=buildAuthorityReceipt(decision,{replicaFreshness:replica,sequenceContinuityVerified:true});
  assert.deepEqual(receipt.freshness.gateReplica,replica);
  assert.deepEqual(receipt.freshness.sources,[]);
  assert.equal(receipt.evidence.issuerCurrentStateIncluded,false);
});
