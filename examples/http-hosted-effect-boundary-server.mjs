import http from 'node:http';
import { GateClient, createVerifiedEffectReporter } from '@gate-avn/sdk';
import { createHttpEffectGuard } from '../packages/http/src/index.mjs';

const endpoint = process.env.GATE_URL;
const apiKey = process.env.GATE_API_KEY;
const metricsEndpoint = process.env.GATE_METRICS_URL;

if (!endpoint) throw new Error('GATE_URL is required');
if (!apiKey) throw new Error('GATE_API_KEY is required');
if (!metricsEndpoint) throw new Error('GATE_METRICS_URL is required');

const gate = new GateClient({
  endpoint,
  apiKey,
  timeoutMs: 5000,
  source: 'api',
  clientVersion: 'network-v1-stage5'
});

const reporter = createVerifiedEffectReporter({ endpoint: metricsEndpoint, apiKey });

const guard = createHttpEffectGuard({
  gate,
  principal: 'user:demo',
  actor: 'agent:C@company-c',
  consistency: 'bounded',
  reporter
});

const orders = [];

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

export async function startHostedHttpEffectServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');

      if (req.method === 'POST' && url.pathname === '/orders') {
        const input = await readJson(req);
        const orderId = String(input.orderId || 'PO-DEMO');

        try {
          const outcome = await guard.enforce(
            {
              operation: 'POST /orders',
              resource: `order:${orderId}`,
              parameters: {
                amount: Number(input.amount || 0),
                currency: String(input.currency || 'USD')
              }
            },
            async () => {
              const order = {
                orderId,
                amount: Number(input.amount || 0),
                currency: String(input.currency || 'USD')
              };
              orders.push(order);
              return order;
            }
          );

          return json(res, 201, {
            ok: true,
            executed: true,
            decision: outcome.decision,
            verifiedEffect: outcome.verifiedEffect,
            networkMetering: outcome.networkMetering,
            result: outcome.result,
            orderCount: orders.length
          });
        } catch (error) {
          if (error?.code === 'GATE_AUTHORITY_DENIED') {
            return json(res, 403, {
              ok: false,
              executed: false,
              error: error.code,
              decision: error.decision,
              verifiedEffect: error.verifiedEffect,
              networkMetering: error.networkMetering ?? null,
              orderCount: orders.length
            });
          }
          throw error;
        }
      }

      return json(res, 404, { ok: false, error: 'not_found' });
    } catch (error) {
      return json(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  return {
    server,
    url: `http://127.0.0.1:${server.address().port}`,
    orders
  };
}
