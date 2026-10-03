import { decodeJwtUnsafe, verifyEs256Jwt } from './jws.mjs';

const metadataCache = new Map();
const jwksCache = new Map();

export async function verifyRemoteAccessToken({ token, audience, allowedIssuer }) {
  try {
    const decoded = decodeJwtUnsafe(token);
    if (!decoded.payload.iss || decoded.payload.iss !== allowedIssuer) return { valid: false, reason: 'issuer_not_allowed' };
    let metadata = metadataCache.get(decoded.payload.iss);
    if (!metadata) {
      const response = await fetch(`${decoded.payload.iss}/.well-known/oauth-authorization-server`);
      if (!response.ok) throw new Error(`metadata HTTP ${response.status}`);
      metadata = await response.json();
      if (metadata.issuer !== decoded.payload.iss) throw new Error('issuer metadata mismatch');
      metadataCache.set(decoded.payload.iss, metadata);
    }
    let jwks = jwksCache.get(metadata.jwks_uri);
    if (!jwks) {
      const response = await fetch(metadata.jwks_uri);
      if (!response.ok) throw new Error(`jwks HTTP ${response.status}`);
      jwks = await response.json();
      jwksCache.set(metadata.jwks_uri, jwks);
    }
    const key = jwks.keys?.find(k => k.kid === decoded.protectedHeader.kid);
    if (!key) throw new Error('key_not_found');
    const { payload, protectedHeader } = verifyEs256Jwt({ token, publicJwk: key, expectedTyp: 'at+jwt', issuer: decoded.payload.iss, audience });
    const actor = payload.act?.sub;
    if (!actor || typeof actor !== 'string') return { valid: false, reason: 'missing_current_actor' };
    return { valid: true, principal: payload.sub, actor, payload, protectedHeader, metadata };
  } catch (error) {
    return { valid: false, reason: 'oauth_token_invalid', error: error.message };
  }
}

export function tokenAllowsDelete({ payload, customerId, audience }) {
  if (!String(payload.scope ?? '').split(/\s+/).includes('customer.delete')) return { allowed: false, reason: 'missing_scope' };
  const details = Array.isArray(payload.authorization_details) ? payload.authorization_details : [];
  const grant = details.find(x => x?.type === 'customer_data' && x.actions?.includes('delete') && x.locations?.includes(audience) && x.customer_ids?.includes(customerId));
  return grant ? { allowed: true, grant } : { allowed: false, reason: 'authorization_details_no_match' };
}
