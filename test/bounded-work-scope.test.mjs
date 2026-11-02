import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyBoundedWorkAuthority as verify } from '../src/verify-bounded-work-authority.mjs';
import { verifyLiveAuthority } from '../src/verify-live-authority.mjs';

const p = 'user:test', a = 'agent:test';
const A = { kind:'oauth-bounded-work', issuer:'issuer:fixture', id:'A' };
const B = { kind:'oauth-bounded-work', issuer:'issuer:fixture', id:'B' };
const now = Date.parse('2026-10-20T12:00:00Z');
const expiry = new Date(now + 600000).toISOString();
const edge = (id, scope, status = 'ACTIVE') => ({
  edgeId:id, issuer:p, subject:a, status, validUntil:expiry,
  authorityContext:scope
});
const state = (scope, status = 'ACTIVE', evidenceState = 'FRESH') => ({
  authorityContext:scope, status, evidenceState, validUntil:expiry
});
const check = (scope, workState, edges, extra = {}) => verify({
  principal:p, actor:a, authorityContext:scope, workState, edges, nowMs:now, ...extra
});

test('baseline collision: legacy unscoped engine can select unrelated B path', () => {
  const result = verifyLiveAuthority({principal:p,actor:a,edges:[edge('A',A,'REVOKED'),edge('B',B)],nowMs:now});
  assert.equal(result.decision, 'ALLOW');
  assert.deepEqual(result.selectedEdges, ['B']);
});

test('scoped Work A is DENY even while unrelated Work B is active', () => {
  const result=check(A,state(A),[edge('A',A,'REVOKED'),edge('B',B)]);
  assert.equal(result.authority,'INVALID');
  assert.equal(result.decision,'DENY');
  assert.equal(result.selectedEdges,undefined);
});

test('Work B remains independently ALLOW', () => {
  const result=check(B,state(B),[edge('A',A,'REVOKED'),edge('B',B)]);
  assert.equal(result.authority,'VALID');
  assert.equal(result.decision,'ALLOW');
  assert.deepEqual(result.selectedEdges,['B']);
});

test('a fresh alternate delegation path for the SAME ACTIVE work remains ALLOW', () => {
  const result=check(A,state(A),[edge('A-revoked',A,'REVOKED'),edge('A-alt',A),edge('B',B)]);
  assert.equal(result.authority,'VALID');
  assert.deepEqual(result.selectedEdges,['A-alt']);
});

test('revoked GOVERNING work is DENY even if its own paths are still active', () => {
  const result=check(A,state(A,'REVOKED'),[edge('A1',A),edge('A2',A),edge('B',B)]);
  assert.equal(result.authority,'INVALID');
  assert.equal(result.decision,'DENY');
  assert.equal(result.reason,'governing_work_revoked');
});

test('missing, malformed or mismatched governing work fails closed', () => {
  for (const [scope, workState] of [
    [null,state(A)], [A,null], [A,state(B)],
    [{kind:'oauth-bounded-work',issuer:'issuer:fixture',id:''},state(A)],
    [{kind:'unrecognized',issuer:'issuer:fixture',id:'A'},state(A)],
    [{...A,issuer:'issuer:other'},state(A)]
  ]) {
    const result=check(scope,workState,[edge('A1',A)]);
    assert.equal(result.decision,'DENY');
    assert.equal(result.authority,'UNKNOWN');
  }
});

test('unscoped path cannot rescue requested Work A', () => {
  const result=check(A,state(A),[edge('generic',null),edge('B',B)]);
  assert.equal(result.authority,'UNKNOWN');
  assert.equal(result.decision,'DENY');
});

test('governing work stale or hard expired fails closed', () => {
  const stale=check(A,state(A,'ACTIVE','STALE'),[edge('A',A)]);
  assert.equal(stale.authority,'UNKNOWN');
  const expired=check(A,{...state(A),validUntil:new Date(now-1).toISOString()},[edge('A',A)]);
  assert.equal(expired.authority,'INVALID');
  assert.equal(expired.decision,'DENY');
});

test('scoped identity shortcut is forbidden', () => {
  const result=check(A,state(A),[edge('A',A)],{principal:p,actor:p});
  assert.equal(result.decision,'DENY');
});

test('local result does not falsely attest an independent issuer or hosted enforcement', () => {
  const result=check(A,state(A),[edge('A',A)]);
  assert.equal(result.decision,'ALLOW');
  assert.equal(result.workScopeEvidence.independentIssuerAttestationVerified,false);
  assert.equal(result.workScopeEvidence.origin,'local-fixture-only');
});
