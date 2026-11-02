import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

// The same behavioral contract runs against workspace code and the installed tgz.
const consumer = process.env.GATE_MCP_CONSUMER_ROOT;
const require = createRequire(consumer ? path.join(consumer, 'package.json') : import.meta.url);
const {createMcpEffectGuard} = await import(pathToFileURL(require.resolve('@gate-avn/mcp/effect-boundary')));
const {GateClient} = consumer
  ? await import(pathToFileURL(path.join(consumer, 'node_modules/@gate-avn/sdk/dist/index.js')))
  : await import('@gate-avn/sdk');
const allow = {authority: 'VALID', decision: 'ALLOW'};
const trusted = {principal: 'user:server', actor: 'agent:server', consistency: 'strict', maxStalenessMs: 100};
function fixture(options = {}, verify = async () => allow) {
  const calls = []; let effects = 0;
  const guard = createMcpEffectGuard({...trusted, ...options,
    gate: {async verify(request) {calls.push(request); return verify(request);}}});
  return {calls, effects: () => effects,
    run: (request = {}) => guard.enforceToolCall({toolName: 'local_test', ...request}, async () => ++effects)};
}
for (const field of ['principal', 'actor']) {
  test(`trusted ${field} cannot be replaced`, async () => {
    const x = fixture(); await assert.rejects(x.run({[field]: 'attacker'}));
    assert.equal(x.effects(), 0); assert.equal(x.calls.length, 0);
  });
  for (const value of [undefined, null, '', ' ', 42, {}]) {
    test(`configured ${field} resolver returning ${JSON.stringify(value)} fails closed`, async () => {
      const x = fixture({[field]: async () => value});
      await assert.rejects(x.run({[field]: 'attacker'}));
      assert.equal(x.effects(), 0); assert.equal(x.calls.length, 0);
    });
  }
  test(`missing ${field} without a caller identity blocks effect`, async () => {
    const x = fixture({[field]: undefined}); await assert.rejects(x.run());
    assert.equal(x.effects(), 0);
  });
  test(`throwing ${field} resolver blocks effect`, async () => {
    const x = fixture({[field]: async () => {throw Error('identity unavailable');}});
    await assert.rejects(x.run(), /identity unavailable/); assert.equal(x.effects(), 0);
  });
}
test('server-derived async identities permit a matching request', async () => {
  const x = fixture({principal: async () => trusted.principal, actor: async () => trusted.actor});
  await x.run(); assert.equal(x.effects(), 1);
  assert.equal(x.calls[0].principal, trusted.principal); assert.equal(x.calls[0].actor, trusted.actor);
});
for (const result of [{authority: 'UNKNOWN', decision: 'ALLOW'}, {authority: 'INVALID', decision: 'ALLOW'},
  {authority: 'UNKNOWN', decision: 'DENY'}, {decision: 'ALLOW'}, null]) {
  test(`decision ${JSON.stringify(result)} blocks effect`, async () => {
    const x = fixture({}, async () => result); await assert.rejects(x.run()); assert.equal(x.effects(), 0);
  });
}
test('strict cannot be downgraded by the caller', async () => {
  const x = fixture(); await assert.rejects(x.run({consistency: 'bounded'}));
  assert.equal(x.effects(), 0); assert.equal(x.calls.length, 0);
});
for (const [requested, expected] of [[1000, 100], [50, 50], [undefined, 100], [Infinity, 100], [NaN, 100]]) {
  test(`staleness request ${requested} keeps server budget ${expected}`, async () => {
    const x = fixture({consistency: 'bounded'}); await x.run({maxStalenessMs: requested});
    assert.equal(x.calls[0].maxStalenessMs, expected); assert.equal(x.effects(), 1);
  });
}
for (const failure of ['http', 'malformed-json', 'disconnect', 'timeout']) {
  test(`SDK ${failure} prevents every effect`, {timeout: 4000}, async () => {
    let requests = 0;
    const server = http.createServer((req, res) => {
      requests++;
      if (failure === 'disconnect') {req.socket.destroy(); return;}
      if (failure === 'timeout') return;
      res.writeHead(failure === 'http' ? 503 : 200, {'content-type': 'application/json'});
      res.end(failure === 'http' ? '{"error":"unavailable"}' : 'invalid json');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const gate = new GateClient({endpoint: `http://127.0.0.1:${server.address().port}`, timeoutMs: 250});
      let effects = 0;
      const guard = createMcpEffectGuard({...trusted, gate});
      await assert.rejects(guard.enforceToolCall({toolName: 'test'}, async () => effects++),
        failure === 'timeout' ? /gate_verify_timeout/ : undefined);
      assert.equal(effects, 0); assert.equal(requests, 1);
    } finally {
      server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    }
  });
}
