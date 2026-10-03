import http from 'node:http';
import crypto from 'node:crypto';
import { readJson, sendJson, pushSet } from '../src/http-json.mjs';
import { generateEs256KeyPair, signJwt } from '../src/jws.mjs';

const host='127.0.0.1';
const domain=process.env.AUTHORITY_DOMAIN;
const gateUrl=process.env.GATE_NETWORK_URL||process.env.GATE_CONTROL_PLANE_URL;
if(!domain||!gateUrl) throw new Error('AUTHORITY_DOMAIN and GATE_CONTROL_PLANE_URL are required');

const templates = domain==='principal'
  ? new Map([
      ['edge-human-agent-a',{issuer:'user:jerome',subject:'agent:A@company-a'}],
      ['edge-human-agent-b',{issuer:'user:jerome',subject:'agent:B@company-b'}]
    ])
  : domain==='company-a'
    ? new Map([
        ['edge-agent-a-agent-c',{issuer:'agent:A@company-a',subject:'agent:C@company-c'}],
        ['edge-agent-a-agent-d',{issuer:'agent:A@company-a',subject:'agent:D@company-d'}]
      ])
    : domain==='company-b'
      ? new Map([['edge-agent-b-agent-c',{issuer:'agent:B@company-b',subject:'agent:C@company-c'}]])
      : domain==='rogue'
        ? new Map([['edge-human-agent-a',{issuer:'user:jerome',subject:'agent:A@company-a'}]])
        : new Map();
if(!templates.size) throw new Error(`unsupported AUTHORITY_DOMAIN: ${domain}`);

const {privateKey,publicJwk}=generateEs256KeyPair({kid:`${domain}-signing`});
const seq=new Map();
const eventType='https://gate.example/events/authority-edge-state';
let issuer;
function nowSec(){return Math.floor(Date.now()/1000)}
function entityConfig(){
  const now=nowSec();
  return signJwt({
    header:{alg:'ES256',kid:publicJwk.kid,typ:'entity-statement+jwt'},
    payload:{iss:issuer,sub:issuer,iat:now,exp:now+3600,jwks:{keys:[publicJwk]},metadata:{gate_authority_issuer:{ssf_configuration_uri:`${issuer}/.well-known/ssf-configuration`}}},
    privateKey
  });
}
function issueSet({edgeId,status,reason=null,sequence=null}){
  const edge=templates.get(edgeId); if(!edge) throw new Error('edge_not_owned_by_demo_transmitter');
  const next=sequence ?? ((seq.get(edgeId)??0)+1); if(sequence==null) seq.set(edgeId,next);
  const now=nowSec();
  return signJwt({header:{alg:'ES256',kid:publicJwk.kid,typ:'secevent+jwt'},payload:{
    iss:issuer,aud:gateUrl,iat:now,jti:crypto.randomUUID(),sub:`urn:gate:authority-edge:${edgeId}`,
    events:{[eventType]:{edge_id:edgeId,issuer_principal:edge.issuer,subject_principal:edge.subject,status,sequence:next,reason,event_timestamp:new Date(now*1000).toISOString()}}
  },privateKey});
}
async function emit(body){const set=issueSet(body);let gate;try{gate=await pushSet(`${gateUrl}/Events`,set)}catch(e){gate={error:e.message,body:e.body}}return {set,gate}}
const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/health') return sendJson(res,200,{ok:true,domain});
  if(req.method==='GET'&&req.url==='/jwks.json') return sendJson(res,200,{keys:[publicJwk]});
  if(req.method==='GET'&&req.url==='/.well-known/openid-federation'){
    const body=entityConfig(); res.writeHead(200,{'content-type':'application/entity-statement+jwt','content-length':Buffer.byteLength(body)}); return res.end(body);
  }
  if(req.method==='GET'&&req.url==='/.well-known/ssf-configuration') return sendJson(res,200,{spec_version:'1_0',issuer,jwks_uri:`${issuer}/jwks.json`,delivery_methods_supported:['urn:ietf:rfc:8935'],events_supported:[eventType]});
  if(req.method==='POST'&&req.url==='/demo/emit'){try{const body=await readJson(req);const out=await emit(body);return sendJson(res,out.gate?.accepted===false||out.gate?.error?409:200,out)}catch(e){return sendJson(res,400,{error:e.message})}}
  if(req.method==='POST'&&req.url==='/demo/sign-only'){try{return sendJson(res,200,{set:issueSet(await readJson(req))})}catch(e){return sendJson(res,400,{error:e.message})}}
  return sendJson(res,404,{error:'not_found'});
});
const port=Number(process.env.PORT||0); await new Promise(resolve=>server.listen(port,host,resolve));
issuer=`http://${host}:${server.address().port}`;
console.log(JSON.stringify({ready:true,service:`authority-transmitter-${domain}`,url:issuer,domain}));
