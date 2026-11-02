import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';

const GATE =
  process.env.GATE_CANONICAL_URL ||
  ['https:', '', 'ufqtoyakmrddqytrkcje.supabase.co', 'functions', 'v1', 'gate-network'].join('/');

const EVENT_TYPE = 'urn:gate:event:authority-edge-state:v1';

function b64u(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signJwt(payload, privateKey, kid) {
  const header = b64u({ alg: 'ES256', kid, typ: 'secevent+jwt' });
  const body = b64u(payload);
  const input = `${header}.${body}`;
  const signature = sign(
    'sha256',
    Buffer.from(input),
    { key: privateKey, dsaEncoding: 'ieee-p1363' }
  ).toString('base64url');
  return `${input}.${signature}`;
}

async function api(path, { apiKey, body, expected }) {
  const response = await fetch(`${GATE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify(body ?? {})
  });

  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; }
  catch { parsed = text; }

  if (response.status !== expected) {
    throw new Error(
      `${path} expected ${expected}, got ${response.status}: ${JSON.stringify(parsed)}`
    );
  }
  return parsed;
}

function eventPayload({ issuer, audience, edgeId, principal, actor, status, sequence, reason }) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: issuer,
    aud: audience,
    iat: now,
    jti: `${status.toLowerCase()}-${sequence}-${randomUUID()}`,
    events: {
      [EVENT_TYPE]: {
        edge_id: edgeId,
        issuer_principal: principal,
        subject_principal: actor,
        status,
        sequence,
        event_timestamp: new Date().toISOString(),
        ...(status === 'ACTIVE'
          ? { valid_until: new Date(Date.now() + 10 * 60 * 1000).toISOString() }
          : {}),
        ...(reason ? { reason } : {})
      }
    }
  };
}

async function verify(apiKey, principal, actor) {
  return api('/v1/authority/verify', {
    apiKey,
    expected: 200,
    body: {
      principal,
      actor,
      action: {
        protocol: 'oauth-bounded-work',
        name: 'same_effect',
        resource: 'resource:shared'
      },
      consistency: 'bounded'
    }
  });
}

const nonce = randomUUID();
const principal = `bounded-work:principal:${nonce}`;
const actor = `bounded-work:actor:${nonce}`;
const issuer = `urn:gate:bounded-work-probe:${nonce}`;
const kid = `bounded-work-${nonce}`;
const edgeA = `bounded-work-A-${nonce}`;
const edgeB = `bounded-work-B-${nonce}`;

let apiKey = null;
let registeredIssuer = false;

try {
  console.log('=== OAUTH BOUNDED WORK COLLISION PROBE ===');

  const registration = await api('/projects/register', {
    expected: 201,
    body: { name: `GATE bounded-work collision ${nonce.slice(0, 8)}` }
  });

  apiKey = registration?.apiKey;
  const projectId = registration?.project?.id;
  const audience = registration?.audience;

  if (!apiKey || !projectId || !audience) {
    throw new Error('Disposable project registration failed');
  }

  const keys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const publicJwk = {
    ...keys.publicKey.export({ format: 'jwk' }),
    kid,
    alg: 'ES256',
    use: 'sig'
  };

  await api('/v1/issuers/register', {
    apiKey,
    expected: 201,
    body: {
      issuer,
      publicJwk,
      principalPatterns: ['bounded-work:principal:*']
    }
  });

  registeredIssuer = true;

  for (const [edgeId, sequence] of [[edgeA, 1], [edgeB, 2]]) {
    const active = eventPayload({
      issuer, audience, edgeId, principal, actor, status: 'ACTIVE', sequence
    });
    await api('/v1/authority/events', {
      apiKey,
      expected: 202,
      body: { set: signJwt(active, keys.privateKey, kid) }
    });
  }

  const before = await verify(apiKey, principal, actor);
  if (before.authority !== 'VALID' || before.decision !== 'ALLOW') {
    throw new Error(`Expected initial ALLOW: ${JSON.stringify(before)}`);
  }

  const revokedA = eventPayload({
    issuer,
    audience,
    edgeId: edgeA,
    principal,
    actor,
    status: 'REVOKED',
    sequence: 3,
    reason: 'oauth_bounded_work_A_withdrawn'
  });

  await api('/v1/authority/events', {
    apiKey,
    expected: 202,
    body: { set: signJwt(revokedA, keys.privateKey, kid) }
  });

  const after = await verify(apiKey, principal, actor);

  const gapConfirmed =
    after.authority === 'VALID' &&
    after.decision === 'ALLOW';

  console.log(
    'GATE_BOUNDED_WORK_COLLISION_TRACE',
    JSON.stringify({
      projectId,
      disposableProject: true,
      apiKeyPrinted: false,
      samePrincipal: true,
      sameActor: true,
      sameResourceAndAction: true,
      conceptualWorkA: { edgeId: edgeA, currentState: 'REVOKED' },
      conceptualWorkB: { edgeId: edgeB, currentState: 'ACTIVE' },
      before: {
        authority: before.authority,
        decision: before.decision
      },
      afterWorkARevocation: {
        authority: after.authority,
        decision: after.decision,
        selectedEdges: after.selectedEdges ?? null,
        reason: after.reason ?? null
      },
      gapConfirmed,
      interpretation: gapConfirmed
        ? 'Current public verify contract resolves any live principal-to-actor path and has no governing-authorization selector. This is an interoperability gap for OAuth Bounded Work isolation, not a vulnerability claim under the current contract.'
        : 'Observed behavior changed; inspect before implementing an authority-context selector.'
    }, null, 2)
  );

  if (!gapConfirmed) {
    throw new Error('Expected current-contract collision was not reproduced');
  }

  console.log(
    'PASS: current public contract collision reproduced; authority-context binding is justified before implementation.'
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('daily_registration_limit')) {
    console.error(
      'Registration rate limit reached. Re-run later or adapt the probe to an existing disposable project without printing its API key.'
    );
  }

  throw error;
} finally {
  if (apiKey && registeredIssuer) {
    await api('/v1/issuers/revoke', {
      apiKey,
      expected: 200,
      body: { issuer, keyId: kid }
    }).catch(() => {});
  }
}
