import http from 'node:http';
import crypto from 'node:crypto';
import { readJson, sendJson, postJson } from '../src/http-json.mjs';
import { decodeJwtUnsafe, verifyEs256Jwt } from '../src/jws.mjs';
import { verifyLiveAuthority } from '../src/verify-live-authority.mjs';
import { buildAuthorityReceipt } from '../src/authority-receipt.mjs';
import { createUsageReporter, readBearerToken } from '../src/usage-telemetry.mjs';

const controlPlane=process.env.CONTROL_PLANE_URL;const region=process.env.GATE_REGION||'local';
const pollMs=Number(process.env.REPLICA_POLL_MS||50);const defaultMaxStalenessMs=Number(process.env.DEFAULT_MAX_STALENESS_MS||250);
if(!controlPlane)throw new Error('CONTROL_PLANE_URL is required');
const usageReporter=createUsageReporter({
  endpoint:process.env.GATE_METRICS_URL,
  clientVersion:process.env.GATE_EDGE_VERSION||'gate-edge-dev',
  timeoutMs:Number(process.env.GATE_METRICS_TIMEOUT_MS||750)
});
const fallbackUsageApiKey=process.env.GATE_USAGE_API_KEY||null;
let snapshot=[],sourceStates=[],revision=0,sourceRevision=0,stateHash=null,lastSyncAt=0,leaseExpiresAtMs=0,leaseIssuedAtMs=0,paused=false,partitioned=false,controlKey=null;
const metrics={checks:0,allow:0,deny:0,unknown:0,bounded:0,strict:0,syncSuccess:0,syncFailure:0,telemetrySent:0,telemetryFailed:0,telemetrySkipped:0};
function hashBundleState(edges,sources){
  const sortedEdges=[...edges].sort((a,b)=>a.edgeId.localeCompare(b.edgeId));
  const sortedSources=[...(sources??[])].sort((a,b)=>String(a.source).localeCompare(String(b.source)));
  return crypto.createHash('sha256').update(JSON.stringify({edges:sortedEdges,sources:sortedSources})).digest('hex');
}
async function getControlKey(kid){if(controlKey?.kid===kid)return controlKey;const r=await fetch(`${controlPlane}/jwks.json`);if(!r.ok)throw new Error(`control_jwks_http_${r.status}`);const jwks=await r.json();const key=jwks.keys?.find(k=>k.kid===kid);if(!key)throw new Error('control_key_not_found');controlKey=key;return key}
async function syncOnce(){
  if(paused||partitioned)return false;
  try{const r=await fetch(`${controlPlane}/v1/replication/bundle?region=${encodeURIComponent(region)}`);if(!r.ok)throw new Error(`bundle_http_${r.status}`);const b=await r.json();const unsafe=decodeJwtUnsafe(b.lease);const key=await getControlKey(unsafe.protectedHeader.kid);const {payload}=verifyEs256Jwt({token:b.lease,publicJwk:key,expectedTyp:'gate-replica-lease+jwt',issuer:controlPlane,audience:'urn:gate:replication'});if(payload.sub!==`urn:gate:edge:${region}`)throw new Error('lease_subject_mismatch');if(payload.revision!==b.revision)throw new Error('lease_revision_mismatch');if(Number(payload.source_revision??0)!==Number(b.sourceRevision??0))throw new Error('lease_source_revision_mismatch');if(payload.state_hash!==b.stateHash)throw new Error('lease_state_hash_mismatch');if(hashBundleState(b.edges,b.sources??[])!==b.stateHash)throw new Error('snapshot_hash_mismatch');snapshot=b.edges;sourceStates=b.sources??[];revision=b.revision;sourceRevision=Number(b.sourceRevision??0);stateHash=b.stateHash;lastSyncAt=Date.now();leaseExpiresAtMs=Number(payload.lease_expires_at_ms);leaseIssuedAtMs=Number(payload.issued_at_ms);metrics.syncSuccess+=1;return true}catch(e){metrics.syncFailure+=1;return false}
}
function freshness(maxStalenessMs){const now=Date.now();const age=lastSyncAt?now-lastSyncAt:Infinity;const leaseRemaining=leaseExpiresAtMs-now;const limit=Math.min(Number.isFinite(maxStalenessMs)?maxStalenessMs:defaultMaxStalenessMs,Math.max(0,leaseExpiresAtMs-leaseIssuedAtMs));return{scope:'gate-replica',ageMs:age,leaseRemainingMs:leaseRemaining,maxStalenessMs:limit,fresh:lastSyncAt>0&&now<=leaseExpiresAtMs&&age<=limit}}
async function verify(body){
  metrics.checks+=1;const consistency=body.consistency||'bounded';
  if(consistency==='strict'){
    metrics.strict+=1;if(partitioned){metrics.deny+=1;metrics.unknown+=1;return{authority:'UNKNOWN',decision:'DENY',reason:'strict_control_plane_unreachable',consistency,servedBy:`edge:${region}`,region,revision,sourceRevision}}
    try{const out=await postJson(`${controlPlane}/v1/authority/verify`,{principal:body.principal,actor:body.actor});if(out.decision==='ALLOW')metrics.allow+=1;else metrics.deny+=1;return{...out,consistency,servedBy:`edge:${region}->control-plane`,region,edgeRevision:revision,edgeSourceRevision:sourceRevision}}catch(e){metrics.deny+=1;metrics.unknown+=1;return{authority:'UNKNOWN',decision:'DENY',reason:'strict_control_plane_unreachable',error:e.message,consistency,servedBy:`edge:${region}`,region,revision,sourceRevision}}
  }
  metrics.bounded+=1;const replicaFreshness=freshness(Number(body.maxStalenessMs??defaultMaxStalenessMs));if(!replicaFreshness.fresh){
    metrics.deny+=1;metrics.unknown+=1;
    const denied={authority:'UNKNOWN',decision:'DENY',reason:'replica_freshness_requirement_not_met',principal:body.principal,actor:body.actor,sourceFreshness:[],evaluatedPathCount:0};
    return{...denied,consistency,servedBy:`edge:${region}`,region,revision,sourceRevision,replicaFreshness,receipt:buildAuthorityReceipt(denied,{replicaFreshness,sequenceContinuityVerified:true})}
  }
  const out=verifyLiveAuthority({principal:body.principal,actor:body.actor,edges:snapshot,sourceStates,requireFreshSources:true});
  if(out.decision==='ALLOW')metrics.allow+=1;else{metrics.deny+=1;if(out.authority==='UNKNOWN')metrics.unknown+=1}
  return{...out,consistency,servedBy:`edge:${region}`,region,revision,sourceRevision,stateHash,replicaFreshness,receipt:buildAuthorityReceipt(out,{replicaFreshness,sequenceContinuityVerified:true})};
}
function recordUsage(req,body,result,startedAt){
  const apiKey=readBearerToken(req.headers.authorization)||fallbackUsageApiKey;
  const latencyMs=Math.max(0,Date.now()-startedAt);
  void usageReporter.report({
    apiKey,
    source:'api',
    decision:result?.decision||'ERROR',
    authority:result?.authority??null,
    consistency:body?.consistency||'bounded',
    latencyMs
  }).then(out=>{
    if(out.sent)metrics.telemetrySent+=1;
    else if(out.reason==='disabled'||out.reason==='missing_api_key')metrics.telemetrySkipped+=1;
    else metrics.telemetryFailed+=1;
  }).catch(()=>{metrics.telemetryFailed+=1});
}
const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/health')return sendJson(res,200,{ok:true,region,revision,sourceRevision,paused,partitioned,...freshness(defaultMaxStalenessMs)});
  if(req.method==='GET'&&req.url==='/v1/replica/status')return sendJson(res,200,{region,revision,sourceRevision,stateHash,lastSyncAt,leaseExpiresAtMs,paused,partitioned,metrics,sourceCount:sourceStates.length,...freshness(defaultMaxStalenessMs)});
  if(req.method==='GET'&&req.url==='/v1/metrics')return sendJson(res,200,{region,...metrics,revision,sourceRevision});
  if(req.method==='POST'&&req.url==='/v1/authority/verify'){
    const startedAt=Date.now();
    const body=await readJson(req);
    const result=await verify(body);
    recordUsage(req,body,result,startedAt);
    return sendJson(res,200,result);
  }
  if(req.method==='POST'&&req.url==='/demo/replication/pause'){paused=true;return sendJson(res,200,{paused,region});}
  if(req.method==='POST'&&req.url==='/demo/replication/resume'){paused=false;await syncOnce();return sendJson(res,200,{paused,region,revision,sourceRevision});}
  if(req.method==='POST'&&req.url==='/demo/network/partition'){partitioned=true;return sendJson(res,200,{partitioned,region});}
  if(req.method==='POST'&&req.url==='/demo/network/heal'){partitioned=false;await syncOnce();return sendJson(res,200,{partitioned,region,revision,sourceRevision});}
  return sendJson(res,404,{error:'not_found'});
});
const port=Number(process.env.PORT||0);await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));await syncOnce();
const timer=setInterval(()=>{void syncOnce()},pollMs);timer.unref();
console.log(JSON.stringify({ready:true,service:'gate-edge',url:`http://127.0.0.1:${server.address().port}`,region,controlPlane,pollMs,defaultMaxStalenessMs}));
