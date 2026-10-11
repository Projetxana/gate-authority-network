import test from 'node:test';
import assert from 'node:assert/strict';
import { GateDeniedError } from '../packages/sdk/dist/index.js';
import { createHttpEffectGuard } from '../packages/http/src/index.mjs';

function reporter(events) {
  return {
    async report(event) {
      events.push(event);
      return { sent: true, metered: true, verificationId: event.verificationId };
    }
  };
}

test('HTTP effect boundary executes only after ALLOW and meters protocol=http', async () => {
  let request;
  let executed = 0;
  const events = [];

  const guard = createHttpEffectGuard({
    gate: {
      async verify(input) {
        request = input;
        return { authority: 'VALID', decision: 'ALLOW', servedBy: 'gate-network:test' };
      }
    },
    principal: 'user:alice',
    actor: 'agent:orders',
    reporter: reporter(events),
    idFactory: () => 'gv_http_allow_0001',
    now: () => '2026-10-11T12:30:00.000Z'
  });

  const out = await guard.enforce(
    {
      operation: 'POST /orders',
      resource: 'order:PO-1',
      parameters: { amount: 42 }
    },
    async () => {
      executed += 1;
      return { orderId: 'PO-1' };
    }
  );

  assert.equal(executed, 1);
  assert.equal(request.action.protocol, 'http');
  assert.equal(request.action.name, 'POST /orders');
  assert.equal(out.verifiedEffect.protocol, 'http');
  assert.equal(out.networkMetering.metered, true);
  assert.equal(events.length, 1);
  assert.equal('principal' in events[0], false);
  assert.equal('actor' in events[0], false);
  assert.equal('resource' in events[0], false);
  assert.equal('parameters' in events[0], false);
});

test('HTTP effect boundary blocks INVALID / DENY before mutation', async () => {
  let executed = 0;
  const events = [];

  const guard = createHttpEffectGuard({
    gate: {
      async verify() {
        return { authority: 'INVALID', decision: 'DENY', reason: 'authority_revoked' };
      }
    },
    principal: 'user:alice',
    actor: 'agent:orders',
    reporter: reporter(events),
    idFactory: () => 'gv_http_deny_0001'
  });

  await assert.rejects(
    guard.enforce({ operation: 'DELETE /customers/:id' }, async () => {
      executed += 1;
    }),
    error => {
      assert.ok(error instanceof GateDeniedError);
      assert.equal(error.verifiedEffect.protocol, 'http');
      assert.equal(error.networkMetering.metered, true);
      return true;
    }
  );

  assert.equal(executed, 0);
});

test('HTTP effect boundary fails closed on UNKNOWN / DENY', async () => {
  let executed = 0;

  const guard = createHttpEffectGuard({
    gate: {
      async verify() {
        return { authority: 'UNKNOWN', decision: 'DENY', reason: 'authority_state_unknown' };
      }
    },
    principal: 'user:alice',
    actor: 'agent:orders'
  });

  await assert.rejects(
    guard.enforce({ operation: 'POST /payments' }, async () => {
      executed += 1;
    }),
    GateDeniedError
  );

  assert.equal(executed, 0);
});

test('HTTP operation is mandatory', async () => {
  const guard = createHttpEffectGuard({
    gate: { async verify() { throw new Error('must not be called'); } },
    principal: 'user:alice',
    actor: 'agent:orders'
  });

  await assert.rejects(guard.enforce({}, async () => {}), /operation is required/);
});
