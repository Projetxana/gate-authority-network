import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateEs256KeyPair, signJwt } from '../src/jws.mjs';
import { buildBoundedWorkAdmissionV2 as build } from '../src/build-bounded-work-admission-v2.mjs';
import {
  GATE_WORK_EVENT_TYP as EVENT,
  GATE_WORK_CHECKPOINT_TYP as CHECKPOINT
} from '../src/verify-bounded-work-issuer-evidence.mjs';

const key = generateEs256KeyPair({ kid: 'work-stage18-admission-kid' });
const otherKey = generateEs256KeyPair({ kid: 'untrusted-kid' });
const projectId = '00000000-0000-4000-8000-000000000001';
const issuerId = '00000000-0000-4000-8000-000000000011';
const issuerName = 'https://signed-issuer.example';
const principal = 'user:test';
const actor = 'agent:test';
const scope = work => ({ kind: 'oauth-bounded-work', issuer: issuerName, id: work });
const projectRow = { id: projectId, status: 'active' };
const issuerRow = {
  id: issuerId, project_id: projectId, issuer: issuerName, status: 'active',
  alg: 'ES256', key_id: key.publicJwk.kid, public_jwk: key.publicJwk,
  federation_export_id: null, principal_patterns: [principal]
};
const digest = token => createHash('sha256').update(token, 'utf8').digest('hex');
function fixture({ work = 'work-A', eventOverrides = {}, checkpointOverrides = {},
  signedBy = key, signedCheckpointBy = key, project = projectRow,
  issuer = issuerRow, expectedScope = scope(work), acceptedSeq = 0 } = {}) {
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const base = {
    iss: issuerName, aud: `urn:gate:project:${projectId}`,
    iat: nowSec, project_id: projectId, scope: scope(work)
  };
  const eventPayload = {
    ...base, jti: `event-${work}-1`, sequence: 1, status: 'ACTIVE',
    principal, actor, valid_until: new Date(nowMs + 65_000).toISOString(),
    permissions: [{ protocol: 'mcp', name: 'tools/call', resource: 'resource:1' }],
    delegations: [{ edgeId: 'edge1', issuer: principal, subject: actor,
      status: 'ACTIVE', validUntil: new Date(nowMs + 65_000).toISOString() }],
    ...eventOverrides
  };
  const checkpointPayload = {
    ...base, jti: `checkpoint-${work}-1`, checkpoint_seq: 1,
    accepted_seq: 1, not_after_ms: nowSec * 1000 + 20_000,
    ...checkpointOverrides
  };
  const eventJwt = signJwt({
    header: { typ: EVENT, alg: 'ES256', kid: signedBy.publicJwk.kid },
    payload: eventPayload, privateKey: signedBy.privateKey
  });
  const checkpointJwt = signJwt({
    header: { typ: CHECKPOINT, alg: 'ES256', kid: signedCheckpointBy.publicJwk.kid },
    payload: checkpointPayload, privateKey: signedCheckpointBy.privateKey
  });
  return { eventJwt, checkpointJwt, projectRow: project, issuerRow: issuer,
    expectedScope, acceptedSeq, nowMs };
}

test('two authentic signed JWS artifacts produce exact atomic SQL parameters, not an ALLOW', () => {
  const f = fixture();
  const result = build(f);
  assert.equal(result.rpc, 'gate_admit_bounded_work_v2');
  assert.equal(result.params.p_project_id, projectId);
  assert.equal(result.params.p_authority_issuer_id, issuerId);
  assert.equal(result.params.p_work_id, 'work-A');
  assert.equal(result.params.p_sequence, 1);
  assert.equal(result.params.p_status, 'ACTIVE');
  assert.equal(result.params.p_signing_kid, key.publicJwk.kid);
  assert.deepEqual(result.params.p_expected_public_jwk, key.publicJwk);
  assert.equal(result.params.p_event_jti, 'event-work-A-1');
  assert.equal(result.params.p_checkpoint_jti, 'checkpoint-work-A-1');
  assert.equal(result.params.p_event_digest, digest(f.eventJwt));
  assert.equal(result.params.p_checkpoint_digest, digest(f.checkpointJwt));
  assert.equal(result.params.p_permissions[0].resource, 'resource:1');
  assert.equal(result.evidence.canonicalStorageCommitted, false);
  assert.equal(result.evidence.effectAuthorized, false);
});

test('tampering with the signed payload fails rather than building SQL', () => {
  const f = fixture();
  const parts = f.eventJwt.split('.');
  const modified = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  modified.status = 'REVOKED';
  parts[1] = Buffer.from(JSON.stringify(modified)).toString('base64url');
  assert.throws(() => build({ ...f, eventJwt: parts.join('.') }), /invalid_signature/);
});

test('the event and checkpoint must use the exact registered ES256 key', () => {
  assert.throws(() => build(fixture({ signedBy: otherKey })), /unknown_kid/);
  assert.throws(() => build(fixture({ signedCheckpointBy: otherKey })), /unknown_kid/);
});

test('a different work identifier cannot inherit the same signed authority', () => {
  assert.throws(() => build(fixture({ expectedScope: scope('work-B') })), /work_scope_mismatch/);
});

test('the project row and issuer row must come from one active project', () => {
  assert.throws(() => build(fixture({ project: { ...projectRow, status: 'disabled' } })), /active_project_required/);
  assert.throws(() => build(fixture({ issuer: { ...issuerRow, project_id: '00000000-0000-4000-8000-000000000002' } })), /direct_trusted_issuer_required/);
});

test('revoked and federated issuers are outside the deliberately narrow v2 contract', () => {
  assert.throws(() => build(fixture({ issuer: { ...issuerRow, status: 'revoked' } })), /direct_trusted_issuer_required/);
  assert.throws(() => build(fixture({ issuer: { ...issuerRow, federation_export_id: projectId } })), /direct_trusted_issuer_required/);
});

test('registered public key must match its kid, including same-kid replacement', () => {
  assert.throws(() => build(fixture({ issuer: { ...issuerRow, key_id: 'another-kid' } })), /direct_trusted_issuer_required/);
  const swappedKey = generateEs256KeyPair({ kid: key.publicJwk.kid }).publicJwk;
  assert.throws(() => build(fixture({ issuer: { ...issuerRow, public_jwk: swappedKey } })), /invalid_signature/);
});

test('unknown issuer principal pattern cannot authorize a candidate', () => {
  assert.throws(() => build(fixture({ issuer: { ...issuerRow, principal_patterns: ['user:*'] } })), /principal_not_registered_for_issuer/);
});

test('an expired signed event cannot create an ACTIVE work grant', () => {
  assert.throws(() => build(fixture({ eventOverrides: { valid_until: new Date(Date.now() - 2000).toISOString() } })), /grant_expired/);
});

test('a stale checkpoint cannot be accepted even with a valid event', () => {
  assert.throws(() => build(fixture({ checkpointOverrides: { not_after_ms: Date.now() - 1000 } })), /work_checkpoint_not_fresh/);
});

test('a terminal REVOKED event produces a revocation SQL candidate, never an effect ALLOW', () => {
  const result = build(fixture({ eventOverrides: { status: 'REVOKED' } }));
  assert.equal(result.params.p_status, 'REVOKED');
  assert.equal(result.evidence.effectAuthorized, false);
});

test('unsupported signed permission limits fail closed before any SQL is proposed', () => {
  const modified = [{ protocol: 'mcp', name: 'tools/call', resource: 'resource:1', maxAmount: 1 }];
  assert.throws(() => build(fixture({ eventOverrides: { permissions: modified } })), /unsupported_signed_work_permission_constraint/);
});
