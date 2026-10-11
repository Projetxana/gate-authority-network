import {
  generateKeyPairSync,
  sign
} from 'node:crypto';
import {
  verifySsfSet,
  normalizeCaepSessionRevoked,
  applyCaepSessionRevokedToEdges,
  CAEP_SESSION_REVOKED
} from '@gate-avn/ssf';
import { verifyLiveAuthority } from '../src/verify-live-authority.mjs';

function b64uJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signSet(payload, privateKey) {
  const header = {
    alg: 'ES256',
    typ: 'secevent+jwt',
    kid: 'stage8-live-caep-key'
  };

  const input = `${b64uJson(header)}.${b64uJson(payload)}`;
  const signature = sign(
    'sha256',
    Buffer.from(input),
    {
      key: privateKey,
      dsaEncoding: 'ieee-p1363'
    }
  ).toString('base64url');

  return `${input}.${signature}`;
}

const { publicKey, privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256'
});

const publicJwk = publicKey.export({ format: 'jwk' });
const nowSec = Math.floor(Date.now() / 1000);

const payload = {
  iss: 'https://issuer.stage8.example',
  aud: 'urn:gate:stage8:ssf-receiver',
  jti: `caep-${crypto.randomUUID()}`,
  iat: nowSec,
  sub_id: {
    format: 'opaque',
    id: 'delegation-session-A'
  },
  events: {
    [CAEP_SESSION_REVOKED]: {
      event_timestamp: nowSec,
      initiating_entity: 'policy'
    }
  }
};

const token = signSet(payload, privateKey);
const verified = verifySsfSet(token, {
  publicJwk,
  issuer: payload.iss,
  audience: payload.aud,
  nowSec
});

const signal = normalizeCaepSessionRevoked(verified.payload);

const edges = [
  {
    edgeId: 'edge-demo-a',
    issuer: 'user:demo',
    subject: 'agent:C@company-c',
    status: 'ACTIVE'
  }
];

const before = verifyLiveAuthority({
  principal: 'user:demo',
  actor: 'agent:C@company-c',
  edges
});

const updated = await applyCaepSessionRevokedToEdges({
  edges,
  signal,
  resolveEdgeIds(subject) {
    return subject?.id === 'delegation-session-A'
      ? ['edge-demo-a']
      : [];
  }
});

const after = verifyLiveAuthority({
  principal: 'user:demo',
  actor: 'agent:C@company-c',
  edges: updated
});

if (
  before.decision !== 'ALLOW' ||
  after.decision !== 'DENY' ||
  after.authority !== 'INVALID'
) {
  throw new Error('SSF/CAEP authority transition proof failed');
}

process.stdout.write(JSON.stringify({
  ok: true,
  proof:
    'signed SSF SET -> CAEP session-revoked -> mapped GATE authority edge -> same verify call changes ALLOW to DENY',
  cryptography: {
    alg: 'ES256',
    typ: 'secevent+jwt',
    signatureVerified: true
  },
  caep: {
    eventType: signal.eventType,
    issuer: signal.issuer,
    subject: signal.subject
  },
  before: {
    authority: before.authority,
    decision: before.decision
  },
  after: {
    authority: after.authority,
    decision: after.decision,
    reason: after.reason
  }
}, null, 2) + '\n');
