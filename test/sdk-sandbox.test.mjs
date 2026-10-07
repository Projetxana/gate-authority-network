import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandboxClient, GATE_SANDBOX_URL, GATE_SDK_VERSION } from '../packages/sdk/dist/index.js';

test('createSandboxClient uses hosted sandbox and SDK metadata', async () => {
  let seen;
  const gate = createSandboxClient({
    apiKey: 'gate_sk_test',
    fetchImpl: async (url, options) => {
      seen={url,headers:options.headers};
      return {ok:true,status:200,async text(){return JSON.stringify({authority:'VALID',decision:'ALLOW'})}};
    }
  });
  const out=await gate.verify({principal:'user:demo',actor:'agent:C@company-c'});
  assert.equal(out.decision,'ALLOW');
  assert.equal(seen.url,`${GATE_SANDBOX_URL}/v1/authority/verify`);
  assert.equal(seen.headers['x-gate-source'],'sdk');
  assert.equal(seen.headers['x-gate-client-version'],GATE_SDK_VERSION);
  assert.equal(seen.headers.authorization,'Bearer gate_sk_test');
});
