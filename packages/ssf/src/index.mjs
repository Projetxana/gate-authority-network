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

export const GATE_AUTHORITY_EDGE_EVENT =
  'urn:gate:event:authority-edge-state:v1';

export function caepSessionRevokedToGateAuthorityEvent({
  signal,
  mapping,
  bridgeIssuer,
  audience,
  sequence,
  iatSec = Math.floor(Date.now() / 1000),
  jti = `ssf-bridge-${crypto.randomUUID()}`
} = {}) {
  if (!signal || signal.eventType !== CAEP_SESSION_REVOKED) {
    throw new Error('caep_session_revoked_signal_required');
  }

  if (!mapping || typeof mapping !== 'object') {
    throw new TypeError('SSF subject mapping is required');
  }

  const {
    subjectFormat,
    subjectId,
    subject,
    edgeId,
    issuerPrincipal,
    subjectPrincipal
  } = mapping;

  const subjectMatches = subject
    ? JSON.stringify(signal.subject) === JSON.stringify(subject)
    : (
        signal.subject?.format === subjectFormat &&
        signal.subject?.id === subjectId
      );

  if (!subjectMatches) {
    throw new Error('ssf_subject_mapping_mismatch');
  }

  if (
    typeof bridgeIssuer !== 'string' ||
    !bridgeIssuer ||
    typeof audience !== 'string' ||
    !audience
  ) {
    throw new TypeError('bridgeIssuer and audience are required');
  }

  const seq = Number(sequence);
  if (!Number.isInteger(seq) || seq < 1) {
    throw new TypeError('positive sequence is required');
  }

  for (const [name, value] of Object.entries({
    edgeId,
    issuerPrincipal,
    subjectPrincipal
  })) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new TypeError(`${name} is required`);
    }
  }

  const eventTimestamp = new Date(
    Number(signal.eventTimestamp) * 1000
  ).toISOString();

  return {
    iss: bridgeIssuer,
    aud: audience,
    iat: iatSec,
    jti,
    events: {
      [GATE_AUTHORITY_EDGE_EVENT]: {
        edge_id: edgeId,
        issuer_principal: issuerPrincipal,
        subject_principal: subjectPrincipal,
        status: 'REVOKED',
        sequence: seq,
        reason: 'ssf_caep_session_revoked',
        event_timestamp: eventTimestamp
      }
    }
  };
}

export const SSF_POLL_DELIVERY = 'urn:ietf:rfc:8936';

function normalizeIssuer(v) { return String(v || '').replace(/\/+$/, ''); }
function audienceMatches(actual, expected) {
  if (!expected) return true;
  return Array.isArray(actual) ? actual.includes(expected) : actual === expected;
}

export async function discoverSsfTransmitter({ issuer, accessToken, fetchImpl = globalThis.fetch } = {}) {
  const normalized = normalizeIssuer(issuer);
  if (!normalized.startsWith('https://')) throw new TypeError('SSF transmitter issuer must use https');
  const metadataUrl = `${normalized}/.well-known/ssf-configuration`;
  const r = await fetchImpl(metadataUrl, { headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {} });
  if (!r.ok) throw new Error(`ssf_metadata_http_${r.status}`);
  const metadata = await r.json();
  if (!metadata?.issuer || !metadata?.jwks_uri || !metadata?.configuration_endpoint || !Array.isArray(metadata?.delivery_methods_supported)) {
    throw new Error('invalid_ssf_transmitter_metadata');
  }
  return { metadataUrl, metadata };
}

export async function fetchSsfJwks({ jwksUri, accessToken, fetchImpl = globalThis.fetch } = {}) {
  const r = await fetchImpl(jwksUri, { headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {} });
  if (!r.ok) throw new Error(`ssf_jwks_http_${r.status}`);
  const jwks = await r.json();
  if (!Array.isArray(jwks?.keys) || !jwks.keys.length) throw new Error('invalid_ssf_jwks');
  return jwks;
}

export async function createSsfPollStream({ metadata, accessToken, eventsRequested = [CAEP_SESSION_REVOKED], description = 'GATE independent SSF interop', fetchImpl = globalThis.fetch } = {}) {
  if (!metadata?.delivery_methods_supported?.includes(SSF_POLL_DELIVERY)) throw new Error('ssf_poll_not_supported');
  const r = await fetchImpl(metadata.configuration_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify({ delivery: { method: SSF_POLL_DELIVERY }, events_requested: eventsRequested, description })
  });
  if (r.status !== 201) throw new Error(`ssf_stream_create_http_${r.status}:${await r.text()}`);
  const stream = await r.json();
  if (!stream?.stream_id || stream?.delivery?.method !== SSF_POLL_DELIVERY || !stream?.delivery?.endpoint_url) throw new Error('invalid_ssf_poll_stream');
  return stream;
}


