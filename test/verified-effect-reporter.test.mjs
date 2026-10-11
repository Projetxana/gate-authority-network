import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createVerifiedEffectReporter } from '../packages/mcp/src/verified-effect-reporter.mjs';

async function startServer(handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}`
  };
}

test('Verified Effect reporter sends only the metering contract', async () => {
  let received;

  const { server, url } = await startServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      received = {
        url: req.url,
        authorization: req.headers.authorization,
        body: JSON.parse(raw)
      };

      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        metered: true,
        verification_id: received.body.verificationId,
        event_id: 'event-1',
        deduplicated: false
      }));
    });
  });

  try {
    const reporter = createVerifiedEffectReporter({
      endpoint: url,
      apiKey: 'gate_sk_test'
    });

    const result = await reporter.report({
      event: 'gate.verified_effect',
      verificationId: 'gv_1234567890',
      protocol: 'mcp',
      operation: 'tools/call:send_email',
      authority: 'VALID',
      decision: 'ALLOW',
      receiptVersion: 'gate.authority-receipt.v2',
      consistency: 'strict',
      servedBy: 'gate-network:test',
      region: 'ca-central-1',

      // These fields must never be forwarded.
      principal: 'user:secret',
      actor: 'agent:secret',
      resource: 'secret-resource',
      parameters: { body: 'secret' },
      prompt: 'secret'
    });

    assert.equal(result.sent, true);
    assert.equal(result.metered, true);
    assert.equal(received.url, '/verified-effects');
    assert.equal(received.authorization, 'Bearer gate_sk_test');

    assert.deepEqual(received.body, {
      event: 'gate.verified_effect',
      verificationId: 'gv_1234567890',
      protocol: 'mcp',
      operation: 'tools/call:send_email',
      authority: 'VALID',
      decision: 'ALLOW',
      receiptVersion: 'gate.authority-receipt.v2',
      consistency: 'strict',
      servedBy: 'gate-network:test',
      region: 'ca-central-1'
    });

    for (const forbidden of [
      'principal',
      'actor',
      'resource',
      'parameters',
      'prompt'
    ]) {
      assert.equal(forbidden in received.body, false);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('Verified Effect reporter never throws into the authorization path', async () => {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'temporary_failure' }));
  });

  try {
    const reporter = createVerifiedEffectReporter({
      endpoint: url,
      apiKey: 'gate_sk_test'
    });

    const result = await reporter.report({
      verificationId: 'gv_1234567890',
      protocol: 'mcp',
      operation: 'tools/call:test',
      decision: 'ALLOW',
      authority: 'VALID'
    });

    assert.equal(result.sent, false);
    assert.equal(result.reason, 'temporary_failure');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

