import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runner = path.join(ROOT,'scripts','run-live-free-mcp-effect.mjs');

async function fixture({activeIssuers=0,contradictory=false,cleanupFailure=false,redirectOnAllow=false,unavailableOnAllow=false}={}) {
  const state = { status:'NONE', sequence:0, issuer:null, key:null, principal:null, actor:null, revokeCalls:0 };
  const projectId = '00000000-0000-4000-8000-000000000001';
  const send = (res,obj,code=200)=>{
    res.writeHead(code,{'content-type':'application/json'}); res.end(JSON.stringify(obj));
  };
  const server=http.createServer(async(req,res)=>{
    try {
      assert.equal(req.headers.authorization, 'Bearer gate_sk_mock_test_key');
      const body = await new Promise((resolve,reject)=>{
        let s='';req.on('data',chunk=>s+=chunk);req.on('end',()=>{try{resolve(s?JSON.parse(s):{});}catch(e){reject(e);}});req.on('error',reject);
      });
      const route=new URL(req.url,'http://localhost').pathname.split('/gate-network')[1];
      if (route==='/v1/project') return send(res,{ok:true,projectId,plan:'free',activeIssuers});
      if (route==='/v1/issuers/register') {
        state.issuer=body.issuer;state.key=crypto.createPublicKey({key:body.publicJwk,format:'jwk'});
        state.principal=body.principalPatterns[0];
        return send(res,{ok:true},201);
      }
      if (route==='/v1/authority/verify') {
        const allow=state.status==='ACTIVE' && body.principal===state.principal && body.actor===state.actor;
        assert.equal(body.consistency,'bounded');
        if (allow && redirectOnAllow) {res.writeHead(307,{location:'https://redirect.invalid/'});res.end();return;}
        if (allow && unavailableOnAllow) return send(res,{ok:false,error:'forced_unavailable'},503);
        if (allow && contradictory) return send(res,{authority:'UNKNOWN',decision:'ALLOW',reason:'contradictory_fixture'});
        return send(res,{authority:allow?'VALID':'INVALID',decision:allow?'ALLOW':'DENY',reason:allow?null:'no_authority_path'});
      }
      if (route==='/v1/authority/events') {
        const [header,payload,sig]=body.set.split('.');
        const claims=JSON.parse(Buffer.from(payload,'base64url'));
        const valid=crypto.verify('sha256',Buffer.from(`${header}.${payload}`),
          {key:state.key,dsaEncoding:'ieee-p1363'},Buffer.from(sig,'base64url'));
        assert.equal(valid,true);
        assert.equal(claims.iss,state.issuer);
        assert.equal(claims.aud,`urn:gate:project:${projectId}`);
        const e=claims.events['urn:gate:event:authority-edge-state:v1'];
        assert.equal(e.sequence,state.sequence+1);
        assert.equal(e.issuer_principal,state.principal);
        state.actor=e.subject_principal; state.status=e.status;state.sequence=e.sequence;
        return send(res,{ok:true,accepted:true},202);
      }
      if (route==='/v1/issuers/revoke') {state.revokeCalls++;return cleanupFailure ? send(res,{ok:false,error:'forced_cleanup_failure'},503) : send(res,{ok:true});}
      return send(res,{ok:false,error:'unknown_fixture_route'},404);
    } catch (e) {return send(res,{ok:false,error:'fixture_invalid_request'},400);}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  return {
    url:`http://127.0.0.1:${address.port}/functions/v1/gate-network`,
    state,
    close:()=>new Promise(resolve=>server.close(resolve))
  };
}

async function run(url){
  const child=spawn(process.execPath,[runner],{
    cwd:ROOT,
    env:{...process.env,GATE_URL:url,GATE_API_KEY:'gate_sk_mock_test_key',GATE_PILOT_TEST_FIXTURE:'1'},
    stdio:['ignore','pipe','pipe'], timeout:20000
  });
  let stdout='',stderr='';
  child.stdout.on('data',c=>stdout+=String(c));
  child.stderr.on('data',c=>stderr+=String(c));
  const exit=await new Promise((resolve,reject)=>{
    child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));
  });
  return {...exit,stdout,stderr};
}

test('real MCP tools/call is DENY → ALLOW once → signed REVOKED → DENY using bounded Free fixture', async()=>{
  const f=await fixture();
  try{
    const result=await run(f.url);
    assert.equal(result.code,0,`stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assert.match(result.stdout,/PASS before_grant/);
    assert.match(result.stdout,/PASS after_signed_active/);
    assert.match(result.stdout,/PASS after_revocation/);
    assert.match(result.stdout,/no second effect/);
    assert.equal(f.state.revokeCalls,1);
    assert.equal(f.state.sequence,2);
  }finally{await f.close();}
});

test('refuses to touch a Free project with pre-existing issuer',async()=>{
  const f=await fixture({activeIssuers:1});
  try{
    const result=await run(f.url);
    assert.notEqual(result.code,0);
    assert.match(result.stderr,/NEW disposable Free project/);
    assert.equal(f.state.sequence,0);
    assert.equal(f.state.revokeCalls,0);
  }finally{await f.close();}
});


test('failed issuer cleanup returns a nonzero process code',async()=>{
  const f=await fixture({cleanupFailure:true});
  try{
    const result=await run(f.url);
    assert.notEqual(result.code,0);
    assert.match(result.stderr,/cleanup FAILED/);
    assert.equal(f.state.revokeCalls,1);
    assert.match(result.stdout,/PASS after_revocation/);
  }finally{await f.close();}
});

test('redirect on live verify fails closed with no authorized effect',async()=>{
  const f=await fixture({redirectOnAllow:true});
  try{
    const result=await run(f.url);
    assert.notEqual(result.code,0);
    assert.doesNotMatch(result.stdout,/PASS after_signed_active/);
    assert.equal(f.state.revokeCalls,1);
  }finally{await f.close();}
});

test('HTTP 503 on live verify fails closed',async()=>{
  const f=await fixture({unavailableOnAllow:true});
  try{
    const result=await run(f.url);
    assert.notEqual(result.code,0);
    assert.doesNotMatch(result.stdout,/PASS after_signed_active/);
    assert.equal(f.state.revokeCalls,1);
  }finally{await f.close();}
});

test('contradictory ALLOW/UNKNOWN never authorizes the guarded MCP effect',async()=>{
  const f=await fixture({contradictory:true});
  try{
    const result=await run(f.url);
    assert.notEqual(result.code,0);
    assert.match(result.stderr,/expected VALID \/ ALLOW/);
    assert.equal(f.state.revokeCalls,1);
    assert.equal(f.state.sequence,1);
    assert.doesNotMatch(result.stdout,/PASS after_signed_active/);
  }finally{await f.close();}
});
