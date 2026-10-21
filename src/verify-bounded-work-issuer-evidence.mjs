import { verifyEs256Jwt } from './jws.mjs';
import {
  assertArtifactBinding,
  assertContiguousSequence,
  assertSigningKeyLifecycle
} from './source-artifact-policy.mjs';

// Stage 18: local-only cryptographic admission layer. NOT hosted enforcement.
export const GATE_WORK_EVENT_TYP = 'gate-bounded-work-event+jwt';
export const GATE_WORK_CHECKPOINT_TYP = 'gate-bounded-work-checkpoint+jwt';
const KIND = 'oauth-bounded-work';
const goodId = value => typeof value === 'string' && value.length > 0 &&
  value.length <= 256 && value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value);
function requireId(value, label) {
  if (!goodId(value)) throw new Error(`invalid_${label}`);
  return value;
}
function normalizedScope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.kind !== KIND) {
    throw new Error('invalid_work_scope');
  }
  return { kind: KIND, issuer: requireId(value.issuer, 'work_issuer'), id: requireId(value.id, 'work_id') };
}
function sameScope(a, b) {
  const x = normalizedScope(a);
  return x.kind === b.kind && x.issuer === b.issuer && x.id === b.id;
}
function assertOnlySupportedKeys(value, supported, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !supported.includes(key))) {
    throw new Error(code);
  }
}
function isWholePositive(n) { return Number.isSafeInteger(n) && n > 0; }
function isWholeNonnegative(n) { return Number.isSafeInteger(n) && n >= 0; }

/**
 * Authenticate an *incoming* bounded-work snapshot plus a separate issuer
 * checkpoint. `trust` and `previousAcceptedSeq` MUST be read from privileged,
 * project-isolated server state; never from the client's verify request.
 * The caller must persist the accepted transition atomically before relying
 * on the result. This function does not authorize effects or mutate storage.
 */
