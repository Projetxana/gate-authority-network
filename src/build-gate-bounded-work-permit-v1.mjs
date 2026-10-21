import crypto from 'node:crypto';
import { signJwt, verifyEs256Jwt } from './jws.mjs';

// STAGE18 LOCAL BRIDGE ONLY: not a hosted endpoint or deployed issuer.
// Must be invoked only AFTER trusted GATE code obtained an atomic reservation
// from gate_reserve_bounded_work_effect_permit_DRAFT_v1. A client is never
// permitted to supply 'reservation', trusted GATE config or signing keys.
export const GATE_BOUNDED_WORK_EFFECT_PERMIT_TYP = 'gate-bounded-work-effect-permit+jwt';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const id = v => typeof v === 'string' && v.length > 0 && v.length <= 256 &&
  v === v.trim() && !/[\u0000-\u001f\u007f]/u.test(v);
const objectOnly = (value, keys) => value && typeof value === 'object' &&
  !Array.isArray(value) && Object.keys(value).length === keys.length &&
  keys.every(k => Object.hasOwn(value, k));
function need(ok, code) { if (!ok) throw new Error(code); }
function signedScope(scope) {
  need(objectOnly(scope,['kind','issuer','id']) &&
    scope.kind==='oauth-bounded-work' && id(scope.issuer) && id(scope.id),
  'trusted_work_scope_required');
  return {kind:scope.kind,issuer:scope.issuer,id:scope.id};
}
/** A candidate minted FROM an atomic SQL reservation (not proof of production). */
export function signReservedBoundedWorkPermitV1({
  trusted, reservation, request, privateKey, nowMs = Date.now()
}={}) {
  need(trusted && id(trusted.issuer) && id(trusted.audience) && UUID.test(trusted.projectId) &&
    trusted.publicJwk?.kty==='EC' && trusted.publicJwk?.crv==='P-256' &&
    trusted.publicJwk?.alg==='ES256' && id(trusted.publicJwk?.kid),
    'trusted_gate_issuer_configuration_required');
  need(request && id(request.principal) && id(request.actor) &&
    request.principal!==request.actor &&
    objectOnly(request.action,['protocol','name','resource']) &&
    request.action.protocol==='mcp' && id(request.action.name) &&
    request.action.name.startsWith('tools/call:') && id(request.action.resource) &&
    SHA256.test(request.inputSha256), 'invalid_bounded_work_permit_request');
  const scope=signedScope(request.authorityContext);
  need(reservation && UUID.test(reservation.jti) &&
    reservation.project_id===trusted.projectId &&
    UUID.test(reservation.authority_issuer_id) &&
    reservation.work_id===scope.id &&
    reservation.audience===trusted.audience &&
    reservation.principal===request.principal && reservation.actor===request.actor &&
    reservation.protocol===request.action.protocol &&
    reservation.action_name===request.action.name &&
    reservation.resource===request.action.resource &&
    reservation.input_sha256===request.inputSha256 &&
    Number.isSafeInteger(reservation.accepted_sequence) && reservation.accepted_sequence>0 &&
    Number.isSafeInteger(reservation.issued_at_seconds) &&
    Number.isSafeInteger(reservation.expires_at_seconds) &&
    Number.isSafeInteger(reservation.checkpoint_not_after_ms),
    'untrusted_or_mismatched_sql_reservation');
  const {issued_at_seconds:iat,expires_at_seconds:exp,checkpoint_not_after_ms:checkpointMs}=reservation;
  need(Number.isSafeInteger(nowMs) && Math.floor(nowMs/1000)>=iat &&
    Math.floor(nowMs/1000)<exp && exp>iat && exp-iat<=5 &&
    exp*1000<=checkpointMs && checkpointMs>nowMs &&
    checkpointMs<=iat*1000+30_000,
    'sql_reservation_expired_or_invalid');
  need(privateKey && typeof privateKey==='object', 'gate_private_signing_key_required');

  const payload={
    iss:trusted.issuer,aud:trusted.audience,jti:reservation.jti,
    project_id:trusted.projectId,principal:request.principal,actor:request.actor,
    authority_context:scope,
    action:{protocol:'mcp',name:request.action.name,resource:request.action.resource},
    input_sha256:request.inputSha256,decision:'ALLOW',authority:'VALID',
    accepted_seq:reservation.accepted_sequence,
    iat,exp,checkpoint_not_after_ms:checkpointMs
  };
  const permitJwt=signJwt({header:{alg:'ES256',typ:GATE_BOUNDED_WORK_EFFECT_PERMIT_TYP,
    kid:trusted.publicJwk.kid},payload,privateKey});
  // Detect a misconfigured private/public key pair BEFORE returning a permit.
  verifyEs256Jwt({token:permitJwt, publicJwk:trusted.publicJwk,
    expectedTyp:GATE_BOUNDED_WORK_EFFECT_PERMIT_TYP,
    issuer:trusted.issuer,audience:trusted.audience});
  return {permitJwt,reservationId:reservation.jti,
    evidence:{signedByGate:true,atomicReservationExpected:true,
      remoteResourceEnforcementProven:false,hostedIssuerProven:false}};
}
