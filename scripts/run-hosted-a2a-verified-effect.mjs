import http from 'node:http';
import {
  GateClient,
  createVerifiedEffectReporter
} from '@gate-avn/sdk';
import {
  createA2AEffectGuard,
  gateDeniedToA2AError
} from '@gate-avn/a2a';

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
const beforeA2A = n(before?.verifiedEffects?.a2a_30d);

const gate = new GateClient({
  endpoint,
  apiKey,
  timeoutMs: 5000,
  source: 'api',
  clientVersion: 'network-v1-stage7-a2a'
});

const reporter = createVerifiedEffectReporter({
  endpoint: metricsEndpoint,
  apiKey
});

const guard = createA2AEffectGuard({
  gate,
  principal: 'user:demo',
  actor: 'agent:C@company-c',
  consistency: 'bounded',
  reporter
});

let taskEffectExecuted = false;

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/rpc') {
    res.writeHead(404).end();
    return;
  }

  let raw = '';
  for await (const chunk of req) raw += chunk;

  let rpc;
  try {
    rpc = JSON.parse(raw);
  } catch {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' }
    }));
    return;
  }

  try {
    const outcome = await guard.enforceJsonRpc(
      rpc,
      async () => {
        taskEffectExecuted = true;
        return {
          id: 'task-stage7',
          contextId: 'context-stage7',
          status: {
            state: 'completed',
            timestamp: new Date().toISOString()
          },
          artifacts: [
            {
              artifactId: 'artifact-stage7',
              parts: [
                {
                  kind: 'data',
                  data: { purchaseOrderCreated: true }
                }
              ]
            }
          ],
          kind: 'task'
        };
      }
    );

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      id: rpc.id,
      result: outcome.result,
      _gate: {
        decision: outcome.decision,
        verifiedEffect: outcome.verifiedEffect,
        networkMetering: outcome.networkMetering
      }
    }));
  } catch (error) {
    if (error?.code === 'GATE_AUTHORITY_DENIED') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(
        gateDeniedToA2AError(error, rpc.id ?? null)
      ));
      return;
    }
    throw error;
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;

try {
  const request = {
    jsonrpc: '2.0',
    id: 'req-stage7-a2a',
    method: 'message/send',
    params: {
      message: {
        role: 'user',
        parts: [
          {
            kind: 'text',
            text: 'Create purchase order PO-STAGE7-A2A'
          }
        ],
        messageId: 'msg-stage7-a2a',
        kind: 'message'
      },
      metadata: {}
    }
  };

  const response = await fetch(`${url}/rpc`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'a2a-version': '0.3'
    },
    body: JSON.stringify(request)
  });

  const body = await response.json();

  if (body?.error) {
    throw new Error(`A2A error: ${JSON.stringify(body.error)}`);
  }

  if (body?.result?.kind !== 'task' || !taskEffectExecuted) {
    throw new Error('A2A receiving-agent task effect did not execute');
  }

  if (body?._gate?.decision?.decision !== 'ALLOW') {
    throw new Error('Expected GATE ALLOW for A2A task');
  }

  if (
    body?._gate?.networkMetering?.sent !== true ||
    body?._gate?.networkMetering?.metered !== true
  ) {
    throw new Error('A2A Verified Effect was not persisted');
  }

  const after = await summary();
  const afterToday = n(after?.verifiedEffects?.verified_effects_today);
  const afterA2A = n(after?.verifiedEffects?.a2a_30d);

  if (afterToday < beforeToday + 1) {
    throw new Error('Verified Effects today did not advance');
  }
  if (afterA2A < beforeA2A + 1) {
    throw new Error('A2A protocol counter did not advance');
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    proof:
      'A2A JSON-RPC message/send -> hosted GATE -> network meter -> receiving-agent task effect',
    a2a: {
      version: '0.3',
      transport: 'JSON-RPC 2.0',
      method: request.method
    },
    authority: body._gate.decision.authority,
    decision: body._gate.decision.decision,
    verifiedEffect: body._gate.verifiedEffect,
    networkMetering: body._gate.networkMetering,
    networkCounter: {
      verifiedEffectsToday: {
        before: beforeToday,
        after: afterToday,
        delta: afterToday - beforeToday
      },
      a2a30d: {
        before: beforeA2A,
        after: afterA2A,
        delta: afterA2A - beforeA2A
      }
    },
    effectExecuted: taskEffectExecuted,
    resultKind: body.result.kind
  }, null, 2) + '\n');
} finally {
  await new Promise(resolve => server.close(resolve));
}
