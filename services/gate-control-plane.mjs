import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { readJson, readText, sendJson } from '../src/http-json.mjs';
import { decodeJwtUnsafe, generateEs256KeyPair, signJwt, verifyEs256Jwt } from '../src/jws.mjs';
import { verifyLiveAuthority } from '../src/verify-live-authority.mjs';

const eventType='https://gate.example/events/authority-edge-state';
const trustAnchor=process.env.TRUST_ANCHOR_URL;
if(!trustAnchor) throw new Error('TRUST_ANCHOR_URL is required');
const leaseTtlMs=Number(process.env.LEASE_TTL_MS||1000);
const edges=new Map(), eventLog=[], seenJti=new Set(), trustCache=new Map(), ssfCache=new Map(), jwksCache=new Map();
const {privateKey:leasePrivateKey,publicJwk:leasePublicJwk}=generateEs256KeyPair({kid:'gate-control-plane-lease'});
let gateUrl; let revision=0;
function nowSec(){return Math.floor(Date.now()/1000)}
function globMatch(pattern,value){const esc=pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*');return new RegExp(`^${esc}$`).test(value)}
function canonicalEdges(){return [...edges.values()].sort((a,b)=>a.edgeId.localeCompare(b.edgeId)).map(e=>({...e}))}
function stateHash(values=canonicalEdges()){return crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex')}
async function text(url){const r=await fetch(url,{headers:{accept:'application/entity-statement+jwt'}});if(!r.ok)throw new Error(`federation_http_${r.status}`);return r.text()}
async function resolveFederatedIssuer(entity){
  if(trustCache.has(entity)) return trustCache.get(entity);
  const anchorJwt=await text(`${trustAnchor}/.well-known/openid-federation`);const anchorUnsafe=decodeJwtUnsafe(anchorJwt);
  const anchorKey=anchorUnsafe.payload.jwks?.keys?.find(k=>k.kid===anchorUnsafe.protectedHeader.kid);if(!anchorKey)throw new Error('trust_anchor_key_missing');
  const anchor=verifyEs256Jwt({token:anchorJwt,publicJwk:anchorKey,expectedTyp:'entity-statement+jwt',issuer:trustAnchor}).payload;
  if(anchor.sub!==trustAnchor)throw new Error('trust_anchor_subject_mismatch');
  const entityJwt=await text(`${entity}/.well-known/openid-federation`);const entityUnsafe=decodeJwtUnsafe(entityJwt);
  const entityKey=entityUnsafe.payload.jwks?.keys?.find(k=>k.kid===entityUnsafe.protectedHeader.kid);if(!entityKey)throw new Error('entity_config_key_missing');
  const entityCfg=verifyEs256Jwt({token:entityJwt,publicJwk:entityKey,expectedTyp:'entity-statement+jwt',issuer:entity}).payload;if(entityCfg.sub!==entity)throw new Error('entity_config_subject_mismatch');
  const fetchEndpoint=anchor.metadata?.federation_entity?.federation_fetch_endpoint;if(!fetchEndpoint)throw new Error('federation_fetch_endpoint_missing');
  const subordinateJwt=await text(`${fetchEndpoint}?sub=${encodeURIComponent(entity)}`);
  const subordinate=verifyEs256Jwt({token:subordinateJwt,publicJwk:anchorKey,expectedTyp:'entity-statement+jwt',issuer:trustAnchor}).payload;if(subordinate.sub!==entity)throw new Error('federation_subordinate_subject_mismatch');
  const profile=subordinate.metadata?.gate_authority_issuer;if(!profile)throw new Error('federation_authority_profile_missing');
  const result={entity,principalPatterns:profile.principal_patterns||[],eventsSupported:profile.events_supported||[],trustAnchor};trustCache.set(entity,result);return result;
}
async function loadSetKey(issuer,kid){
  let md=ssfCache.get(issuer);if(!md){const r=await fetch(`${issuer}/.well-known/ssf-configuration`);if(!r.ok)throw new Error(`ssf_metadata_http_${r.status}`);md=await r.json();if(md.issuer!==issuer)throw new Error('ssf_issuer_metadata_mismatch');ssfCache.set(issuer,md)}
  let jwks=jwksCache.get(md.jwks_uri);if(!jwks){const r=await fetch(md.jwks_uri);if(!r.ok)throw new Error(`ssf_jwks_http_${r.status}`);jwks=await r.json();jwksCache.set(md.jwks_uri,jwks)}
  const key=jwks.keys?.find(k=>k.kid===kid);if(!key)throw new Error('ssf_key_not_found');return key;
}
async function ingestSet(token){
  const unsafe=decodeJwtUnsafe(token);const issuer=unsafe.payload.iss;if(!issuer)throw new Error('missing_set_issuer');
  const trust=await resolveFederatedIssuer(issuer);if(!trust.eventsSupported.includes(eventType))throw new Error('issuer_not_federated_for_event_type');
  const key=await loadSetKey(issuer,unsafe.protectedHeader.kid);const {payload}=verifyEs256Jwt({token,publicJwk:key,expectedTyp:'secevent+jwt',issuer,audience:gateUrl});
  if(!payload.jti)throw new Error('missing_set_jti');if(seenJti.has(payload.jti))throw new Error('set_replay_detected');
  const event=payload.events?.[eventType];if(!event)throw new Error('unsupported_event_type');if(!trust.principalPatterns.some(p=>globMatch(p,event.issuer_principal)))throw new Error('issuer_not_authorized_for_principal');
  if(!['ACTIVE','REVOKED'].includes(event.status))throw new Error('unsupported_authority_status');if(!Number.isInteger(event.sequence)||event.sequence<1)throw new Error('invalid_event_sequence');
  const current=edges.get(event.edge_id);if(current&&event.sequence<=current.sequence)throw new Error('stale_authority_event');seenJti.add(payload.jti);
  const state={edgeId:event.edge_id,issuer:event.issuer_principal,subject:event.subject_principal,status:event.status,sequence:event.sequence,revokedAt:event.status==='REVOKED'?(event.event_timestamp??new Date().toISOString()):null,reason:event.reason??null,source:{transmitter:issuer,jti:payload.jti,iat:payload.iat,trustAnchor,principalPatterns:trust.principalPatterns}};
  edges.set(state.edgeId,state);revision+=1;eventLog.push({acceptedAt:new Date().toISOString(),revision,...state});return state;
}
function bundle(region){
  const snapshot=canonicalEdges();const hash=stateHash(snapshot);const nowMs=Date.now();
  const lease=signJwt({header:{alg:'ES256',kid:leasePublicJwk.kid,typ:'gate-replica-lease+jwt'},payload:{iss:gateUrl,sub:`urn:gate:edge:${region}`,aud:'urn:gate:replication',iat:nowSec(),revision,state_hash:hash,issued_at_ms:nowMs,lease_expires_at_ms:nowMs+leaseTtlMs},privateKey:leasePrivateKey});
  return {revision,stateHash:hash,generatedAt:new Date(nowMs).toISOString(),edges:snapshot,lease};
}
function setError(res,description){return sendJson(res,400,{err:'invalid_request',description})}
const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,gateUrl||'http://localhost');
  if(req.method==='GET'&&u.pathname==='/health')return sendJson(res,200,{ok:true,revision,leaseTtlMs});
  if(req.method==='GET'&&u.pathname==='/jwks.json')return sendJson(res,200,{keys:[leasePublicJwk]});
  if(req.method==='GET'&&u.pathname==='/v1/authority/state')return sendJson(res,200,{revision,edges:canonicalEdges()});
  if(req.method==='GET'&&u.pathname==='/v1/events')return sendJson(res,200,{events:eventLog});
  if(req.method==='GET'&&u.pathname==='/v1/trust/cache')return sendJson(res,200,{issuers:[...trustCache.values()]});
  if(req.method==='GET'&&u.pathname==='/v1/replication/bundle')return sendJson(res,200,bundle(u.searchParams.get('region')||'unknown'));
  if(req.method==='POST'&&u.pathname==='/v1/authority/verify'){const body=await readJson(req);return sendJson(res,200,{...verifyLiveAuthority({principal:body.principal,actor:body.actor,edges:canonicalEdges()}),consistency:'strict',servedBy:'control-plane',revision});}
  if(req.method==='POST'&&u.pathname==='/Events'){
    if(!String(req.headers['content-type']??'').toLowerCase().startsWith('application/secevent+jwt'))return setError(res,'content_type_must_be_application_secevent_jwt');
    try{await ingestSet(await readText(req));res.writeHead(202);return res.end()}catch(e){return setError(res,e.message)}
  }
  return sendJson(res,404,{error:'not_found'});
});
const port=Number(process.env.PORT||0);await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));gateUrl=`http://127.0.0.1:${server.address().port}`;
console.log(JSON.stringify({ready:true,service:'gate-control-plane',url:gateUrl,trustAnchor,leaseTtlMs}));
