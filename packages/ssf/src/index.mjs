import {
  createPublicKey,
  verify as verifySignature
} from 'node:crypto';

export const CAEP_SESSION_REVOKED =
  'https://schemas.openid.net/secevent/caep/event-type/session-revoked';

function b64uJson(part) {
  return JSON.parse(
    Buffer.from(part, 'base64url').toString('utf8')
  );
}

function audienceIncludes(aud, expected) {
  return Array.isArray(aud)
    ? aud.includes(expected)
    : aud === expected;
}

export function verifySsfSet(token, {
  publicJwk,
  issuer,
  audience,
  nowSec = Math.floor(Date.now() / 1000),
  maxIatSkewSec = 600
} = {}) {
  if (typeof token !== 'string') {
    throw new TypeError('SET token is required');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('invalid_compact_set');
  }

  const header = b64uJson(parts[0]);
  const payload = b64uJson(parts[1]);

  if (header.alg !== 'ES256') {
    throw new Error('unsupported_set_alg');
  }
  if (header.typ !== 'secevent+jwt') {
    throw new Error('invalid_set_typ');
  }

  if (payload.sub !== undefined) {
    throw new Error('ssf_sub_claim_not_allowed');
  }
  if (payload.exp !== undefined) {
    throw new Error('ssf_exp_claim_not_allowed');
  }

  if (issuer && payload.iss !== issuer) {
    throw new Error('ssf_issuer_mismatch');
  }
  if (audience && !audienceIncludes(payload.aud, audience)) {
    throw new Error('ssf_audience_mismatch');
  }

  if (!payload.jti || !payload.iat || !payload.events) {
    throw new Error('ssf_required_claim_missing');
  }

  if (
    !Number.isFinite(Number(payload.iat)) ||
    Math.abs(nowSec - Number(payload.iat)) > maxIatSkewSec
  ) {
    throw new Error('ssf_iat_outside_window');
  }

  if (!payload.sub_id || typeof payload.sub_id !== 'object') {
    throw new Error('ssf_subject_identifier_missing');
  }

  const key = createPublicKey({
    key: publicJwk,
    format: 'jwk'
  });

  const ok = verifySignature(
    'sha256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    { key, dsaEncoding: 'ieee-p1363' },
    Buffer.from(parts[2], 'base64url')
  );

  if (!ok) throw new Error('invalid_set_signature');

  return { header, payload };
}

export function normalizeCaepSessionRevoked(payload) {
  const event = payload?.events?.[CAEP_SESSION_REVOKED];
  if (!event) {
    throw new Error('caep_session_revoked_event_missing');
  }

  return {
    profile: 'caep-1.0',
    eventType: CAEP_SESSION_REVOKED,
    issuer: payload.iss,
    jti: payload.jti,
    txn: payload.txn ?? null,
    subject: payload.sub_id,
    eventTimestamp:
      event.event_timestamp ?? payload.iat,
    reasonAdmin: event.reason_admin ?? null,
    reasonUser: event.reason_user ?? null
  };
}

export async function applyCaepSessionRevokedToEdges({
  edges,
  signal,
  resolveEdgeIds
} = {}) {
  if (!Array.isArray(edges)) {
    throw new TypeError('edges array is required');
  }
  if (typeof resolveEdgeIds !== 'function') {
    throw new TypeError('resolveEdgeIds function is required');
  }

  const edgeIds = await resolveEdgeIds(signal.subject, signal);
  if (!Array.isArray(edgeIds) || edgeIds.length === 0) {
    throw new Error('caep_subject_not_mapped');
  }

  const selected = new Set(edgeIds);

  return edges.map(edge =>
    selected.has(edge.edgeId)
      ? {
          ...edge,
          status: 'REVOKED',
          revokedAt: new Date(
            Number(signal.eventTimestamp) * 1000
          ).toISOString(),
          reason: 'caep_session_revoked',
          source: {
            ...(edge.source ?? {}),
            transmitter: signal.issuer
          }
        }
      : edge
  );
}
