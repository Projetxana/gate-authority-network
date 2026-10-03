import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { GateClient } from '../packages/sdk/dist/index.js';

async function server(handler) {
  const s = http.createServer(handler);
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  return { s, url: `http://127.0.0.1:${s.address().port}` };
}

test('SDK sends a live authority verification and preserves action context', async () => {
  const { s, url } = await server((req, res) => {
    let raw=''; req.on('data', d => raw += d); req.on('end', () => {
      const body=JSON.parse(raw);
      assert.equal(body.principal, 'user:jerome');
      assert.equal(body.actor, 'agent:C@company-c');
      assert.equal(body.consistency, 'bounded');
      res.writeHead(200, {'content-type':'application/json'});
      res.end(JSON.stringify({authority:'VALID',decision:'ALLOW',servedBy:'edge:test'}));
    });
  });
  try {
    const gate = new GateClient({ endpoint: url });
    const action={protocol:'mcp',name:'delete_customer_data',resource:'customer:3456'};
    const result=await gate.verify({principal:'user:jerome',actor:'agent:C@company-c',action,maxStalenessMs:200});
    assert.equal(result.decision,'ALLOW');
    assert.deepEqual(result.action,action);
  } finally { await new Promise(r=>s.close(r)); }
});
