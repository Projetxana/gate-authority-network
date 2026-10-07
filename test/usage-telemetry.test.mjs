import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  createUsageReporter,
  readBearerToken
} from '../src/usage-telemetry.mjs';

async function startServer(handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}`
  };
}

test('usage telemetry sends only privacy-minimized verification metadata', async () => {
  let received;

  const { server, url } = await startServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      received = {
        authorization: req.headers.authorization,
        body: JSON.parse(raw)
      };
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  try {
    const reporter = createUsageReporter({
      endpoint: url,
      clientVersion: 'gate-edge-test'
    });

    const result = await reporter.report({
      apiKey: 'gate_sk_test',
      decision: 'ALLOW',
      authority: 'VALID',
      consistency: 'bounded',
      latencyMs: 12.4,
      source: 'api',
      principal: 'SHOULD_NOT_BE_SENT',
      actor: 'SHOULD_NOT_BE_SENT',
      action: { name: 'SHOULD_NOT_BE_SENT' }
    });

    assert.equal(result.sent, true);
    assert.equal(received.authorization, 'Bearer gate_sk_test');
    assert.deepEqual(received.body, {
      source: 'api',
      client_version: 'gate-edge-test',
      consistency: 'bounded',
      decision: 'ALLOW',
      authority: 'VALID',
      latency_ms: 12,
      error_code: null
    });

    assert.equal('principal' in received.body, false);
    assert.equal('actor' in received.body, false);
    assert.equal('action' in received.body, false);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('usage telemetry is skipped when no project API key is present', async () => {
  const reporter = createUsageReporter({
    endpoint: 'http://127.0.0.1:1'
  });

  const result = await reporter.report({
    decision: 'DENY',
    authority: 'UNKNOWN',
    consistency: 'strict',
    latencyMs: 20
  });

  assert.deepEqual(result, {
    sent: false,
    reason: 'missing_api_key'
  });
});

test('usage telemetry failure never throws into the authorization path', async () => {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false }));
  });

  try {
    const reporter = createUsageReporter({ endpoint: url });
    const result = await reporter.report({
      apiKey: 'gate_sk_test',
      decision: 'ALLOW',
      authority: 'VALID',
      consistency: 'bounded',
      latencyMs: 1
    });

    assert.equal(result.sent, false);
    assert.equal(result.reason, 'telemetry_http_500');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('readBearerToken parses GATE project API keys without logging them', () => {
  assert.equal(readBearerToken('Bearer gate_sk_abc123'), 'gate_sk_abc123');
  assert.equal(readBearerToken('bearer gate_sk_xyz'), 'gate_sk_xyz');
  assert.equal(readBearerToken(undefined), null);
  assert.equal(readBearerToken('Basic abc'), null);
});
