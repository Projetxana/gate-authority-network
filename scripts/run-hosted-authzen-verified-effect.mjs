import http from 'node:http';
import {
  GateClient,
  createVerifiedEffectReporter
} from '@gate-avn/sdk';
import { createAuthZenEffectGuard } from '@gate-avn/authzen';

const endpoint = process.env.GATE_URL;
const apiKey = process.env.GATE_API_KEY;
const metricsEndpoint = process.env.GATE_METRICS_URL;

if (!endpoint) throw new Error('GATE_URL is required');
if (!apiKey) throw new Error('GATE_API_KEY is required');
if (!metricsEndpoint) throw new Error('GATE_METRICS_URL is required');

async function summary() {
  const response = await fetch(
    `${metricsEndpoint.replace(/\/$/, '')}/summary`,
    { cache: 'no-store' }
  );
  if (!response.ok) throw new Error(`Metrics summary HTTP ${response.status}`);
  return response.json();
}

const n = value => Number(value || 0);

const before = await summary();
const beforeToday = n(before?.verifiedEffects?.verified_effects_today);
const beforeAuthZen = n(before?.verifiedEffects?.authzen_30d);

const pdp = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/access/v1/evaluation') {
    res.writeHead(404).end();
    return;
  }

  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw || '{}');

  const valid =
    body?.subject?.type &&
    body?.subject?.id &&
    body?.action?.name &&
    body?.resource?.type &&
    body?.resource?.id;

  res.writeHead(valid ? 200 : 400, {
    'content-type': 'application/json'
  });
  res.end(JSON.stringify(
    valid
      ? { decision: true, context: { policy: 'stage7-demo-permit' } }
      : { decision: false }
  ));
});

await new Promise(resolve => pdp.listen(0, '127.0.0.1', resolve));
const pdpUrl = `http://127.0.0.1:${pdp.address().port}`;

try {
  const evaluationRequest = {
    subject: { type: 'user', id: 'user:demo' },
    action: { name: 'approve_purchase' },
    resource: { type: 'purchase_order', id: 'PO-STAGE7' },
    context: { channel: 'agent' }
  };

  const pdpResponse = await fetch(
    `${pdpUrl}/access/v1/evaluation`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(evaluationRequest)
    }
  );

  if (!pdpResponse.ok) {
    throw new Error(`AuthZEN PDP HTTP ${pdpResponse.status}`);
  }

  const evaluationResponse = await pdpResponse.json();

  const gate = new GateClient({
    endpoint,
    apiKey,
    timeoutMs: 5000,
    source: 'api',
    clientVersion: 'network-v1-stage7-authzen'
  });

  const reporter = createVerifiedEffectReporter({
    endpoint: metricsEndpoint,
    apiKey
  });

  const guard = createAuthZenEffectGuard({
    gate,
    principal: 'user:demo',
    actor: 'agent:C@company-c',
    consistency: 'bounded',
    reporter
  });

  let effectExecuted = false;

  const outcome = await guard.enforce(
    { evaluationRequest, evaluationResponse },
    async () => {
      effectExecuted = true;
      return { purchaseOrder: 'PO-STAGE7', approved: true };
    }
  );

  if (!effectExecuted || outcome?.decision?.decision !== 'ALLOW') {
    throw new Error('AuthZEN/GATE protected effect did not execute');
  }

  if (
    outcome?.networkMetering?.sent !== true ||
    outcome?.networkMetering?.metered !== true
  ) {
    throw new Error('AuthZEN Verified Effect was not persisted');
  }

  const after = await summary();
  const afterToday = n(after?.verifiedEffects?.verified_effects_today);
  const afterAuthZen = n(after?.verifiedEffects?.authzen_30d);

  if (afterToday < beforeToday + 1) {
    throw new Error('Verified Effects today did not advance');
  }
  if (afterAuthZen < beforeAuthZen + 1) {
    throw new Error('AuthZEN protocol counter did not advance');
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    proof:
      'AuthZEN /access/v1/evaluation permit -> hosted GATE -> network meter -> effect',
    authzen: {
      endpoint: '/access/v1/evaluation',
      policyDecision: evaluationResponse.decision
    },
    authority: outcome.decision.authority,
    decision: outcome.decision.decision,
    verifiedEffect: outcome.verifiedEffect,
    networkMetering: outcome.networkMetering,
    networkCounter: {
      verifiedEffectsToday: {
        before: beforeToday,
        after: afterToday,
        delta: afterToday - beforeToday
      },
      authzen30d: {
        before: beforeAuthZen,
        after: afterAuthZen,
        delta: afterAuthZen - beforeAuthZen
      }
    },
    effectExecuted
  }, null, 2) + '\n');
} finally {
  await new Promise(resolve => pdp.close(resolve));
}
