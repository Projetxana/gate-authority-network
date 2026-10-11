import {
  generateKeyPairSync,
  sign,
  randomUUID
} from 'node:crypto';
import {
  verifySsfSet,
  normalizeCaepSessionRevoked,
  caepSessionRevokedToGateAuthorityEvent,
  CAEP_SESSION_REVOKED,
  GATE_AUTHORITY_EDGE_EVENT
} from '@gate-avn/ssf';

const base =
  process.env.GATE_CANONICAL_URL ||
  'https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-network';

function b64uJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signJwt(payload, privateKey, kid, typ = 'JWT') {
  const header = {
    alg: 'ES256',
    kid,
    ...(typ ? { typ } : {})
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

async function api(path, {
  apiKey,
  body,
  expected
} = {}) {
  const response = await fetch(
    `${base.replace(/\/$/, '')}${path}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey
          ? { authorization: `Bearer ${apiKey}` }
          : {})
      },
      body: JSON.stringify(body ?? {})
    }
  );

  const payload = await response.json();

  if (expected && response.status !== expected) {
    throw new Error(
      `${path} expected HTTP ${expected}, got ${response.status}: ${JSON.stringify(payload)}`
    );
  }

  return {
    status: response.status,
    body: payload
  };
}

async function verifyAuthority(apiKey, principal, actor) {
  const response = await api('/v1/authority/verify', {
    apiKey,
    expected: 200,
    body: {
      principal,
      actor,
      action: {
        protocol: 'internal',
        name: 'stage10_canonical_ssf_bridge'
      },
      consistency: 'bounded'
    }
  });

  return response.body;
}

const registration = await api('/projects/register', {
  expected: 201,
  body: {
    name: `GATE Stage 10 SSF disposable ${randomUUID().slice(0, 8)}`
  }
});

const projectId = registration.body?.project?.id;
const apiKey = registration.body?.apiKey;
const audience = registration.body?.audience;
const nativeEventType = registration.body?.eventType;

if (!projectId || !apiKey || !audience) {
  throw new Error('Disposable canonical GATE project was not created');
}

if (nativeEventType !== GATE_AUTHORITY_EDGE_EVENT) {
  throw new Error(
    `Unexpected canonical event type: ${nativeEventType}`
  );
}

// Source key: represents an external SSF / CAEP transmitter.
const sourceKeys = generateKeyPairSync('ec', {
  namedCurve: 'P-256'
});
const sourcePublicJwk = sourceKeys.publicKey.export({
  format: 'jwk'
});

// Bridge key: trusted by the disposable GATE project to transform
// verified external source signals into canonical authority-edge events.
const bridgeKeys = generateKeyPairSync('ec', {
  namedCurve: 'P-256'
});
const bridgeKid = `stage10-bridge-${randomUUID()}`;
const bridgePublicJwk = {
  ...bridgeKeys.publicKey.export({ format: 'jwk' }),
  kid: bridgeKid,
  alg: 'ES256',
  use: 'sig'
};

const bridgeIssuer =
  `urn:gate:connector:ssf:${randomUUID()}`;

const issuerRegistration = await api('/v1/issuers/register', {
  apiKey,
  expected: 201,
  body: {
    issuer: bridgeIssuer,
    publicJwk: bridgePublicJwk,
    principalPatterns: ['stage10:*']
  }
});

if (
  issuerRegistration.body?.issuer?.keyId !== bridgeKid
) {
  throw new Error('Canonical bridge issuer registration failed');
}

const principal = 'stage10:principal';
const actor = 'stage10:actor';
const edgeId = 'edge-stage10-ssf';
const nowSec = Math.floor(Date.now() / 1000);

// Establish the canonical live authority edge.
const activePayload = {
  iss: bridgeIssuer,
  aud: audience,
  iat: nowSec,
  jti: `stage10-active-${randomUUID()}`,
  events: {
    [GATE_AUTHORITY_EDGE_EVENT]: {
      edge_id: edgeId,
      issuer_principal: principal,
      subject_principal: actor,
      status: 'ACTIVE',
      sequence: 1,
      event_timestamp: new Date(nowSec * 1000).toISOString(),
      valid_until: new Date(
        Date.now() + 10 * 60 * 1000
      ).toISOString()
    }
  }
};

const activeToken = signJwt(
  activePayload,
  bridgeKeys.privateKey,
  bridgeKid
);

await api('/v1/authority/events', {
  apiKey,
  expected: 202,
  body: { set: activeToken }
});

const before = await verifyAuthority(
  apiKey,
  principal,
  actor
);

if (
  before.authority !== 'VALID' ||
  before.decision !== 'ALLOW'
) {
  throw new Error(
    `Expected canonical ALLOW before SSF revoke: ${JSON.stringify(before)}`
  );
}

// External SSF source emits a signed CAEP session-revoked SET.
const sourceIssuer = 'https://idp.stage10.example';
const sourceAudience = `urn:gate:ssf-source:${projectId}`;
const subject = {
  format: 'opaque',
  id: 'delegation-session-stage10'
};

const ssfPayload = {
  iss: sourceIssuer,
  aud: sourceAudience,
  jti: `stage10-ssf-${randomUUID()}`,
  iat: nowSec,
  sub_id: subject,
  events: {
    [CAEP_SESSION_REVOKED]: {
      event_timestamp: nowSec,
      initiating_entity: 'policy'
    }
  }
};

const ssfSet = signJwt(
  ssfPayload,
  sourceKeys.privateKey,
  'stage10-source-key',
  'secevent+jwt'
);

const verifiedSet = verifySsfSet(ssfSet, {
  publicJwk: sourcePublicJwk,
  issuer: sourceIssuer,
  audience: sourceAudience,
  nowSec
});

const signal =
  normalizeCaepSessionRevoked(verifiedSet.payload);

// Trusted connector maps the external source subject to the canonical
// delegation edge and signs the transformed GATE event with its own key.
const revokePayload =
  caepSessionRevokedToGateAuthorityEvent({
    signal,
    mapping: {
      subjectFormat: subject.format,
      subjectId: subject.id,
      edgeId,
      issuerPrincipal: principal,
      subjectPrincipal: actor
    },
    bridgeIssuer,
    audience,
    sequence: 2,
    iatSec: nowSec,
    jti: `stage10-bridge-revoke-${randomUUID()}`
  });

const revokeToken = signJwt(
  revokePayload,
  bridgeKeys.privateKey,
  bridgeKid
);

const ingest = await api('/v1/authority/events', {
  apiKey,
  expected: 202,
  body: { set: revokeToken }
});

if (
  ingest.body?.accepted !== true ||
  ingest.body?.event?.status !== 'REVOKED'
) {
  throw new Error(
    `Canonical revocation event was not accepted: ${JSON.stringify(ingest.body)}`
  );
}

const after = await verifyAuthority(
  apiKey,
  principal,
  actor
);

if (
  after.authority !== 'INVALID' ||
  after.decision !== 'DENY'
) {
  throw new Error(
    `Expected canonical DENY after SSF revoke: ${JSON.stringify(after)}`
  );
}

// Withdraw the disposable connector issuer trust at the end.
await api('/v1/issuers/revoke', {
  apiKey,
  expected: 200,
  body: {
    issuer: bridgeIssuer,
    keyId: bridgeKid
  }
});

process.stdout.write(JSON.stringify({
  ok: true,
  proof:
    'external signed SSF/CAEP -> trusted connector -> canonical GATE v7 authority store -> same canonical verify changes ALLOW to DENY',
  canonicalNetwork: {
    endpoint: base,
    projectId,
    disposableProject: true,
    apiKeyPrinted: false
  },
  source: {
    profile: 'OpenID SSF / CAEP 1.0',
    issuer: sourceIssuer,
    signatureVerified: true,
    eventType: CAEP_SESSION_REVOKED
  },
  bridge: {
    issuer: bridgeIssuer,
    canonicalEventType: GATE_AUTHORITY_EDGE_EVENT,
    mappingExplicit: true,
    sequence: 2
  },
  before: {
    authority: before.authority,
    decision: before.decision,
    servedBy: before.servedBy ?? null
  },
  after: {
    authority: after.authority,
    decision: after.decision,
    reason: after.reason,
    servedBy: after.servedBy ?? null
  },
  productionCodeModified: false,
  disposableIssuerTrustRevoked: true
}, null, 2) + '\n');
