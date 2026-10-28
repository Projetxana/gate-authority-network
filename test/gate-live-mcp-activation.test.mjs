import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {runActivation} from '../scripts/gate-live-mcp-activation.mjs';

function mockNetwork({activeIssuers=0, failAt=null, rejectSignature=false}={}) {
  let publicJwk, issuer, principal, actor, storedEdge, status='NONE', seq=0;
  const calls=[], logs=[];
  const output=(data,statusCode=200)=>new Response(JSON.stringify(data),{status:statusCode,headers:{'content-type':'application/json'}});
  const fetchImpl=async(url,options)=>{
    const route=new URL(url).pathname.split('/gate-network')[1];
    calls.push({route,method:options.method});
    if(route===failAt)return output({ok:false,error:'synthetic_failure'},503);
    if(route==='/v1/project')return output({ok:true,projectId:'00000000-0000-4000-8000-000000000001',plan:'free',activeIssuers});
    if(route==='/v1/issuers/register'){
      const data=JSON.parse(options.body);
      publicJwk=data.publicJwk;issuer=data.issuer;principal=data.principalPatterns[0];
      return output({ok:true,issuer:{id:'some-issuer'}},201);
    }
    if(route==='/v1/authority/verify'){
      const req=JSON.parse(options.body);actor=req.actor;
      const allowed=status==='ACTIVE' && req.principal===principal && req.actor===storedEdge;
      return output({authority:allowed?'VALID':'INVALID',decision:allowed?'ALLOW':'DENY',reason:allowed?null:'no_authority_path'});
    }
    if(route==='/v1/authority/events'){
      if(rejectSignature)return output({ok:false,error:'invalid_signature'},400);
      const token=JSON.parse(options.body).set;
      const [h,p,s]=token.split('.');
      const header=JSON.parse(Buffer.from(h,'base64url'));
      const payload=JSON.parse(Buffer.from(p,'base64url'));
      const key=crypto.createPublicKey({key:publicJwk,format:'jwk'});
      const valid=crypto.verify('sha256',Buffer.from(`${h}.${p}`),{key,dsaEncoding:'ieee-p1363'},Buffer.from(s,'base64url'));
      assert.equal(valid,true,'ES256 signature must verify');
      assert.equal(header.kid,publicJwk.kid);
      assert.equal(payload.iss,issuer);
      const event=payload.events['urn:gate:event:authority-edge-state:v1'];
      assert.equal(event.issuer_principal,principal);
      assert.equal(event.sequence,seq+1);
      assert.equal(event.subject_principal,actor);
      seq=event.sequence;storedEdge=event.subject_principal;status=event.status;
      return output({ok:true,accepted:true},202);
    }
    if(route==='/v1/issuers/revoke')return output({ok:true});
    return output({ok:false,error:'unknown_path'},404);
  };
  return {fetchImpl,calls,logs};
}
const opts=network=>({apiKey:'gate_sk_fake_for_testing_only',baseUrl:'https://fixture.invalid/functions/v1/gate-network',fetchImpl:network.fetchImpl,log:m=>network.logs.push(m)});

test('signed issuer authenticates, one local effect executes and revocation blocks replay',async()=>{
  const n=mockNetwork();let effects=0;
  const res=await runActivation({...opts(n),onEffect:async()=>{effects++}});
  assert.equal(res.ok,true);assert.equal(res.localEffects,1);
  assert.equal(res.independentExternalSource,false);assert.equal(res.stage18BoundedWork,false);
  assert.equal(effects,1);
  assert.equal(n.calls.filter(x=>x.route==='/v1/authority/verify').length,3);
  assert.equal(n.calls.filter(x=>x.route==='/v1/authority/events').length,2);
  assert.ok(n.calls.some(x=>x.route==='/v1/issuers/revoke'));
});

test('does not touch an existing project with an authority issuer',async()=>{
  const n=mockNetwork({activeIssuers:1});
  await assert.rejects(runActivation(opts(n)),/NEW disposable Free project/);
  assert.equal(n.calls.length,1);
});

test('signed event admission error fails closed and removes issuer trust',async()=>{
  const n=mockNetwork({rejectSignature:true});let effects=0;
  await assert.rejects(runActivation({...opts(n),onEffect:async()=>{effects++}}),/invalid_signature/);
  assert.equal(effects,0);
  assert.ok(n.calls.some(x=>x.route==='/v1/issuers/revoke'));
});

test('unavailable verifier prevents a local effect',async()=>{
  const n=mockNetwork({failAt:'/v1/authority/verify'});let effects=0;
  await assert.rejects(runActivation({...opts(n),onEffect:async()=>{effects++}}),/synthetic_failure/);
  assert.equal(effects,0);
  assert.equal(n.calls.some(x=>x.route==='/v1/issuers/register'),false);
});

test('missing key is rejected before network calls',async()=>{
  const n=mockNetwork();
  await assert.rejects(runActivation({...opts(n),apiKey:'invalid'}),/Set GATE_API_KEY/);
  assert.equal(n.calls.length,0);
});
