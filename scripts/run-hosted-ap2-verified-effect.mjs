import {
  GateClient,
  createVerifiedEffectReporter
} from '@gate-avn/sdk';
import { createAp2EffectGuard } from '@gate-avn/ap2';

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

const n = value => Number(value || 0);

const before = await summary();
const beforeToday = n(before?.verifiedEffects?.verified_effects_today);
const beforeAp2 = n(before?.verifiedEffects?.ap2_30d);

const gate = new GateClient({
  endpoint,
  apiKey,
  timeoutMs: 5000,
  source: 'api',
  clientVersion: 'network-v1-stage8-ap2'
});

const reporter = createVerifiedEffectReporter({
  endpoint: metricsEndpoint,
  apiKey
});

const guard = createAp2EffectGuard({
  gate,
  principal: 'user:demo',
  actor: 'agent:C@company-c',
  consistency: 'bounded',
  reporter
});

let effectExecuted = false;

const outcome = await guard.enforce(
  {
    // This fixture represents the output of a conforming AP2 verifier.
    // Stage 8 does not pretend to reimplement Delegate SD-JWT.
    evidence: {
      verified: true,
      vct: 'mandate.payment.1',
      reference: 'stage8-preverified-ap2-fixture'
    },
    operation: 'payment.authorize',
    resource: 'checkout:stage8',
    parameters: {
      verifierRole: 'credential-provider'
    }
  },
  async () => {
    effectExecuted = true;
    return {
      paymentAuthorizationReleased: true,
      checkout: 'stage8'
    };
  }
);

if (!effectExecuted || outcome?.decision?.decision !== 'ALLOW') {
  throw new Error('AP2/GATE protected effect did not execute');
}

if (
  outcome?.networkMetering?.sent !== true ||
  outcome?.networkMetering?.metered !== true
) {
  throw new Error('AP2 Verified Effect was not persisted');
}

const after = await summary();
const afterToday = n(after?.verifiedEffects?.verified_effects_today);
const afterAp2 = n(after?.verifiedEffects?.ap2_30d);

if (afterToday < beforeToday + 1) {
  throw new Error('Verified Effects today did not advance');
}
if (afterAp2 < beforeAp2 + 1) {
  throw new Error('AP2 protocol counter did not advance');
}

process.stdout.write(JSON.stringify({
  ok: true,
  proof:
    'pre-verified AP2 payment mandate -> hosted GATE -> network meter -> payment effect',
  ap2: {
    spec: 'v0.2 bridge',
    mandateVct: 'mandate.payment.1',
    mandateCryptographyPerformedByThisSmoke: false
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
    ap230d: {
      before: beforeAp2,
      after: afterAp2,
      delta: afterAp2 - beforeAp2
    }
  },
  effectExecuted
}, null, 2) + '\n');
