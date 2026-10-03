import http from 'node:http';
import crypto from 'node:crypto';
import { readJson, sendJson, postJson } from '../src/http-json.mjs';
import { decodeJwtUnsafe, verifyEs256Jwt } from '../src/jws.mjs';
import { verifyLiveAuthority } from '../src/verify-live-authority.mjs';

const controlPlane=process.env.CONTROL_PLANE_URL;const region=process.env.GATE_REGION||'local';
const pollMs=Number(process.env.REPLICA_POLL_MS||50);const defaultMaxStalenessMs=Number(process.env.DEFAULT_MAX_STALENESS_MS||250);
if(!controlPlane)throw new Error('CONTROL_PLANE_URL is required');
let snapshot=[],revision=0,stateHash=null,lastSyncAt=0,leaseExpiresAtMs=0,leaseIssuedAtMs=0,paused=false,partitioned=false,controlKey=null;
const metrics={checks:0,allow:0,deny:0,unknown:0,bounded:0,strict:0,syncSuccess:0,syncFailure:0};
function hashEdges(edges){return crypto.createHash('sha256').update(JSON.stringify([...edges].sort((a,b)=>a.edgeId.localeCompare(b.edgeId)))).digest('hex')}
async function getControlKey(kid){if(controlKey?.kid===kid)return controlKey;const r=await fetch(`${controlPlane}/jwks.json`);if(!r.ok)throw new Error(`control_jwks_http_${r.status}`);const jwks=await r.json();const key=jwks.keys?.find(k=>k.kid===kid);if(!key)throw new Error('control_key_not_found');controlKey=key;return key}
async function syncOnce(){
  if(paused||partitioned)return false;
  try{const r=await fetch(`${controlPlane}/v1/replication/bundle?region=${encodeURIComponent(region)}`);if(!r.ok)throw new Error(`bundle_http_${r.status}`);const b=await r.json();const unsafe=decodeJwtUnsafe(b.lease);const key=await getControlKey(unsafe.protectedHeader.kid);const {payload}=verifyEs256Jwt({token:b.lease,publicJwk:key,expectedTyp:'gate-replica-lease+jwt',issuer:controlPlane,audience:'urn:gate:replication'});if(payload.sub!==`urn:gate:edge:${region}`)throw new Error('lease_subject_mismatch');if(payload.revision!==b.revision)throw new Error('lease_revision_mismatch');if(payload.state_hash!==b.stateHash)throw new Error('lease_state_hash_mismatch');if(hashEdges(b.edges)!==b.stateHash)throw new Error('snapshot_hash_mismatch');snapshot=b.edges;revision=b.revision;stateHash=b.stateHash;lastSyncAt=Date.now();leaseExpiresAtMs=Number(payload.lease_expires_at_ms);leaseIssuedAtMs=Number(payload.issued_at_ms);metrics.syncSuccess+=1;return true}catch(e){metrics.syncFailure+=1;return false}
}
function freshness(maxStalenessMs){const now=Date.now();const age=lastSyncAt?now-lastSyncAt:Infinity;const leaseRemaining=leaseExpiresAtMs-now;const limit=Math.min(Number.isFinite(maxStalenessMs)?maxStalenessMs:defaultMaxStalenessMs,Math.max(0,leaseExpiresAtMs-leaseIssuedAtMs));return{ageMs:age,leaseRemainingMs:leaseRemaining,maxStalenessMs:limit,fresh:lastSyncAt>0&&now<=leaseExpiresAtMs&&age<=limit}}
async function verify(body){
  metrics.checks+=1;const consistency=body.consistency||'bounded';
  if(consistency==='strict'){
    metrics.strict+=1;if(partitioned){metrics.deny+=1;metrics.unknown+=1;return{authority:'UNKNOWN',decision:'DENY',reason:'strict_control_plane_unreachable',consistency,servedBy:`edge:${region}`,region,revision}}
    try{const out=await postJson(`${controlPlane}/v1/authority/verify`,{principal:body.principal,actor:body.actor});if(out.decision==='ALLOW')metrics.allow+=1;else metrics.deny+=1;return{...out,consistency,servedBy:`edge:${region}->control-plane`,region,edgeRevision:revision}}catch(e){metrics.deny+=1;metrics.unknown+=1;return{authority:'UNKNOWN',decision:'DENY',reason:'strict_control_plane_unreachable',error:e.message,consistency,servedBy:`edge:${region}`,region,revision}}
  }
  metrics.bounded+=1;const fr=freshness(Number(body.maxStalenessMs??defaultMaxStalenessMs));if(!fr.fresh){metrics.deny+=1;metrics.unknown+=1;return{authority:'UNKNOWN',decision:'DENY',reason:'replica_freshness_requirement_not_met',consistency,servedBy:`edge:${region}`,region,revision,freshness:fr}}
  const out=verifyLiveAuthority({principal:body.principal,actor:body.actor,edges:snapshot});if(out.decision==='ALLOW')metrics.allow+=1;else metrics.deny+=1;return{...out,consistency,servedBy:`edge:${region}`,region,revision,stateHash,freshness:fr};
}
const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/health')return sendJson(res,200,{ok:true,region,revision,paused,partitioned,...freshness(defaultMaxStalenessMs)});
  if(req.method==='GET'&&req.url==='/v1/replica/status')return sendJson(res,200,{region,revision,stateHash,lastSyncAt,leaseExpiresAtMs,paused,partitioned,metrics,...freshness(defaultMaxStalenessMs)});
  if(req.method==='GET'&&req.url==='/v1/metrics')return sendJson(res,200,{region,...metrics,revision});
  if(req.method==='POST'&&req.url==='/v1/authority/verify')return sendJson(res,200,await verify(await readJson(req)));
  if(req.method==='POST'&&req.url==='/demo/replication/pause'){paused=true;return sendJson(res,200,{paused,region});}
  if(req.method==='POST'&&req.url==='/demo/replication/resume'){paused=false;await syncOnce();return sendJson(res,200,{paused,region,revision});}
  if(req.method==='POST'&&req.url==='/demo/network/partition'){partitioned=true;return sendJson(res,200,{partitioned,region});}
  if(req.method==='POST'&&req.url==='/demo/network/heal'){partitioned=false;await syncOnce();return sendJson(res,200,{partitioned,region,revision});}
  return sendJson(res,404,{error:'not_found'});
});
const port=Number(process.env.PORT||0);await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));await syncOnce();
const timer=setInterval(()=>{void syncOnce()},pollMs);timer.unref();
console.log(JSON.stringify({ready:true,service:'gate-edge',url:`http://127.0.0.1:${server.address().port}`,region,controlPlane,pollMs,defaultMaxStalenessMs}));
