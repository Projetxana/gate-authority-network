import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertArtifactBinding,
  assertContiguousSequence,
  assertSigningKeyLifecycle
} from '../src/source-artifact-policy.mjs';

test('contiguous source sequence rejects stale and skipped events',()=>{
  assert.equal(assertContiguousSequence({acceptedSeq:1,incomingSeq:2}),2);
  assert.throws(()=>assertContiguousSequence({acceptedSeq:2,incomingSeq:2}),/stale_authority_event/);
  assert.throws(()=>assertContiguousSequence({acceptedSeq:1,incomingSeq:3}),/authority_event_sequence_gap/);
});

test('signing-key lifecycle prevents retroactive activation',()=>{
  const activation=Date.parse('2026-10-11T02:00:10Z');
  assert.throws(()=>assertSigningKeyLifecycle({status:'standby'},{iatMs:activation+1000}),/untrusted_signing_key/);
  assert.throws(()=>assertSigningKeyLifecycle({status:'active',validFrom:activation},{iatMs:activation-1000}),/artifact_before_key_activation/);
  assert.equal(assertSigningKeyLifecycle({status:'active',validFrom:activation},{iatMs:activation+1000}).accepted,true);
});

test('graceful retirement preserves historical signatures but rejects later artifacts',()=>{
  const activation=Date.parse('2026-10-11T02:00:00Z');
  const retirement=Date.parse('2026-10-11T03:00:00Z');
  assert.equal(assertSigningKeyLifecycle({status:'retired',validFrom:activation,validUntil:retirement},{iatMs:retirement-1000}).accepted,true);
  assert.throws(()=>assertSigningKeyLifecycle({status:'retired',validFrom:activation,validUntil:retirement},{iatMs:retirement+1000}),/artifact_after_key_retirement/);
});

test('emergency key revocation rejects even historical artifacts',()=>{
  const issued=Date.parse('2026-10-11T02:30:00Z');
  assert.throws(()=>assertSigningKeyLifecycle({status:'revoked',validFrom:issued-1000},{iatMs:issued}),/signing_key_revoked/);
});

test('artifact binding rejects issuer, audience, and explicit binding mismatch',()=>{
  const payload={iss:'issuer-a',aud:['gate'],scenario_id:'scenario-a'};
  assert.equal(assertArtifactBinding(payload,{expectedIssuer:'issuer-a',expectedAudience:'gate',bindingClaim:'scenario_id',expectedBinding:'scenario-a'}),true);
  assert.throws(()=>assertArtifactBinding(payload,{expectedIssuer:'issuer-b'}),/issuer_mismatch/);
  assert.throws(()=>assertArtifactBinding(payload,{expectedAudience:'other'}),/audience_mismatch/);
  assert.throws(()=>assertArtifactBinding(payload,{bindingClaim:'scenario_id',expectedBinding:'scenario-b'}),/artifact_binding_mismatch/);
});
