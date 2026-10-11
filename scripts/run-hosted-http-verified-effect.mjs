import { startHostedHttpEffectServer } from '../examples/http-hosted-effect-boundary-server.mjs';

const metricsEndpoint = process.env.GATE_METRICS_URL;
if (!metricsEndpoint) throw new Error('GATE_METRICS_URL is required');

async function summary() {
  const response = await fetch(`${metricsEndpoint.replace(/\/$/, '')}/summary`, {
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Metrics summary HTTP ${response.status}`);
  return response.json();
}

function n(value) {
  return Number(value || 0);
}

const before = await summary();
const beforeToday = n(before?.verifiedEffects?.verified_effects_today);
const beforeHttp30 = n(before?.verifiedEffects?.http_30d);

const { server, url, orders } = await startHostedHttpEffectServer();

try {
  const response = await fetch(`${url}/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      orderId: 'PO-NETWORK-V1-STAGE5',
      amount: 125,
      currency: 'CAD'
    })
  });

  const body = await response.json();

  if (response.status !== 201) {
    throw new Error(`HTTP route returned ${response.status}: ${JSON.stringify(body)}`);
  }

  if (body?.decision?.decision !== 'ALLOW') {
    throw new Error(`Expected ALLOW, got ${body?.decision?.decision}`);
  }

  if (body?.executed !== true || orders.length !== 1) {
    throw new Error('HTTP effect did not execute exactly once');
  }

  if (
    body?.networkMetering?.sent !== true ||
    body?.networkMetering?.metered !== true
  ) {
    throw new Error(
      `HTTP Verified Effect was not persisted: ${JSON.stringify(body?.networkMetering)}`
    );
  }

  if (body?.verifiedEffect?.protocol !== 'http') {
    throw new Error(`Expected protocol=http, got ${body?.verifiedEffect?.protocol}`);
  }

  const after = await summary();
  const afterToday = n(after?.verifiedEffects?.verified_effects_today);
  const afterHttp30 = n(after?.verifiedEffects?.http_30d);

  if (afterToday < beforeToday + 1) {
    throw new Error(
      `Verified Effects today did not advance: before=${beforeToday} after=${afterToday}`
    );
  }

  if (afterHttp30 < beforeHttp30 + 1) {
    throw new Error(
      `HTTP counter did not advance: before=${beforeHttp30} after=${afterHttp30}`
    );
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    proof: 'HTTP POST /orders -> hosted GATE verify -> network meter -> ALLOW -> effect',
    authority: body.decision.authority,
    decision: body.decision.decision,
    servedBy: body.decision.servedBy ?? null,
    verifiedEffect: body.verifiedEffect,
    networkMetering: body.networkMetering,
    networkCounter: {
      verifiedEffectsToday: {
        before: beforeToday,
        after: afterToday,
        delta: afterToday - beforeToday
      },
      http30d: {
        before: beforeHttp30,
        after: afterHttp30,
        delta: afterHttp30 - beforeHttp30
      }
    },
    effectExecuted: true,
    order: body.result
  }, null, 2) + '\n');
} finally {
  await new Promise(resolve => server.close(resolve));
}
