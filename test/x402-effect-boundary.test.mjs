import test from 'node:test';
import assert from 'node:assert/strict';
import { x402ResourceServer } from '@x402/core/server';
import {
  createX402AuthorityEnforcer,
  registerGateX402AuthorityHooks
} from '../packages/x402/src/index.mjs';

function reporter(events) {
  return {
    async report(event) {
      events.push(event);
      return {
        sent: true,
        metered: true,
        verificationId: event.verificationId
      };
    }
  };
}

test('registers directly on official x402ResourceServer lifecycle hooks', () => {
  const resourceServer = new x402ResourceServer();

  const result = registerGateX402AuthorityHooks(resourceServer, {
    gate: {
      async verify() {
        return { authority: 'VALID', decision: 'ALLOW' };
      }
    },
    principal: 'user:alice',
    actor: 'agent:buyer',
    operation: 'GET /premium'
  });

  assert.equal(result.resourceServer, resourceServer);
  assert.equal(typeof result.enforcer.evaluate, 'function');
});

test('x402 verified-payment boundary sends protocol=x402 and allows the handler only on GATE ALLOW', async () => {
  let verifyRequest;
  const events = [];

  const enforcer = createX402AuthorityEnforcer({
    gate: {
      async verify(input) {
        verifyRequest = input;
        return {
          authority: 'VALID',
          decision: 'ALLOW',
          servedBy: 'gate-network:test'
        };
      }
    },
    principal: 'user:alice',
    actor: 'agent:buyer',
    operation: 'GET /premium',
    resource: 'resource:premium',
    reporter: reporter(events),
    idFactory: () => 'gv_x402_allow_0001',
    now: () => '2026-10-11T12:45:00.000Z'
  });

  const outcome = await enforcer.evaluate({
    result: { isValid: true, payer: '0xPAYER' },
    requirements: {
      scheme: 'exact',
      network: 'eip155:84532',
      amount: '1000',
      asset: '0xUSDC',
      payTo: '0xSELLER',
      extra: { paymentFlow: 'authorization' }
    }
  });

  assert.equal(outcome.allowed, true);
  assert.equal(outcome.hookResult, undefined);
  assert.equal(verifyRequest.action.protocol, 'x402');
  assert.equal(verifyRequest.action.name, 'GET /premium');
  assert.equal(verifyRequest.action.parameters.scheme, 'exact');
  assert.equal(verifyRequest.action.parameters.network, 'eip155:84532');

  assert.equal(outcome.verifiedEffect.protocol, 'x402');
  assert.equal(outcome.networkMetering.metered, true);

  // Payment/wallet details do not enter the economic meter.
  assert.equal('payer' in events[0], false);
  assert.equal('payTo' in events[0], false);
  assert.equal('amount' in events[0], false);
  assert.equal('asset' in events[0], false);
});

test('GATE DENY returns an x402 hook abort before the resource handler', async () => {
  const enforcer = createX402AuthorityEnforcer({
    gate: {
      async verify() {
        return {
          authority: 'INVALID',
          decision: 'DENY',
          reason: 'authority_revoked'
        };
      }
    },
    principal: 'user:alice',
    actor: 'agent:buyer',
    operation: 'GET /premium',
    idFactory: () => 'gv_x402_deny_0001'
  });

  const outcome = await enforcer.evaluate({
    result: { isValid: true },
    requirements: {
      scheme: 'exact',
      network: 'eip155:84532'
    }
  });

  assert.equal(outcome.allowed, false);
  assert.deepEqual(outcome.hookResult, {
    abort: true,
    reason: 'gate_authority_denied',
    message: 'authority_revoked'
  });
});

test('official hook adapter also protects pre-handler settle flows', async () => {
  const hooks = {};
  const fakeResourceServer = {
    onAfterVerify(fn) {
      hooks.afterVerify = fn;
      return this;
    },
    onBeforeSettle(fn) {
      hooks.beforeSettle = fn;
      return this;
    }
  };

  let calls = 0;

  registerGateX402AuthorityHooks(fakeResourceServer, {
    gate: {
      async verify() {
        calls += 1;
        return { authority: 'VALID', decision: 'ALLOW' };
      }
    },
    principal: 'user:alice',
    actor: 'agent:buyer',
    operation: 'POST /upfront'
  });

  await hooks.beforeSettle({
    phase: 'after-handler',
    requirements: { scheme: 'exact', network: 'eip155:84532' }
  });
  assert.equal(calls, 0);

  await hooks.beforeSettle({
    phase: 'before-handler',
    requirements: {
      scheme: 'exact',
      network: 'eip155:84532',
      extra: { paymentFlow: 'upfront' }
    }
  });
  assert.equal(calls, 1);
});
