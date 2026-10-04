import test from 'node:test';
import assert from 'node:assert/strict';
import { GateClient, GateDeniedError } from '../packages/sdk/dist/index.js';

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    }
  };
}

test('gate.enforce executes the effect only after ALLOW', async () => {
  let executed = 0;
  const gate = new GateClient({
    endpoint: 'https://gate.test',
    fetchImpl: async () => response({
      authority: 'VALID',
      decision: 'ALLOW',
      reason: null
    })
  });

  const out = await gate.enforce(
    {
      principal: 'user:alice',
      actor: 'agent:buyer',
      action: { name: 'purchase_order_create' }
    },
    async () => {
      executed += 1;
      return { purchaseOrderId: 'PO-1' };
    }
  );

  assert.equal(executed, 1);
  assert.equal(out.decision.decision, 'ALLOW');
  assert.equal(out.result.purchaseOrderId, 'PO-1');
});

test('gate.enforce blocks the effect on DENY', async () => {
  let executed = 0;
  const gate = new GateClient({
    endpoint: 'https://gate.test',
    fetchImpl: async () => response({
      authority: 'INVALID',
      decision: 'DENY',
      reason: 'all_authority_paths_revoked_or_invalid'
    })
  });

  await assert.rejects(
    gate.enforce(
      {
        principal: 'user:alice',
        actor: 'agent:buyer',
        action: { name: 'purchase_order_create' }
      },
      async () => {
        executed += 1;
      }
    ),
    error => {
      assert.ok(error instanceof GateDeniedError);
      assert.equal(error.code, 'GATE_AUTHORITY_DENIED');
      assert.equal(error.decision.authority, 'INVALID');
      return true;
    }
  );

  assert.equal(executed, 0);
});

test('gate.enforce fails closed on UNKNOWN / DENY', async () => {
  let executed = 0;
  const gate = new GateClient({
    endpoint: 'https://gate.test',
    fetchImpl: async () => response({
      authority: 'UNKNOWN',
      decision: 'DENY',
      reason: 'replica_freshness_requirement_not_met'
    })
  });

  await assert.rejects(
    gate.enforce(
      {
        principal: 'user:alice',
        actor: 'agent:buyer',
        action: { name: 'purchase_order_create' }
      },
      async () => {
        executed += 1;
      }
    ),
    GateDeniedError
  );

  assert.equal(executed, 0);
});
