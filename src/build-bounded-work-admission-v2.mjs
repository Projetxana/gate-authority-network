import { createHash } from 'node:crypto';
import { decodeJwtUnsafe } from './jws.mjs';
import { verifyBoundedWorkIssuerEvidence } from './verify-bounded-work-issuer-evidence.mjs';

// Stage 18 REVIEW ONLY — an in-process adapter, not a hosted ingress endpoint.
// This module NEVER executes SQL and NEVER returns an effect authorization.
// projectRow and issuerRow must be read by privileged server code, never supplied
// by an API caller. The SQL admission RPC rechecks their CURRENT values under
// locks, rather than relying on this preflight snapshot.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex = token => createHash('sha256').update(token, 'utf8').digest('hex');
const nonempty = (s, max = 256) => typeof s === 'string' && s.length > 0 &&
  s.length <= max && s.trim() === s && !/[\u0000-\u001f\u007f]/u.test(s);
function requireCondition(condition, code) {
  if (!condition) throw new Error(code);
}
function normalTimestamp(ms, code) {
  requireCondition(Number.isSafeInteger(ms) && ms >= 0 && ms <= 8_640_000_000_000_000, code);
  return new Date(ms).toISOString();
}

/**
 * Create a typed PostgREST RPC payload using two independently ES256-verified
 * JWT artifacts. This is ONLY an admission candidate. No database mutation,
 * no canonical receipt, no current-source proof, no effect ALLOW.
 *
 * Trusted inputs must originate from project-scoped service reads:
 *  - projectRow {id,status}
 *  - issuerRow {id,project_id,issuer,status,alg,key_id,public_jwk,
 *      principal_patterns,federation_export_id}
 *  - acceptedSeq read for this (project, issuer, work-kind, work-id)
 */
export function buildBoundedWorkAdmissionV2({
  eventJwt, checkpointJwt, projectRow, issuerRow, expectedScope,
  acceptedSeq, nowMs = Date.now()
} = {}) {
  requireCondition(typeof eventJwt === 'string' && eventJwt.length < 1_000_000 &&
    typeof checkpointJwt === 'string' && checkpointJwt.length < 1_000_000,
    'bounded_work_compact_jws_required');
  requireCondition(projectRow && UUID.test(projectRow.id) && projectRow.status === 'active',
    'bounded_work_active_project_required');
  requireCondition(issuerRow && UUID.test(issuerRow.id) &&
    issuerRow.project_id === projectRow.id && issuerRow.status === 'active' &&
    issuerRow.federation_export_id == null && issuerRow.alg === 'ES256' &&
    nonempty(issuerRow.issuer) && nonempty(issuerRow.key_id) &&
    issuerRow.public_jwk && issuerRow.public_jwk.kid === issuerRow.key_id &&
    issuerRow.public_jwk.alg === 'ES256',
    'bounded_work_direct_trusted_issuer_required');
  requireCondition(expectedScope && expectedScope.kind === 'oauth-bounded-work' &&
    expectedScope.issuer === issuerRow.issuer && nonempty(expectedScope.id),
    'bounded_work_trusted_scope_required');
  requireCondition(Number.isSafeInteger(acceptedSeq) && acceptedSeq >= 0,
    'bounded_work_prior_sequence_required');
  requireCondition(Number.isFinite(nowMs), 'bounded_work_invalid_clock');

  const verified = verifyBoundedWorkIssuerEvidence({
    eventJwt, checkpointJwt,
    trust: {
      projectId: projectRow.id,
      audience: `urn:gate:project:${projectRow.id}`,
      issuer: issuerRow.issuer,
      publicJwk: issuerRow.public_jwk,
      lifecycle: {status: 'active'}
    },
    expectedScope,
    previousAcceptedSeq: acceptedSeq,
    nowMs,
    maxCheckpointLeaseMs: 30_000
  });
  // decodeJwtUnsafe is safe ONLY here, after both JWTs were verified above.
  const event = decodeJwtUnsafe(eventJwt).payload;
  const checkpoint = decodeJwtUnsafe(checkpointJwt).payload;
  requireCondition(verified.accepted === true && verified.sequence === event.sequence,
    'bounded_work_verified_sequence_mismatch');
  requireCondition(nonempty(event.jti) && nonempty(checkpoint.jti) &&
    event.jti !== checkpoint.jti, 'bounded_work_artifact_identity_invalid');
  requireCondition(event.iat * 1000 >= nowMs - 600_000,
    'bounded_work_event_too_old_for_atomic_ingress');
  requireCondition(event.principal !== event.actor,
    'bounded_work_explicit_delegation_required');
  // Deliberately narrow v2: only exact registered principal patterns. Do not
  // introduce a second, inconsistent wildcard parser in the storage bridge.
  requireCondition(Array.isArray(issuerRow.principal_patterns) &&
    issuerRow.principal_patterns.includes(event.principal),
    'bounded_work_principal_not_registered_for_issuer');
  requireCondition(event.valid_until === verified.governingWork.validUntil &&
    Number.isFinite(Date.parse(event.valid_until)), 'bounded_work_expiry_invalid');
  if (event.status === 'ACTIVE') {
    requireCondition(Date.parse(event.valid_until) > nowMs,
      'bounded_work_grant_expired');
  }

  const params = {
    p_project_id: projectRow.id,
    p_authority_issuer_id: issuerRow.id,
    p_issuer: issuerRow.issuer,
    p_signing_kid: issuerRow.key_id,
    p_expected_public_jwk: issuerRow.public_jwk,
    p_work_id: expectedScope.id,
    p_event_jti: event.jti,
    p_checkpoint_jti: checkpoint.jti,
    p_sequence: event.sequence,
    p_status: event.status,
    p_principal: event.principal,
    p_actor: event.actor,
    p_valid_until: normalTimestamp(Date.parse(event.valid_until), 'bounded_work_expiry_invalid'),
    p_event_issued_at: normalTimestamp(event.iat * 1000, 'bounded_work_iat_invalid'),
    p_checkpoint_issued_at: normalTimestamp(checkpoint.iat * 1000, 'bounded_work_checkpoint_iat_invalid'),
    p_checkpoint_not_after: normalTimestamp(checkpoint.not_after_ms, 'bounded_work_checkpoint_expiry_invalid'),
    p_permissions: event.permissions,
    p_delegations: event.delegations,
    p_event_digest: hex(eventJwt),
    p_checkpoint_digest: hex(checkpointJwt)
  };

  return {
    rpc: 'gate_admit_bounded_work_v2',
    params,
    evidence: {
      signedArtifactsVerified: true,
      sourceAttestedAsCurrentlyReachable: false,
      canonicalStorageCommitted: false,
      hostedEnforcementVerified: false,
      effectAuthorized: false,
      issuerId: issuerRow.id,
      projectId: projectRow.id,
      workId: expectedScope.id,
      eventSequence: event.sequence
    }
  };
}
