import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  sign
} from 'node:crypto';
import {
  verifySsfSet,
  normalizeCaepSessionRevoked,
  applyCaepSessionRevokedToEdges,
  CAEP_SESSION_REVOKED
} from '../packages/ssf/src/index.mjs';
import { verifyLiveAuthority } from '../src/verify-live-authority.mjs';

function b64uJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signSet(payload, privateKey) {
  const header = {
    alg: 'ES256',
    typ: 'secevent+jwt',
    kid: 'stage8-caep-key'
  };

  const signingInput =
    `${b64uJson(header)}.${b64uJson(payload)}`;

  const signature = sign(
    'sha256',
    Buffer.from(signingInput),
    {
      key: privateKey,
      dsaEncoding: 'ieee-p1363'
    }
  ).toString('base64url');

  return `${signingInput}.${signature}`;
}

test('signed CAEP session-revoked changes the same GATE authority path from ALLOW to DENY', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256'
  });

  const publicJwk = publicKey.export({ format: 'jwk' });
  const nowSec = Math.floor(Date.now() / 1000);

  const payload = {
    iss: 'https://idp.example.test',
    aud: 'urn:gate:stage8:ssf-receiver',
    jti: 'caep-stage8-1',
    iat: nowSec,
    txn: 'txn-stage8-1',
    sub_id: {
      format: 'opaque',
      id: 'session-agent-a'
    },
    events: {
      [CAEP_SESSION_REVOKED]: {
        event_timestamp: nowSec
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

  const signal =
    normalizeCaepSessionRevoked(verified.payload);

  const edges = [
    {
      edgeId: 'edge-root-a',
      issuer: 'user:demo',
      subject: 'agent:A@company-a',
      status: 'ACTIVE'
    },
    {
      edgeId: 'edge-a-c',
      issuer: 'agent:A@company-a',
      subject: 'agent:C@company-c',
      status: 'ACTIVE'
    }
  ];

  const before = verifyLiveAuthority({
    principal: 'user:demo',
    actor: 'agent:C@company-c',
    edges
  });

  assert.equal(before.authority, 'VALID');
  assert.equal(before.decision, 'ALLOW');

  const updated = await applyCaepSessionRevokedToEdges({
    edges,
    signal,
    resolveEdgeIds(subject) {
      assert.equal(subject.format, 'opaque');
      assert.equal(subject.id, 'session-agent-a');
      return ['edge-root-a'];
    }
  });

  const after = verifyLiveAuthority({
    principal: 'user:demo',
    actor: 'agent:C@company-c',
    edges: updated
  });

  assert.equal(after.authority, 'INVALID');
  assert.equal(after.decision, 'DENY');
  assert.equal(after.reason, 'all_authority_paths_revoked_or_invalid');
});

test('SSF verifier rejects forbidden exp/sub claims and bad audience', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256'
  });

  const publicJwk = publicKey.export({ format: 'jwk' });
  const nowSec = Math.floor(Date.now() / 1000);

  const base = {
    iss: 'https://idp.example.test',
    aud: 'urn:gate:stage8:ssf-receiver',
    jti: 'caep-stage8-2',
    iat: nowSec,
    sub_id: { format: 'opaque', id: 'session-agent-a' },
    events: {
      [CAEP_SESSION_REVOKED]: {
        event_timestamp: nowSec
      }
    }
  };

  assert.throws(
    () => verifySsfSet(
      signSet({ ...base, exp: nowSec + 60 }, privateKey),
      { publicJwk, issuer: base.iss, audience: base.aud, nowSec }
    ),
    /ssf_exp_claim_not_allowed/
  );

  assert.throws(
    () => verifySsfSet(
      signSet(base, privateKey),
      {
        publicJwk,
        issuer: base.iss,
        audience: 'urn:wrong-audience',
        nowSec
      }
    ),
    /ssf_audience_mismatch/
  );
});
