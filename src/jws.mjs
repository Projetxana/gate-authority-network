import crypto from 'node:crypto';

export function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodePart(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

export function generateEs256KeyPair({ kid = crypto.randomUUID() } = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  return {
    publicKey,
    privateKey,
    publicJwk: { ...jwk, kid, use: 'sig', alg: 'ES256' }
  };
}

export function signJwt({ header, payload, privateKey }) {
  const encodedHeader = base64urlJson(header);
  const encodedPayload = base64urlJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363'
  }).toString('base64url');
  return `${signingInput}.${signature}`;
}

export function decodeJwtUnsafe(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) throw new Error('malformed_jwt');
  return { protectedHeader: decodePart(parts[0]), payload: decodePart(parts[1]) };
}

export function verifyEs256Jwt({ token, publicJwk, expectedTyp, issuer, audience, clockSkewSec = 5 }) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) throw new Error('malformed_jwt');
  const protectedHeader = decodePart(parts[0]);
  const payload = decodePart(parts[1]);
  if (protectedHeader.alg !== 'ES256') throw new Error('unexpected_alg');
  if (expectedTyp && protectedHeader.typ !== expectedTyp) throw new Error('unexpected_typ');
  if (publicJwk.kid && protectedHeader.kid !== publicJwk.kid) throw new Error('unknown_kid');
  const publicKey = crypto.createPublicKey({ key: publicJwk, format: 'jwk' });
  const ok = crypto.verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), {
    key: publicKey,
    dsaEncoding: 'ieee-p1363'
  }, Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('invalid_signature');
  const now = Math.floor(Date.now() / 1000);
  if (issuer && payload.iss !== issuer) throw new Error('issuer_mismatch');
  if (audience) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(audience)) throw new Error('audience_mismatch');
  }
  if (payload.exp != null && Number(payload.exp) < now - clockSkewSec) throw new Error('token_expired');
  if (payload.nbf != null && Number(payload.nbf) > now + clockSkewSec) throw new Error('token_not_yet_valid');
  return { protectedHeader, payload };
}
