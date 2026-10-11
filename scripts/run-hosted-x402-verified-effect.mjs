import {
  GateClient,
  createVerifiedEffectReporter
} from '@gate-avn/sdk';
import { createX402AuthorityEnforcer } from '@gate-avn/x402';

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
  if (!response.ok) {
    throw new Error(`Metrics summary HTTP ${response.status}`);
  }
  return response.json();
}

function n(value) {
  return Number(value || 0);
}

const before = await summary();
const beforeToday = n(
  before?.verifiedEffects?.verified_effects_today
);
const beforeX402 = n(before?.verifiedEffects?.x402_30d);

const gate = new GateClient({
  endpoint,
  apiKey,
  timeoutMs: 5000,
  source: 'api',
  clientVersion: 'network-v1-stage6'
});

const reporter = createVerifiedEffectReporter({
  endpoint: metricsEndpoint,
  apiKey
});

const enforcer = createX402AuthorityEnforcer({
  gate,
  principal: 'user:demo',
  actor: 'agent:C@company-c',
  operation: 'GET /x402/premium-report',
  resource: 'x402:premium-report',
  consistency: 'bounded',
  reporter
});

// This is the x402 post-verification lifecycle context.
// No money is moved by this smoke. The GATE adapter is being exercised
// at the exact boundary used after x402 verification and before the effect.
const x402Context = {
  result: {
    isValid: true,
    payer: '0xTEST_PAYER_NOT_METERED'
  },
  requirements: {
    scheme: 'exact',
    network: 'eip155:84532',
    amount: '1000',
    asset: 'USDC-testnet',
    payTo: '0xTEST_SELLER_NOT_METERED',
    extra: {
      paymentFlow: 'authorization'
    }
  }
};

const outcome = await enforcer.evaluate(
  x402Context,
  'after-verify'
);

if (!outcome.allowed) {
  throw new Error(
    `GATE blocked x402 boundary: ${outcome.decision.authority} / ${outcome.decision.decision}`
  );
}

if (
  outcome.networkMetering?.sent !== true ||
  outcome.networkMetering?.metered !== true
) {
  throw new Error(
    `x402 Verified Effect was not persisted: ${JSON.stringify(outcome.networkMetering)}`
  );
}

// Benign stand-in for the resource handler. It only runs after x402
// payment verification context + hosted GATE ALLOW.
const resourceEffect = {
  delivered: true,
  resource: 'premium-report',
  bytes: 128
};

const after = await summary();
const afterToday = n(
  after?.verifiedEffects?.verified_effects_today
);
const afterX402 = n(after?.verifiedEffects?.x402_30d);

if (afterToday < beforeToday + 1) {
  throw new Error(
    `Verified Effects today did not advance: before=${beforeToday} after=${afterToday}`
  );
}

if (afterX402 < beforeX402 + 1) {
  throw new Error(
    `x402 counter did not advance: before=${beforeX402} after=${afterX402}`
  );
}

process.stdout.write(JSON.stringify({
  ok: true,
  proof:
    'x402 verified-payment boundary -> hosted GATE -> network meter -> ALLOW -> resource effect',
  paymentLifecycle: {
    x402Version: 2,
    scheme: 'exact',
    network: 'eip155:84532',
    paymentFlow: 'authorization',
    realFundsMoved: false
  },
  authority: outcome.decision.authority,
  decision: outcome.decision.decision,
  servedBy: outcome.decision.servedBy ?? null,
  verifiedEffect: outcome.verifiedEffect,
  networkMetering: outcome.networkMetering,
  networkCounter: {
    verifiedEffectsToday: {
      before: beforeToday,
      after: afterToday,
      delta: afterToday - beforeToday
    },
    x40230d: {
      before: beforeX402,
      after: afterX402,
      delta: afterX402 - beforeX402
    }
  },
  effectExecuted: resourceEffect.delivered,
  resourceEffect
}, null, 2) + '\n');
