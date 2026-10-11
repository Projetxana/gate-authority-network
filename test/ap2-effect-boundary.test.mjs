import test from 'node:test';
import assert from 'node:assert/strict';
import { GateDeniedError } from '../packages/sdk/dist/index.js';
import {
  assertVerifiedAp2Evidence,
  createAp2EffectGuard
} from '../packages/ap2/src/index.mjs';

test('AP2 bridge refuses unverified mandate evidence', () => {
  assert.throws(
    () => assertVerifiedAp2Evidence({
      verified: false,
      vct: 'mandate.payment.1'
    }),
    /ap2_mandate_not_verified/
  );
});

test('AP2 verified mandate plus GATE ALLOW executes and meters protocol=ap2', async () => {
  let gateRequest;
  let executed = 0;
  const events = [];

  const guard = createAp2EffectGuard({
    gate: {
      async verify(input) {
        gateRequest = input;
        return {
          authority: 'VALID',
          decision: 'ALLOW',
          servedBy: 'gate-network:test'
        };
      }
    },
    principal: 'user:demo',
    actor: 'agent:C@company-c',
    reporter: {
      async report(event) {
        events.push(event);
        return { sent: true, metered: true };
      }
    },
    idFactory: () => 'gv_ap2_allow_0001'
  });

  const out = await guard.enforce(
    {
      evidence: {
        verified: true,
        vct: 'mandate.payment.1',
        reference: 'mandate-hash-not-metered'
      },
      operation: 'payment.authorize',
      resource: 'checkout:stage8'
    },
    async () => {
      executed += 1;
      return { authorized: true };
    }
  );

  assert.equal(executed, 1);
  assert.equal(gateRequest.action.protocol, 'ap2');
  assert.equal(gateRequest.action.parameters.mandateVct, 'mandate.payment.1');
  assert.equal(out.verifiedEffect.protocol, 'ap2');
  assert.equal(events.length, 1);
  assert.equal('reference' in events[0], false);
});

test('AP2 verified mandate cannot override GATE live DENY', async () => {
  let executed = 0;

  const guard = createAp2EffectGuard({
    gate: {
      async verify() {
        return {
          authority: 'INVALID',
          decision: 'DENY',
          reason: 'authority_revoked'
        };
      }
    },
    principal: 'user:demo',
    actor: 'agent:C@company-c',
    idFactory: () => 'gv_ap2_deny_0001'
  });

  await assert.rejects(
    guard.enforce(
      {
        evidence: {
          verified: true,
          vct: 'mandate.checkout.1'
        },
        operation: 'checkout.complete'
      },
      async () => {
        executed += 1;
      }
    ),
    GateDeniedError
  );

  assert.equal(executed, 0);
});
