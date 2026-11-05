// Published client/guard diagnostics, not hosted enforcement or policy tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

assert.ok(process.env.GATE_REVIEW_CONSUMER_ROOT, 'Use an isolated public npm installation');
const root=fs.realpathSync(process.env.GATE_REVIEW_CONSUMER_ROOT);
const require=createRequire(path.join(root,'package.json'));
for(const [name,version] of [['mcp','0.1.0-dev.9'],['sdk','0.1.0-dev.4']]){
  const dir=path.join(root,'node_modules/@gate-avn',name);
  assert.ok(fs.realpathSync(dir).startsWith(root+path.sep), 'No workspace package links');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'package.json'))).version,version);
}
// The SDK root exposes an ESM import condition, not a CommonJS require entry.
const sdkPackage=JSON.parse(fs.readFileSync(path.join(root,'node_modules/@gate-avn/sdk/package.json')));
const {GateClient}=await import(pathToFileURL(path.join(root,'node_modules/@gate-avn/sdk',sdkPackage.exports['.'].import)));
const {createMcpEffectGuard}=await import(pathToFileURL(require.resolve('@gate-avn/mcp/effect-boundary')));

const cases=[
  [401,'invalid_api_key'],
  [403,'issuer_limit_reached'],
  [403,'untrusted_authority_issuer'],
  [403,'issuer_not_authorized_for_principal'],
  [403,'strict_consistency_not_in_plan'],
  [429,'daily_registration_limit_per_client_reached'],
  [429,'monthly_verification_limit_reached'],
  [200,null,'UNKNOWN','DENY'],
  [200,null,'INVALID','DENY'],
  [200,null,'VALID','ALLOW']
];
for(const [status,reason,authority,decision] of cases){
  test(`loopback SDK/guard ${status} ${reason??`${authority}/${decision}`}`,async()=>{
    let requests=0,effects=0;
    const server=http.createServer((req,res)=>{
      requests++;
      assert.equal(req.url,'/v1/authority/verify');
      assert.equal(req.headers.authorization,undefined,'No bearer credential used');
      req.resume();
      res.writeHead(status,{'content-type':'application/json'});
      res.end(JSON.stringify(reason?{ok:false,error:reason}:{authority,decision,reason:'local_fixture'}));
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    try{
      const gate=new GateClient({endpoint:`http://127.0.0.1:${server.address().port}`});
      const guard=createMcpEffectGuard({gate,principal:'fixture:owner',actor:'fixture:agent',consistency:'bounded'});
      const call=()=>guard.enforceToolCall({toolName:'support_marker'},()=>++effects);
      if(decision==='ALLOW')await call();
      else await assert.rejects(call, reason?{message:reason}:{code:'GATE_AUTHORITY_DENIED'});
      assert.equal(requests,1);
      assert.equal(effects,decision==='ALLOW'?1:0);
      assert.equal(guard.counter.snapshot().total,status===200?1:0,'Transport errors are not decision receipts');
    }finally{await new Promise(resolve=>server.close(resolve));}
  });
}
test('an ALLOW counter is not a completed-effect counter',async()=>{
  let completed=0;
  const guard=createMcpEffectGuard({gate:{verify:async()=>({authority:'VALID',decision:'ALLOW'})},principal:'fixture:owner',actor:'fixture:agent',consistency:'bounded'});
  await assert.rejects(()=>guard.enforceToolCall({toolName:'support_marker'},()=>{throw new Error('fixture_effect_failed');}),{message:'fixture_effect_failed'});
  assert.equal(guard.counter.snapshot().allow,1);
  assert.equal(completed,0);
});
