import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {checkAuthorization,sha,Ledger,ENDPOINT,savePrivate} from './ops.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),planBytes=fs.readFileSync(path.join(here,'plan.json')),plan=JSON.parse(planBytes);
const [command,...args]=process.argv.slice(2);const value=name=>{const i=args.indexOf('--'+name);return i<0?null:args[i+1];};
async function main(){
 if(command==='plan'){const profile=value('profile')??'full';if(!plan.profiles[profile])throw Error('INVALID_PROFILE');const cases=plan.profiles[profile].map(id=>plan.cases.find(c=>c.case===id));const guardedCalls=cases.reduce((n,c)=>n+c.callCount,0),events=cases.reduce((n,c)=>n+c.signedEvents,0);console.log(JSON.stringify({executionAuthorized:false,planSha256:sha(planBytes),profile,guardedCalls,attempts:8+guardedCalls+events,cap:50,start:plan.scheduledStart,automaticRetries:0},null,2));return;}
 if(command==='dry-run'){
  const dir=value('out');if(!dir)throw Error('PRIVATE_OUTPUT_REQUIRED');const profile=value('profile')??'full';if(!['full','reduced'].includes(profile))throw Error('INVALID_PROFILE');
  const {fixture}=await import('./mock.mjs'),{executePlan}=await import('./runtime.mjs');const f=fixture();
  const r=await executePlan({plan,profile,dir,clock:f.clock,send:f.send,mode:'OFFLINE_SYNTHETIC',runnerAttribution:'implementation-team local rehearsal'});
  console.log(JSON.stringify({mode:r.mode,hosted:false,status:r.status,attempts:r.attempts,calls:r.calls.length,elapsedVirtualMs:r.elapsedMs,cleanup:r.cleanup},null,2));return;
 }
 if(command==='deps'){
  if(Number(process.versions.node.split('.')[0])<20)throw Error('NODE20_REQUIRED');
  const packages=[['@gate-avn/sdk','0.1.0-dev.4','@gate-avn/sdk'],['@gate-avn/mcp','0.1.0-dev.9','@gate-avn/mcp/effect-boundary']];
  for(const [name,version,entry] of packages){const modulePath=fileURLToPath(import.meta.resolve(entry));const pkg=JSON.parse(fs.readFileSync(path.join(path.dirname(modulePath),'..','package.json')));if(pkg.name!==name||pkg.version!==version)throw Error('PINNED_PACKAGE_MISMATCH');}
  console.log('PASS SDK0.1.0-dev.4 MCP0.1.0-dev.9 Node'+process.versions.node+'; no network');return;
 }
 if(command==='decision'){
  const authPath=value('authorization'),mappingPath=value('mapping');let verdict='HOLD',reason='OWNER_APPROVAL_AND_MAPPING_REQUIRED';
  try{if(!authPath||!mappingPath)throw Error(reason);const a=JSON.parse(fs.readFileSync(authPath));checkAuthorization(a,planBytes,fs.readFileSync(mappingPath),Date.parse(plan.scheduledStart));verdict='GO_FOR_EXPLICITLY_APPROVED_WINDOW_ONLY';reason='LOCAL_GATES_MATCH';}catch(e){reason=/^[A-Z0-9_]+$/.test(e.message)?e.message:'LOCAL_CHECK_FAILED';}
  console.log(JSON.stringify({verdict,reason,noRequestSent:true,scheduledStart:plan.scheduledStart,planSha256:sha(planBytes)},null,2));return;
 }
 if(command==='status'){
  const dir=value('out');if(!dir)throw Error('OUTPUT_REQUIRED');const r=JSON.parse(fs.readFileSync(path.join(dir,'results.json')));
  console.log(JSON.stringify({mode:r.mode,status:r.status,attempts:r.attempts,remaining:r.remaining,cleanup:r.cleanup,counts:r.counts,cases:r.cases},null,2));return;
 }
 if(command==='stop'){const dir=value('out');if(!dir||!fs.existsSync(path.join(dir,'active.lock')))throw Error('ACTIVE_RUN_REQUIRED');fs.writeFileSync(path.join(dir,'STOP'),'operator stop\n',{mode:0o600});console.log('STOP_REQUESTED_CLEANUP_REMAINS_ALLOWED');return;}
 if(command==='run'){
  const authPath=value('authorization'),mappingPath=value('mapping'),dir=value('out');if(!authPath||!mappingPath||!dir)throw Error('APPROVAL_MAPPING_OUTPUT_REQUIRED');
  const auth=JSON.parse(fs.readFileSync(authPath)),mapping=fs.readFileSync(mappingPath);checkAuthorization(auth,planBytes,mapping,Date.now());
  // Authorization is checked before importing the runtime, creating files, keys or any fetch.
  const {executePlan}=await import('./runtime.mjs');const wall0=Date.now(),mono0=performance.now();
  const clock={now:()=>wall0+(performance.now()-mono0),until:async target=>{const remaining=target-(wall0+performance.now()-mono0);if(remaining>0)await new Promise(r=>setTimeout(r,remaining));}};
  const windowStart=Date.parse(auth.approvedStart);
  const onStop=()=>{try{fs.writeFileSync(path.join(dir,'STOP'),'signal stop\n',{mode:0o600});}catch{}};process.on('SIGINT',onStop);process.on('SIGTERM',onStop);
  let report;try{report=await executePlan({plan,profile:auth.profile,dir,clock,send:(url,init)=>fetch(url,init),mode:'hosted',runnerAttribution:auth.runnerAttribution,start:windowStart});}finally{process.removeListener('SIGINT',onStop);process.removeListener('SIGTERM',onStop);}
  console.log(JSON.stringify({status:report.status,attempts:report.attempts,calls:report.calls.length,cleanup:report.cleanup}));return;
 }
 if(command==='recover'){
  const dir=value('out'),authPath=value('authorization'),action=value('action');if(!dir||!authPath||!['inspect','revoke','info'].includes(action))throw Error('RECOVERY_ARGUMENTS_REQUIRED');
  const a=JSON.parse(fs.readFileSync(authPath)),now=Date.now();
  if(!Number.isFinite(Date.parse(a.approvedStart))||!Number.isFinite(Date.parse(a.approvedEnd))||typeof a.approvalId!=='string'||a.recoveryAuthorized!==true||a.owner!=='Jérôme'||a.planSha256!==sha(planBytes)||path.resolve(a.runDirectory??'')!==path.resolve(dir)||a.action!==action||now<Date.parse(a.approvedStart)||now>=Date.parse(a.approvedEnd))throw Error('RECOVERY_NOT_AUTHORIZED');
  const secretPath=path.join(dir,'recovery-secret.json');if(fs.statSync(secretPath).mode&0o077)throw Error('PRIVATE_SECRET_REQUIRED');
  const secret=JSON.parse(fs.readFileSync(secretPath)),ledger=new Ledger(dir,{resume:true});
  try{
   if(!Number.isFinite(Date.parse(a.approvedEnd)))throw Error('RECOVERY_WINDOW_INVALID');
   const recentFile=path.join(dir,'recovery-observation.json');let previous=fs.existsSync(recentFile)?JSON.parse(fs.readFileSync(recentFile)):null;
   if(action==='revoke'&&(!previous||previous.status!=='active'||now-previous.at>60000))throw Error('INSPECT_ACTIVE_FIRST');
   const kind=action==='inspect'?'list':action==='revoke'?'revoke':'info',method=action==='revoke'?'POST':'GET',route=action==='inspect'?'/v1/issuers':action==='revoke'?'/v1/issuers/revoke':'/v1/project';
   if(a.attemptsBefore!==ledger.count)throw Error('RECOVERY_COUNTER_CHANGED');
   ledger.before({id:'manual-recovery-'+a.approvalId,kind,method,route,phase:'recovery'});
   const response=await fetch(ENDPOINT+route,{method,redirect:'error',signal:AbortSignal.timeout(5000),headers:{'content-type':'application/json',authorization:'Bearer '+secret.apiKey},...(action==='revoke'?{body:JSON.stringify({issuer:secret.issuer,keyId:secret.keyId})}:{})});
   const body=await response.json();let result={action,http:response.status,attempts:ledger.count,at:Date.now(),status:'UNCERTAIN'};
   if(response.ok&&action==='inspect'){const row=body.issuers?.find(x=>x.issuer===secret.issuer&&x.key_id===secret.keyId);result.status=row?.status==='revoked'&&row?.effectiveStatus==='revoked'?'revoked':row?.status==='active'?'active':'UNCERTAIN';savePrivate(recentFile,result);}
   if(response.ok&&action==='info'&&body.activeIssuers===0&&previous?.status==='revoked'&&now-previous.at<60000)result.status='TRUST_WITHDRAWAL_CONFIRMED';
   savePrivate(path.join(dir,'last-recovery-result.json'),result);console.log(JSON.stringify(result));
  }finally{ledger.close();}
  return;
 }
 throw Error('UNKNOWN_COMMAND');
}
main().catch(e=>{console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'LOCAL_ERROR_REDACTED');process.exitCode=1;});