export function verifyBoundedWorkIssuerEvidence({
  eventJwt, checkpointJwt, trust, expectedScope, previousAcceptedSeq,
  nowMs = Date.now(), maxCheckpointLeaseMs = 30_000
} = {}) {
  if (!trust || typeof trust !== 'object') throw new Error('trusted_issuer_configuration_required');
  const projectId = requireId(trust.projectId, 'trusted_project_id');
  const audience = requireId(trust.audience, 'trusted_audience');
  const issuer = requireId(trust.issuer, 'trusted_issuer');
  const scope = normalizedScope(expectedScope);
  if (scope.issuer !== issuer) throw new Error('untrusted_work_scope_issuer');
  if (!trust.publicJwk || trust.publicJwk.kty !== 'EC' || trust.publicJwk.crv !== 'P-256' ||
      trust.publicJwk.alg !== 'ES256' || !goodId(trust.publicJwk.kid)) {
    throw new Error('untrusted_signing_key');
  }
  if (!isWholeNonnegative(previousAcceptedSeq)) throw new Error('trusted_previous_sequence_required');
  if (!Number.isFinite(nowMs) || !Number.isFinite(maxCheckpointLeaseMs) ||
      maxCheckpointLeaseMs < 1 || maxCheckpointLeaseMs > 300_000) {
    throw new Error('invalid_checkpoint_policy');
  }

  const event = verifyEs256Jwt({
    token:eventJwt, publicJwk:trust.publicJwk, expectedTyp:GATE_WORK_EVENT_TYP,
    issuer, audience
  }).payload;
  const checkpoint = verifyEs256Jwt({
    token:checkpointJwt, publicJwk:trust.publicJwk, expectedTyp:GATE_WORK_CHECKPOINT_TYP,
    issuer, audience
  }).payload;
  assertOnlySupportedKeys(event, [
    'iss', 'aud', 'iat', 'jti', 'project_id', 'scope', 'sequence',
    'status', 'principal', 'actor', 'valid_until', 'delegations', 'permissions'
  ], 'unsupported_signed_work_event_claim');
  assertOnlySupportedKeys(checkpoint, [
    'iss', 'aud', 'iat', 'jti', 'project_id', 'scope',
    'checkpoint_seq', 'accepted_seq', 'not_after_ms'
  ], 'unsupported_signed_work_checkpoint_claim');
  for (const payload of [event, checkpoint]) {
    assertArtifactBinding(payload, {expectedIssuer:issuer, expectedAudience:audience,
      bindingClaim:'project_id', expectedBinding:projectId});
    if (!sameScope(payload.scope, scope)) throw new Error('work_scope_mismatch');
    if (!goodId(payload.jti) || !isWholePositive(payload.iat)) throw new Error('invalid_artifact_identity');
    if (payload.iat * 1000 > nowMs + 5_000) throw new Error('artifact_issued_in_future');
    assertSigningKeyLifecycle(trust.lifecycle, {iatMs:payload.iat * 1000});
  }

  if (!isWholePositive(event.sequence) || !isWholeNonnegative(checkpoint.checkpoint_seq) ||
      !isWholeNonnegative(checkpoint.accepted_seq)) {
    throw new Error('invalid_work_sequence_type');
  }
  if (event.jti === checkpoint.jti) throw new Error('work_artifact_id_collision');
  assertContiguousSequence({acceptedSeq:previousAcceptedSeq, incomingSeq:event.sequence});
  if (checkpoint.checkpoint_seq !== event.sequence || checkpoint.accepted_seq !== event.sequence) {
    throw new Error('work_checkpoint_sequence_mismatch');
  }
  if (!Number.isSafeInteger(checkpoint.not_after_ms)) throw new Error('invalid_work_checkpoint_expiry');
  const checkpointStartMs = checkpoint.iat * 1000;
  if (checkpoint.not_after_ms <= nowMs || checkpoint.not_after_ms <= checkpointStartMs ||
      checkpoint.not_after_ms - checkpointStartMs > maxCheckpointLeaseMs) {
    throw new Error('work_checkpoint_not_fresh');
  }
  // Denies forward-dated checkpoint to an older state; no continuous
  // external issuer assertion is inferred outside the signed lease.
  if (checkpoint.iat < event.iat) throw new Error('checkpoint_older_than_event');
  if (!['ACTIVE', 'REVOKED'].includes(event.status)) throw new Error('invalid_governing_work_status');
  if (!goodId(event.principal) || !goodId(event.actor)) throw new Error('invalid_governing_work_binding');
  if (!goodId(event.valid_until) || !Number.isFinite(Date.parse(event.valid_until))) {
    throw new Error('invalid_governing_work_expiry');
  }
  if (!Array.isArray(event.delegations) || event.delegations.length > 128 ||
      !Array.isArray(event.permissions) || event.permissions.length > 128) {
    throw new Error('invalid_signed_work_payload');
  }
  const seenEdges = new Set();
  const edges = event.delegations.map(d => {
    assertOnlySupportedKeys(d, [
      'edgeId', 'issuer', 'subject', 'status', 'validUntil'
    ], 'unsupported_signed_work_delegation_constraint');
    if (!d || typeof d !== 'object' || !goodId(d.edgeId) ||
        !goodId(d.issuer) || !goodId(d.subject) ||
        !['ACTIVE', 'REVOKED', 'UNKNOWN'].includes(d.status) ||
        !goodId(d.validUntil) || !Number.isFinite(Date.parse(d.validUntil))) {
      throw new Error('invalid_signed_work_delegation');
    }
    // This v1 is intentionally restricted to directly issued authority.
    // Third-party/multi-hop attestation needs distinct issuer-proof chains.
    if (d.issuer !== event.principal || d.subject !== event.actor) {
      throw new Error('signed_work_indirect_delegation_untrusted');
    }
    if (seenEdges.has(d.edgeId)) throw new Error('duplicate_signed_work_edge');
    seenEdges.add(d.edgeId);
    return { edgeId:d.edgeId, issuer:d.issuer, subject:d.subject,
      status:d.status, validUntil:d.validUntil, authorityContext:scope };
  });
  const permissions = event.permissions.map(p => {
    assertOnlySupportedKeys(p, [
      'protocol', 'name', 'resource'
    ], 'unsupported_signed_work_permission_constraint');
    if (!p || !goodId(p.name) || !goodId(p.protocol) || !goodId(p.resource) ||
        p.name === '*' || p.protocol === '*' || p.resource === '*') {
      throw new Error('invalid_signed_work_permission');
    }
    return {name:p.name,protocol:p.protocol,resource:p.resource};
  });

  return {
    accepted:true,
    projectId,
    sequence:event.sequence,
    governingWork:{authorityContext:scope,principal:event.principal,actor:event.actor,
      status:event.status,evidenceState:'FRESH',validUntil:event.valid_until},
    edges,
    permissions,
    evidence:{kind:'local-signed-checkpoint',issuer,checkpointSeq:checkpoint.checkpoint_seq,
      acceptedSeq:checkpoint.accepted_seq,notAfterMs:checkpoint.not_after_ms,
      signedArtifactsVerified:true,independentIssuerCurrentStateProven:false,
      hostedEnforcementVerified:false}
  };
}
