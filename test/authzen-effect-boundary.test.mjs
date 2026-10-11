import test from 'node:test';
import assert from 'node:assert/strict';
import { GateDeniedError } from '../packages/sdk/dist/index.js';
import { createAuthZenEffectGuard } from '../packages/authzen/src/index.mjs';

const request = {
  subject: { type: 'user', id: 'alice@example.com' },
  action: { name: 'approve_purchase' },
  resource: { type: 'purchase_order', id: 'PO-42' },
  context: { channel: 'agent' }
};

test('AuthZEN policy denial short-circuits without a GATE call', async () => {
  let calls = 0;
  let executed = 0;

  const guard = createAuthZenEffectGuard({
    gate: {
      async verify() {
        calls += 1;
        return { authority: 'VALID', decision: 'ALLOW' };
      }
    },
    principal: 'user:demo',
    actor: 'agent:C@company-c'
  });

  const out = await guard.enforce(
    {
      evaluationRequest: request,
      evaluationResponse: { decision: false }
    },
    async () => {
      executed += 1;
    }
  );

  assert.equal(out.allowed, false);
  assert.equal(out.gateEvaluated, false);
  assert.equal(calls, 0);
  assert.equal(executed, 0);
});

test('AuthZEN permit plus GATE ALLOW executes and meters protocol=authzen', async () => {
  let gateRequest;
  let executed = 0;
  const events = [];

  const guard = createAuthZenEffectGuard({
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
    idFactory: () => 'gv_authzen_allow_0001'
  });

  const out = await guard.enforce(
    {
      evaluationRequest: request,
      evaluationResponse: { decision: true }
    },
    async () => {
      executed += 1;
      return { approved: true };
    }
  );

  assert.equal(executed, 1);
  assert.equal(gateRequest.action.protocol, 'authzen');
  assert.equal(gateRequest.action.name, 'approve_purchase');
  assert.equal(gateRequest.action.resource, 'purchase_order:PO-42');
  assert.equal(out.verifiedEffect.protocol, 'authzen');
  assert.equal(events.length, 1);
  assert.equal('principal' in events[0], false);
  assert.equal('actor' in events[0], false);
});

test('AuthZEN permit cannot override GATE live authority DENY', async () => {
  let executed = 0;

  const guard = createAuthZenEffectGuard({
    gate: {
      async verify() {
        return {
          authority: 'INVALID',
          decision: 'DENY',
          reason: 'upstream_authority_revoked'
        };
      }
    },
    principal: 'user:demo',
    actor: 'agent:C@company-c',
    idFactory: () => 'gv_authzen_deny_0001'
  });

  await assert.rejects(
    guard.enforce(
      {
        evaluationRequest: request,
        evaluationResponse: { decision: true }
      },
      async () => {
        executed += 1;
      }
    ),
    error => {
      assert.ok(error instanceof GateDeniedError);
      assert.equal(error.authzenDecision.decision, true);
      assert.equal(error.decision.authority, 'INVALID');
      return true;
    }
  );

  assert.equal(executed, 0);
});
