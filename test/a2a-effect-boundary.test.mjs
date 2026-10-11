import test from 'node:test';
import assert from 'node:assert/strict';
import { GateDeniedError } from '../packages/sdk/dist/index.js';
import {
  createA2AEffectGuard,
  gateDeniedToA2AError
} from '../packages/a2a/src/index.mjs';

const request = {
  jsonrpc: '2.0',
  id: 'req-1',
  method: 'message/send',
  params: {
    message: {
      role: 'user',
      parts: [{ kind: 'text', text: 'Create the purchase order' }],
      messageId: 'msg-1',
      kind: 'message'
    },
    metadata: {}
  }
};

test('A2A message/send is normalized and executed only after GATE ALLOW', async () => {
  let gateRequest;
  let executed = 0;
  const events = [];

  const guard = createA2AEffectGuard({
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
    idFactory: () => 'gv_a2a_allow_0001'
  });

  const out = await guard.enforceJsonRpc(request, async () => {
    executed += 1;
    return {
      kind: 'message',
      role: 'agent',
      parts: [{ kind: 'text', text: 'Created' }],
      messageId: 'msg-response-1',
      contextId: 'ctx-1'
    };
  });

  assert.equal(executed, 1);
  assert.equal(gateRequest.action.protocol, 'a2a');
  assert.equal(gateRequest.action.name, 'message/send');
  assert.equal(gateRequest.action.resource, 'a2a:message:msg-1');
  assert.equal(out.verifiedEffect.protocol, 'a2a');
  assert.equal(events.length, 1);
  assert.equal('params' in events[0], false);
});

test('A2A GATE DENY blocks receiving-agent effect', async () => {
  let executed = 0;

  const guard = createA2AEffectGuard({
    gate: {
      async verify() {
        return {
          authority: 'INVALID',
          decision: 'DENY',
          reason: 'delegation_revoked'
        };
      }
    },
    principal: 'user:demo',
    actor: 'agent:C@company-c',
    idFactory: () => 'gv_a2a_deny_0001'
  });

  let denied;
  try {
    await guard.enforceJsonRpc(request, async () => {
      executed += 1;
    });
  } catch (error) {
    denied = error;
  }

  assert.ok(denied instanceof GateDeniedError);
  assert.equal(executed, 0);

  const response = gateDeniedToA2AError(denied, request.id);
  assert.equal(response.jsonrpc, '2.0');
  assert.equal(response.id, 'req-1');
  assert.equal(response.error.code, -32080);
});

test('A2A JSON-RPC 2.0 and message payload are validated', async () => {
  const guard = createA2AEffectGuard({
    gate: { async verify() { throw new Error('must not run'); } },
    principal: 'user:demo',
    actor: 'agent:C@company-c'
  });

  await assert.rejects(
    guard.enforceJsonRpc(
      { jsonrpc: '1.0', method: 'message/send' },
      async () => {}
    ),
    /jsonrpc must be 2.0/
  );

  await assert.rejects(
    guard.enforceJsonRpc(
      { jsonrpc: '2.0', method: 'message/send', params: {} },
      async () => {}
    ),
    /A2A message is required/
  );
});
