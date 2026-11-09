import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {GateClient} from '@gate-avn/sdk';import {createMcpEffectGuard} from '@gate-avn/mcp/effect-boundary';
import {ENDPOINT,EVENT_TYPE,Ledger,makeKeys,signedEvent,savePrivate,expectedAt,caseFits,sanitizeDecision,matchesExpected} from './ops.mjs';
// The caller must provide transport. This module contains no global fetch or remote launch.
export async function executePlan({plan,profile,dir,clock,send,mode,runnerAttribution,start=clock.now(),afterMarker=()=>{}}){
 const ledger=new Ledger(dir),keys=makeKeys(),runId='lra-'+randomUUID(),issuer='urn:gate:test:'+runId;
 const report={mode,hosted:mode==='hosted',runnerAttribution,vectorAuthor:'Tymofii Pidlisnyi',implementationAuthor:'GATE team',transport:'published MCP effect guard + two SDK objects; no MCP wire conformance claim',status:'RUNNING',finalized:false,scheduledStart:plan.scheduledStart,requests:[],calls:[],cases:[],counts:{allowDecisions:0,callbacksAdmitted:0,callbacksStarted:0,callbacksCompleted:0,effects:0},cleanup:'NOT_TESTED'};
 let secret=null,issuerAttempted=false,lastHttp=null,stop=null;
 const selected=plan.profiles[profile].map(id=>plan.cases.find(c=>c.case===id));
 for(const c of selected)report.cases.push({id:c.case,status:'NOT TESTED',callsExpected:c.callCount});
 const effectCount=()=>{const f=path.join(dir,'effects.jsonl');if(!fs.existsSync(f))return 0;try{return fs.readFileSync(f,'utf8').split('\n').filter(Boolean).map(x=>JSON.parse(x)).length;}catch{throw Error('EFFECT_COUNTER_UNAVAILABLE');}};
 const save=()=>{report.attempts=ledger.count;report.remaining=50-ledger.count;savePrivate(path.join(dir,'results.json'),report);};
 async function api({id,kind,method,route,body,phase='normal'}){
  const elapsed=clock.now()-start;
  if(phase==='normal'&&fs.existsSync(path.join(dir,'STOP')))throw Error('OPERATOR_STOP');
  if(elapsed>=plan.hardWindowMs)throw Error('WINDOW_ENDED');
  if(phase==='normal'&&elapsed>=plan.cleanupStartsByMs)throw Error('NORMAL_TIME_ENDED');
  const n=ledger.before({id,kind,phase,method,route});
  const began=clock.now();const r={n,id,kind,phase,startedAt:new Date(began).toISOString(),http:null};report.requests.push(r);save();
  let response;
  try{
   response=await send(ENDPOINT+route,{method,headers:{'content-type':'application/json',...(kind==='verify'?{'x-gate-source':'mcp','x-gate-client-version':'0.1.0-dev.4'}:{}),...(secret?.apiKey?{authorization:'Bearer '+secret.apiKey}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(plan.requestTimeoutMs,plan.hardWindowMs-elapsed)))});
   r.http=response.status;const data=await response.clone().json();r.durationMs=clock.now()-began;
   // No raw headers, request, response, keys, JWT or arbitrary server errors are persisted.
   if(kind==='event'){r.accepted=data.accepted===true;r.sequence=Number.isInteger(data.event?.sequence)?data.event.sequence:null;}
   if(kind==='verify'){r.decision=sanitizeDecision(data);lastHttp={http:response.status,decision:r.decision};}
   save();return {response,data};
  }catch{r.transportError=true;r.durationMs=clock.now()-began;save();throw Error('HTTP_ATTEMPT_FAILED_NO_RETRY');}
 }
 async function must(args,status){const r=await api(args);if(r.response.status!==status)throw Error('UNEXPECTED_HTTP_'+r.response.status);return r.data;}
 try{
  const health=await must({id:'run-health',kind:'health',method:'GET',route:'/health'},200);if(health.service!=='gate-network')throw Error('WRONG_SERVICE');
  const p=await must({id:'create-test-project',kind:'project',method:'POST',route:'/projects/register',body:{name:'Disposable GATE LRA evaluation'}},201);
  if(p.project?.plan!=='free'||typeof p.apiKey!=='string'||typeof p.project?.id!=='string'||p.endpoint!==ENDPOINT||p.eventType!==EVENT_TYPE||p.audience!=='urn:gate:project:'+p.project.id)throw Error('INVALID_PROJECT_RESPONSE');
  secret={apiKey:p.apiKey,projectId:p.project.id,audience:p.audience,issuer,keyId:keys.publicJwk.kid,runId};savePrivate(path.join(dir,'recovery-secret.json'),secret);
  const info=await must({id:'check-free',kind:'info',method:'GET',route:'/v1/project'},200);
  if(info.plan!=='free'||info.activeIssuers!==0||info.entitlements?.max_issuers!==1||info.entitlements?.allow_strict!==false||info.usage?.included!==50000)throw Error('FREE_PRECONDITION_FAILED');
  issuerAttempted=true;
  await must({id:'register-issuer',kind:'issuer',method:'POST',route:'/v1/issuers/register',body:{issuer,publicJwk:keys.publicJwk,principalPatterns:[runId+':*']}},201);
  for(const c of selected){
   if(!caseFits({now:clock.now(),start,plan,casePlan:c})){stop='INSUFFICIENT_TIME_FOR_COMPLETE_NEXT_CASE';break;}
   const cr=report.cases.find(r=>r.id===c.case),t0=clock.now()+plan.caseLeadMs,principal=runId+':'+c.case+':owner',actor=runId+':'+c.case+':agent',knownActive=new Set(),expiry=t0+120000;
   cr.status='RUNNING';cr.t0=new Date(t0).toISOString();cr.validUntil=new Date(expiry).toISOString();save();
   const edgeId=g=>runId+'-'+c.case+'-'+g;
   const event=async(g,status)=>{
    const token=signedEvent({keys,issuer,audience:secret.audience,edgeId:edgeId(g),principal,actor,status,sequence:status==='ACTIVE'?1:2,validUntil:expiry,now:clock.now()});
    const ack=await must({id:c.case+'-'+g+'-'+status,kind:'event',method:'POST',route:'/v1/authority/events',body:{set:token}},202);
    if(ack.accepted!==true||ack.event?.edgeId!==edgeId(g)||ack.event?.status!==status||ack.event?.sequence!==(status==='ACTIVE'?1:2))throw Error('EVENT_ACK_NOT_ESTABLISHED');
    if(status==='ACTIVE')knownActive.add(edgeId(g));else knownActive.delete(edgeId(g));
   };
   await event('g1','ACTIVE');if(c.case==='LRA-06')await event('g2','ACTIVE');
   if(clock.now()>=t0)throw Error('GRANT_NOT_ACCEPTED_BEFORE_T0');
   const currentCalls=new Map();
   const clients=new Map(['w1','w2'].map(worker=>[worker,new GateClient({endpoint:ENDPOINT,apiKey:secret.apiKey,timeoutMs:plan.requestTimeoutMs,source:'mcp',fetchImpl:async(url,init)=>{
    const call=currentCalls.get(worker);if(!call||url!==ENDPOINT+'/v1/authority/verify')throw Error('UNPLANNED_VERIFY');
    call.httpAttempts++;if(call.httpAttempts!==1)throw Error('RETRY_FORBIDDEN');
    return (await api({id:call.id,kind:'verify',method:'POST',route:'/v1/authority/verify',body:JSON.parse(init.body)})).response;
   }})]));
   async function guardedCall(e){
    report.counts.effects=effectCount();
    const rec={id:e.id,case:c.case,worker:e.worker,plannedOffsetMs:e.at_ms,dispatchedOffsetMs:clock.now()-t0,httpAttempts:0,expected:expectedAt(c.case,e.at_ms),observed:null,callbacksBefore:report.counts.callbacksStarted,effectsBefore:report.counts.effects,status:'NOT TESTED'};
    currentCalls.set(e.worker,rec);report.calls.push(rec);lastHttp=null;
    let interlockFailure=null;
    const guard=createMcpEffectGuard({principal,actor,consistency:'bounded',reporter:null,gate:{verify:async request=>{
     const d=await clients.get(e.worker).verify(request);rec.observed=sanitizeDecision(d);
     if(d.decision==='ALLOW')report.counts.allowDecisions++;
     if(d.decision==='ALLOW'){
      // Test safety interlock, not a new GATE security guarantee or a corrected test result.
      const supporting=Array.isArray(d.selectedEdges)&&d.selectedEdges.length&&d.selectedEdges.every(id=>knownActive.has(id));
      if(d.authority!=='VALID'||!supporting){interlockFailure='UNJUSTIFIED_ALLOW';throw Error('SAFETY_INTERLOCK_STOP');}
      if(clock.now()>=expiry){interlockFailure='TIMING_INCONCLUSIVE';throw Error('SAFETY_INTERLOCK_STOP');}
     }
     if(!matchesExpected(rec.expected,d)){
      interlockFailure=d.reason==='authority_lease_expired'&&e.at_ms===119000?'TIMING_INCONCLUSIVE':'UNEXPECTED_DECISION';throw Error('SAFETY_INTERLOCK_STOP');
     }
     if(d.decision==='DENY'&&rec.observed.reasonCapture==='redacted'){interlockFailure='REFUSAL_REASON_REDACTED';throw Error('DIAGNOSTIC_CAPTURE_INCOMPLETE');}
     if(rec.observed.freshness.source!=='canonical-primary'||rec.observed.freshness.isPrimary!==true||!rec.observed.freshness.snapshotAt||typeof rec.observed.freshness.snapshotAgeMs!=='number'||rec.observed.freshness.snapshotAgeMs<0||rec.observed.freshness.snapshotAgeMs>5000||rec.observed.freshness.effectiveSnapshotLimitMs!==5000){interlockFailure='FRESHNESS_NOT_ESTABLISHED';throw Error('SAFETY_INTERLOCK_STOP');}
     return d;
    }}});
    try{
     await guard.enforceToolCall({toolName:'test_local_marker',parameters:{case:c.case,grantLabel:e.grant}},async()=>{
      report.counts.callbacksAdmitted++;report.counts.callbacksStarted++;
      if(clock.now()>=start+plan.cleanupStartsByMs||fs.existsSync(path.join(dir,'STOP')))throw Error('EFFECT_TIME_STOP');
      const fd=fs.openSync(path.join(dir,'effects.jsonl'),'a',0o600);try{fs.writeSync(fd,JSON.stringify({id:e.id})+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
      afterMarker();report.counts.callbacksCompleted++;
     });
    }catch{if(!rec.observed||interlockFailure||rec.observed.decision!=='DENY'){rec.status=['TIMING_INCONCLUSIVE','REFUSAL_REASON_REDACTED'].includes(interlockFailure)?'PARTIAL':'FAIL';rec.stopReason=interlockFailure||'SDK_OR_CALLBACK_ERROR';}}
    try{report.counts.effects=effectCount();}catch{report.counts.effects=null;rec.status='PARTIAL';rec.stopReason='EFFECT_COUNTER_UNAVAILABLE';}
    rec.http=lastHttp?.http??null;rec.rawHttpDecision=lastHttp?.decision??null;rec.callbacksAfter=report.counts.callbacksStarted;rec.effectsAfter=report.counts.effects;
    const delta=rec.effectsAfter-rec.effectsBefore,callbackDelta=rec.callbacksAfter-rec.callbacksBefore;
    if(rec.observed?.decision==='DENY'&&(delta!==0||callbackDelta!==0)){rec.status='FAIL';rec.stopReason='EFFECT_AFTER_REFUSAL';}
    if(rec.status==='NOT TESTED'){
     if(rec.httpAttempts!==1||delta!==(rec.expected.decision==='ALLOW'?1:0)||callbackDelta!==delta){rec.status='FAIL';rec.stopReason='EFFECT_COUNT_MISMATCH';}
     else rec.status=rec.expected.coverage;
    }
    save();if(rec.stopReason)throw Error(rec.stopReason);
   }
   const offsets=[...new Set(c.timeline.map(e=>e.at_ms))].sort((a,b)=>a-b);
   for(const at of offsets){
    while(clock.now()<t0+at){if(fs.existsSync(path.join(dir,'STOP')))throw Error('OPERATOR_STOP');await clock.until(Math.min(t0+at,clock.now()+1000));}
    if(clock.now()>=start+plan.cleanupStartsByMs)throw Error('NORMAL_TIME_ENDED');
    const group=c.timeline.filter(e=>e.at_ms===at);
    for(const e of group.filter(e=>e.event==='revoke'))await event(e.grant,'REVOKED');
    const calls=group.filter(e=>e.event==='call');
    // Preserve same-offset intent, but do not claim atomic simultaneous observation.
    // Calls share one dispatch queue and durable counter; dispatch skew is recorded.
    for(const e of calls)await guardedCall(e);
   }
   cr.status=['LRA-06','LRA-08'].includes(c.case)?'PARTIAL':'PASS';save();
  }
  report.status=stop?'PARTIAL':'COMPLETED';report.stopReason=stop;
 }catch(e){report.status='STOPPED';report.stopReason=/^[A-Z0-9_]+$/.test(e.message)?e.message:'LOCAL_ERROR_REDACTED';const active=report.cases.find(c=>c.status==='RUNNING');if(active)active.status=['UNJUSTIFIED_ALLOW','UNEXPECTED_DECISION','EFFECT_AFTER_REFUSAL','EFFECT_COUNT_MISMATCH','FRESHNESS_NOT_ESTABLISHED'].includes(report.stopReason)?'FAIL':'PARTIAL';}
 finally{
  try{
   if(secret&&issuerAttempted){
    const r=await api({id:'cleanup-revoke',kind:'revoke',method:'POST',route:'/v1/issuers/revoke',body:{issuer,keyId:keys.publicJwk.kid},phase:'cleanup'});
    const list=await must({id:'cleanup-list',kind:'list',method:'GET',route:'/v1/issuers',phase:'cleanup'},200);
    const info=await must({id:'cleanup-info',kind:'info',method:'GET',route:'/v1/project',phase:'cleanup'},200);
    const row=list.issuers?.find(x=>x.issuer===issuer&&x.key_id===keys.publicJwk.kid);
    if(r.response.status===200&&row?.status==='revoked'&&row?.effectiveStatus==='revoked'&&info.activeIssuers===0)report.cleanup='PASS';else report.cleanup='UNCERTAIN';
   }else report.cleanup=secret?'NO_ISSUER_ATTEMPTED':'NO_ISSUER_CREATED_OR_PROJECT_CREATE_UNCERTAIN';
  }catch{report.cleanup='UNCERTAIN';}
  if(report.cleanup==='UNCERTAIN')report.status='HOLD_CLEANUP';
  if(report.cleanup==='PASS'&&fs.existsSync(path.join(dir,'recovery-secret.json'))){try{fs.unlinkSync(path.join(dir,'recovery-secret.json'));report.localSecretCleanup='PASS';}catch{report.localSecretCleanup='UNCERTAIN';report.status='HOLD_LOCAL_SECRET';}}
  for(const c of report.cases)if(c.status==='RUNNING')c.status='PARTIAL';
  report.elapsedMs=clock.now()-start;report.finalized=true;save();ledger.close();
 }
 return report;
}
