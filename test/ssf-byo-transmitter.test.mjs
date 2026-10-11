import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { CAEP_SESSION_REVOKED, SSF_POLL_DELIVERY, createSsfReceiverConnector } from '@gate-avn/ssf';

const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
function signRs256(payload,privateKey,kid){const h={alg:'RS256',typ:'secevent+jwt',kid};const input=`${b64(h)}.${b64(payload)}`;const sig=sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');return `${input}.${sig}`}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

function provider({conflict=false,metadataIssuer='https://identity.customer.example',audience='urn:gate:customer:ssf',token='customer-secret-token'}={}){
  const keys=generateKeyPairSync('rsa',{modulusLength:2048}); const kid='customer-key-1';
  const publicJwk={...keys.publicKey.export({format:'jwk'}),kid,alg:'RS256',use:'sig'};
  const metadataUrl='https://identity.customer.example/custom/ssf-metadata';
  const jwksUri='https://identity.customer.example/keys'; const config='https://identity.customer.example/ssf/streams'; const poll='https://identity.customer.example/ssf/poll';
  const stream={stream_id:'customer-stream-1',iss:metadataIssuer,aud:audience,delivery:{method:SSF_POLL_DELIVERY,endpoint_url:poll},events_requested:[CAEP_SESSION_REVOKED],events_delivered:[CAEP_SESSION_REVOKED]};
  const payload={iss:metadataIssuer,aud:audience,jti:'customer-event-1',iat:Math.floor(Date.now()/1000),sub_id:{format:'opaque',id:'customer-session-42'},events:{[CAEP_SESSION_REVOKED]:{event_timestamp:Math.floor(Date.now()/1000)}}};
  const set=signRs256(payload,keys.privateKey,kid); const calls=[]; let delivered=false;
  async function fetchImpl(url,init={}){const u=String(url),method=init.method||'GET',auth=new Headers(init.headers||{}).get('authorization');calls.push({url:u,method,auth,body:init.body?JSON.parse(init.body):null});if(auth!==`Bearer ${token}`)return json({error:'unauthorized'},401);if(u===metadataUrl&&method==='GET')return json({issuer:metadataIssuer,jwks_uri:jwksUri,configuration_endpoint:config,delivery_methods_supported:[SSF_POLL_DELIVERY]});if(u===jwksUri&&method==='GET')return json({keys:[publicJwk]});if(u===config&&method==='POST')return conflict?json({Error:'stream already exists'},409):json(stream,201);if(u===config&&method==='GET')return json(stream);if(u===poll&&method==='POST'){const body=JSON.parse(init.body||'{}');if(Array.isArray(body.ack))return json({sets:{}});if(!delivered){delivered=true;return json({sets:{[payload.jti]:set}})}return json({sets:{}})}if(u.startsWith(config+'?')&&method==='DELETE')return new Response(null,{status:204});return json({error:'not_found'},404)}
  return {token,metadataUrl,audience,calls,fetchImpl};
}

test('BYO connector discovers arbitrary transmitter, verifies, dispatches, then ACKs', async()=>{const p=provider(),handled=[];const r=createSsfReceiverConnector({metadataUrl:p.metadataUrl,accessToken:p.token,expectedAudience:p.audience,fetchImpl:p.fetchImpl,onEvent:async e=>handled.push(e)});const st=await r.open();assert.equal(st.issuer,'https://identity.customer.example');assert.equal(st.streamOwned,true);const batch=await r.pollOnce();assert.equal(batch.events.length,1);assert.equal(batch.events[0].signal.subject.id,'customer-session-42');assert.equal(handled.length,1);assert.deepEqual(batch.acknowledged,['customer-event-1']);const pc=p.calls.filter(c=>c.url.endsWith('/ssf/poll'));assert.equal(pc.length,2);assert.equal(pc[0].body.ack,undefined);assert.deepEqual(pc[1].body.ack,['customer-event-1'])});

test('BYO connector inspect never exposes access token',async()=>{const p=provider();const r=createSsfReceiverConnector({metadataUrl:p.metadataUrl,accessToken:p.token,expectedAudience:p.audience,fetchImpl:p.fetchImpl});await r.open();assert.equal(JSON.stringify(r.inspect()).includes(p.token),false)});

test('BYO connector reuses existing audience-bound stream on 409',async()=>{const p=provider({conflict:true});const r=createSsfReceiverConnector({metadataUrl:p.metadataUrl,accessToken:p.token,expectedAudience:p.audience,fetchImpl:p.fetchImpl});const st=await r.open();assert.equal(st.streamId,'customer-stream-1');assert.equal(st.streamOwned,false);assert.equal(p.calls.some(c=>c.url.endsWith('/ssf/streams')&&c.method==='GET'),true)});

test('BYO connector fails closed on metadata issuer mismatch',async()=>{const p=provider({metadataIssuer:'https://different-issuer.example'});const r=createSsfReceiverConnector({issuer:'https://identity.customer.example',metadataUrl:p.metadataUrl,accessToken:p.token,expectedAudience:p.audience,fetchImpl:p.fetchImpl});await assert.rejects(r.open(),/ssf_metadata_issuer_mismatch/)});

test('BYO connector does not ACK until an event handler owns the verified event',async()=>{const p=provider();const r=createSsfReceiverConnector({metadataUrl:p.metadataUrl,accessToken:p.token,expectedAudience:p.audience,fetchImpl:p.fetchImpl});await r.open();const batch=await r.pollOnce();assert.equal(batch.events.length,1);assert.deepEqual(batch.acknowledged,[]);assert.equal(p.calls.filter(c=>c.url.endsWith('/ssf/poll')).length,1)});