export async function getExistingSsfStream({ metadata, accessToken, fetchImpl = globalThis.fetch } = {}) {
  if (!metadata?.configuration_endpoint) throw new TypeError('SSF configuration endpoint is required');
  const r = await fetchImpl(metadata.configuration_endpoint, {
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {}
  });
  if (!r.ok) throw new Error(`ssf_stream_get_http_${r.status}:${await r.text()}`);
  const body = await r.json();
  const candidates = Array.isArray(body) ? body : (Array.isArray(body?.streams) ? body.streams : [body]);
  const stream = candidates.find(x => x?.delivery?.method === SSF_POLL_DELIVERY) || candidates[0];
  if (!stream?.stream_id || stream?.delivery?.method !== SSF_POLL_DELIVERY || !stream?.delivery?.endpoint_url) {
    throw new Error('invalid_existing_ssf_poll_stream');
  }
  return stream;
}

export async function addSsfStreamSubject({ metadata, streamId, subject, accessToken, fetchImpl = globalThis.fetch } = {}) {
  if (!metadata?.add_subject_endpoint) return { supported: false };
  const r = await fetchImpl(metadata.add_subject_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify({ stream_id: streamId, subject, verified: true })
  });
  if (!r.ok) throw new Error(`ssf_add_subject_http_${r.status}:${await r.text()}`);
  return { supported: true };
}

export async function pollSsfStream({ stream, accessToken, ack = [], maxEvents = 50, fetchImpl = globalThis.fetch } = {}) {
  const endpoint = stream?.delivery?.endpoint_url;
  if (!endpoint) throw new TypeError('SSF poll endpoint is required');
  const r = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify({ stream_id: stream.stream_id, max_events: maxEvents, ack, returnImmediately: true })
  });
  if (!r.ok) throw new Error(`ssf_poll_http_${r.status}:${await r.text()}`);
  const body = await r.json();
  return { sets: body?.sets && typeof body.sets === 'object' ? body.sets : {}, moreAvailable: body?.moreAvailable === true || body?.more_available === true };
}

export async function deleteSsfStream({ metadata, streamId, accessToken, fetchImpl = globalThis.fetch } = {}) {
  if (!streamId) return;
  const url = new URL(metadata.configuration_endpoint);
  url.searchParams.set('stream_id', streamId);
  const r = await fetchImpl(url, { method: 'DELETE', headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {} });
  if (![200, 204, 404].includes(r.status)) throw new Error(`ssf_stream_delete_http_${r.status}`);
}

function verifySetSignature(alg, key, input, sig) {
  if (alg === 'RS256') return verifySignature('RSA-SHA256', Buffer.from(input), key, sig);
  if (alg === 'ES256') return verifySignature('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' }, sig);
  throw new Error('unsupported_set_alg');
}

export function verifySsfSetWithJwks(token, { jwks, issuer, audience, nowSec = Math.floor(Date.now()/1000), maxIatSkewSec = 600, requireSubject = true } = {}) {
  if (typeof token !== 'string') throw new TypeError('SET token is required');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid_compact_set');
  const header = b64uJson(parts[0]);
  const payload = b64uJson(parts[1]);
  if (!['RS256','ES256'].includes(header.alg)) throw new Error('unsupported_set_alg');
  if (header.typ !== 'secevent+jwt') throw new Error('invalid_set_typ');
  if (!header.kid) throw new Error('set_kid_required');
  if (payload.sub !== undefined) throw new Error('ssf_sub_claim_not_allowed');
  if (payload.exp !== undefined) throw new Error('ssf_exp_claim_not_allowed');
  if (issuer && normalizeIssuer(payload.iss) !== normalizeIssuer(issuer)) throw new Error('ssf_issuer_mismatch');
  if (!audienceMatches(payload.aud, audience)) throw new Error('ssf_audience_mismatch');
  if (!payload.jti || !payload.iat || !payload.events) throw new Error('ssf_required_claim_missing');
  if (!Number.isFinite(Number(payload.iat)) || Math.abs(nowSec-Number(payload.iat)) > maxIatSkewSec) throw new Error('ssf_iat_outside_window');
  if (requireSubject && (!payload.sub_id || typeof payload.sub_id !== 'object')) throw new Error('ssf_subject_identifier_missing');
  const candidates = Array.isArray(jwks?.keys) ? jwks.keys.filter(k => k.kid === header.kid) : [];
  if (candidates.length !== 1) throw new Error('set_signing_key_not_found');
  const jwk = candidates[0];
  if (header.alg === 'RS256' && jwk.kty !== 'RSA') throw new Error('set_signing_key_type_mismatch');
  if (header.alg === 'ES256' && (jwk.kty !== 'EC' || jwk.crv !== 'P-256')) throw new Error('set_signing_key_type_mismatch');
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const ok = verifySetSignature(header.alg, key, `${parts[0]}.${parts[1]}`, Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('invalid_set_signature');
  return { header, payload, jwk };
}
