import {
  generateKeyPairSync,
  sign,
  randomUUID
} from 'node:crypto';

const endpoint =
  process.env.GATE_SSF_PREVIEW_URL ||
  'https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-ssf-bridge-preview';

const CAEP_SESSION_REVOKED =
  'https://schemas.openid.net/secevent/caep/event-type/session-revoked';

function b64uJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signSet(payload, privateKey) {
  const header = {
    alg: 'ES256',
    typ: 'secevent+jwt',
    kid: 'stage9-hosted-caep-key'
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

async function call(path, {
  token,
  body,
  expected
} = {}) {
  const response = await fetch(
    `${endpoint.replace(/\/$/, '')}${path}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token
          ? { 'x-gate-ssf-preview-token': token }
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

const { publicKey, privateKey } = generateKeyPairSync(
  'ec',
  { namedCurve: 'P-256' }
);

const publicJwk = publicKey.export({ format: 'jwk' });

const issuer = 'https://issuer.stage9.example';
const subjectFormat = 'opaque';
const subjectId = 'delegation-session-stage9';
const principal = 'user:stage9';
const actor = 'agent:stage9@company';

const scenario = await call('/scenarios', {
  expected: 201,
  body: {
    issuer,
    publicJwk,
    subjectFormat,
    subjectId,
    principal,
    actor,
    edgeId: 'edge-stage9-caep'
  }
});

const scenarioId = scenario.body.scenarioId;
const token = scenario.body.token;
const audience = scenario.body.audience;

if (!scenarioId || !token || !audience) {
  throw new Error('Hosted SSF scenario did not return credentials');
}

const before = await call('/verify', {
  token,
  expected: 200,
  body: { scenarioId }
});

if (
  before.body.authority !== 'VALID' ||
  before.body.decision !== 'ALLOW'
) {
  throw new Error(
    `Expected initial ALLOW: ${JSON.stringify(before.body)}`
  );
}

const nowSec = Math.floor(Date.now() / 1000);

const setToken = signSet(
  {
    iss: issuer,
    aud: audience,
    jti: `stage9-${randomUUID()}`,
    iat: nowSec,
    sub_id: {
      format: subjectFormat,
      id: subjectId
    },
    events: {
      [CAEP_SESSION_REVOKED]: {
        event_timestamp: nowSec,
        initiating_entity: 'policy'
      }
    }
  },
  privateKey
);

const ingest = await call('/events/ssf', {
  token,
  expected: 202,
  body: {
    scenarioId,
    set: setToken
  }
});

if (
  ingest.body.accepted !== true ||
  ingest.body.event?.signatureVerified !== true ||
  ingest.body.authorityTransition?.status !== 'REVOKED'
) {
  throw new Error(
    `Hosted SSF event was not accepted: ${JSON.stringify(ingest.body)}`
  );
}

const after = await call('/verify', {
  token,
  expected: 200,
  body: { scenarioId }
});

if (
  after.body.authority !== 'INVALID' ||
  after.body.decision !== 'DENY'
) {
  throw new Error(
    `Expected DENY after CAEP revoke: ${JSON.stringify(after.body)}`
  );
}

// Same signed event must not be accepted twice.
const replay = await call('/events/ssf', {
  token,
  expected: 409,
  body: {
    scenarioId,
    set: setToken
  }
});

if (replay.body.error !== 'ssf_event_replay') {
  throw new Error(
    `Expected replay rejection: ${JSON.stringify(replay.body)}`
  );
}

process.stdout.write(JSON.stringify({
  ok: true,
  proof:
    'hosted signed SSF SET -> CAEP session-revoked -> hosted authority state -> same verify endpoint changes ALLOW to DENY',
  hostedService: 'gate-ssf-bridge-preview',
  productionV7Untouched:
    scenario.body.productionV7Untouched === true &&
    ingest.body.productionV7Untouched === true,
  cryptography: {
    alg: 'ES256',
    typ: 'secevent+jwt',
    signatureVerified:
      ingest.body.event.signatureVerified === true
  },
  source: {
    issuer,
    profile: 'OpenID SSF / CAEP 1.0',
    eventType: CAEP_SESSION_REVOKED,
    sequence: ingest.body.event.sequence
  },
  before: {
    authority: before.body.authority,
    decision: before.body.decision
  },
  after: {
    authority: after.body.authority,
    decision: after.body.decision,
    reason: after.body.reason
  },
  replayProtected: replay.body.error === 'ssf_event_replay'
}, null, 2) + '\n');
