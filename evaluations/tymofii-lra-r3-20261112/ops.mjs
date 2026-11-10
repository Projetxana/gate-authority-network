import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,generateKeyPairSync,sign,createHash} from 'node:crypto';
export const ENDPOINT='https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-network';
export const EVENT_TYPE='urn:gate:event:authority-edge-state:v1';
export function sha(s){return createHash('sha256').update(s).digest('hex');}
export function privateDir(dir){fs.mkdirSync(dir,{recursive:true,mode:0o700});if(fs.statSync(dir).mode&0o077)throw Error('PRIVATE_DIRECTORY_REQUIRED');}
export function savePrivate(file,data){fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n',{mode:0o600});fs.chmodSync(file,0o600);}
export class Ledger{
 constructor(dir,{resume=false}={}){
  privateDir(dir);this.file=path.join(dir,'attempts.jsonl');this.lock=path.join(dir,'active.lock');
  this.fd=fs.openSync(this.lock,'wx',0o600);fs.writeSync(this.fd,String(process.pid));fs.fsyncSync(this.fd);
  try{
   if(!resume&&fs.existsSync(this.file))throw Error('EXISTING_RUN_DO_NOT_RESTART');
   this.entries=resume?fs.readFileSync(this.file,'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)):[];
   for(let i=0;i<this.entries.length;i++)if(this.entries[i].n!==i+1)throw Error('INVALID_LEDGER');
   if(resume&&(!this.entries.length||this.entries[0].id!=='historical-health-20261107'))throw Error('INVALID_LEDGER');
   if(this.entries.length>50)throw Error('INVALID_LEDGER');
   this.seen=new Set(this.entries.map(x=>x.id));
   if(!resume)this.append({id:'historical-health-20261107',kind:'historical',phase:'audit',note:'already sent; not resent here'});
  }catch(e){this.close();throw e;}
 }
 get count(){return this.entries.length;}
 append(entry){const row={...entry,n:this.count+1};const fd=fs.openSync(this.file,'a',0o600);try{fs.writeSync(fd,JSON.stringify(row)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}this.entries.push(row);return row;}
 before({id,kind,phase='normal',method,route}){
  if(this.count>=50)throw Error('HARD_CAP_50');
  if(phase==='normal'&&this.count>=39)throw Error('NORMAL_PLAN_COMPLETE_CLEANUP_RESERVED');
  if(this.seen.has(id))throw Error('NO_RETRY_OR_DUPLICATE_INTENT');
  if(!['normal','cleanup','recovery'].includes(phase))throw Error('INVALID_PHASE');
  const allowed={health:['GET','/health'],project:['POST','/projects/register'],info:['GET','/v1/project'],issuer:['POST','/v1/issuers/register'],event:['POST','/v1/authority/events'],verify:['POST','/v1/authority/verify'],revoke:['POST','/v1/issuers/revoke'],list:['GET','/v1/issuers']};
  if(!allowed[kind]||allowed[kind][0]!==method||allowed[kind][1]!==route)throw Error('ROUTE_NOT_IN_PLAN');
  if(phase!=='normal'&&!['revoke','list','info'].includes(kind))throw Error('CLEANUP_ROUTES_ONLY');
  const row=this.append({id,kind,phase,method,route});this.seen.add(id);return row.n;
 }
 close(){if(this.fd!==null){fs.closeSync(this.fd);fs.unlinkSync(this.lock);this.fd=null;}}
}
export function makeKeys(){const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});return {privateKey,publicJwk:{...publicKey.export({format:'jwk'}),kid:'kid-'+randomUUID(),alg:'ES256'}};}
export function signedEvent({keys,issuer,audience,edgeId,principal,actor,status,sequence,validUntil,now}){
 const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
 const payload={iss:issuer,aud:audience,iat:Math.floor(now/1000),jti:randomUUID(),events:{[EVENT_TYPE]:{edge_id:edgeId,issuer_principal:principal,subject_principal:actor,status,sequence,event_timestamp:new Date(now).toISOString(),...(status==='ACTIVE'?{valid_until:new Date(validUntil).toISOString()}: {})}}};
 const input=enc({alg:'ES256',kid:keys.publicJwk.kid})+'.'+enc(payload);
 return input+'.'+sign('sha256',Buffer.from(input),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
}
const allowedReasons=new Set(['all_authority_paths_revoked_or_invalid','upstream_authority_revoked','authority_lease_expired','authority_status_unknown','authority_store_unavailable','canonical_snapshot_stale','authority_issuer_revoked']);
export function sanitizeDecision(d){
 const str=v=>typeof v==='string'&&v.length<90?v:null;
 const finite=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
 return {decision:['ALLOW','DENY'].includes(d?.decision)?d.decision:null,authority:['VALID','INVALID','UNKNOWN'].includes(d?.authority)?d.authority:null,reason:allowedReasons.has(d?.reason)?d.reason:null,reasonCapture:typeof d?.reason==='string'?(allowedReasons.has(d.reason)?'recorded':'redacted'):'absent',reasonDigest:typeof d?.reason==='string'?sha(d.reason):null,
  freshness:{source:d?.freshness?.source==='canonical-primary'?'canonical-primary':null,isPrimary:typeof d?.freshness?.isPrimary==='boolean'?d.freshness.isPrimary:null,snapshotAt:typeof d?.freshness?.snapshotAt==='string'&&/^\d{4}-\d\d-\d\dT[0-9:.]+Z$/.test(d.freshness.snapshotAt)?d.freshness.snapshotAt:null,snapshotAgeMs:finite(d?.freshness?.snapshotAgeMs),effectiveSnapshotLimitMs:finite(d?.freshness?.effectiveSnapshotLimitMs)},
  paths:Array.isArray(d?.paths)?d.paths.map(p=>({status:['VALID','INVALID','UNKNOWN'].includes(p.status)?p.status:null,reason:allowedReasons.has(p.reason)?p.reason:null,edgeIds:Array.isArray(p.edgeIds)?p.edgeIds.filter(x=>typeof x==='string'&&/^lra-[a-f0-9-]+-LRA-\d\d-g[12]$/.test(x)):[]})):[]};
}
export function expectedAt(caseId,offset){
 if(caseId==='LRA-04')return {authority:null,decision:'DENY',coverage:'PASS',reasonPolicy:'observed_not_imposed'};
 if(caseId==='LRA-06')return {authority:'VALID',decision:'ALLOW',coverage:'PARTIAL'};
 if(caseId==='LRA-02'&&offset>=10000)return {authority:'INVALID',decision:'DENY',reason:'all_authority_paths_revoked_or_invalid',pathReason:'upstream_authority_revoked',coverage:'PASS'};
 if(caseId==='LRA-08'&&offset>=10000)return {authority:'INVALID',decision:'DENY',coverage:caseId==='LRA-08'?'PARTIAL':'PASS'};
 if(caseId==='LRA-10'&&offset>=120000)return {authority:'UNKNOWN',decision:'DENY',reason:'authority_lease_expired',coverage:'PASS'};
 return {authority:'VALID',decision:'ALLOW',coverage:caseId==='LRA-08'?'PARTIAL':'PASS'};
}
export function matchesExpected(expected,observed){return (expected.authority===null||observed.authority===expected.authority)&&observed.decision===expected.decision&&(!expected.reason||observed.reason===expected.reason)&&(!expected.pathReason||observed.paths?.some(p=>p.reason===expected.pathReason));}
export function caseFits({now,start,plan,casePlan}){return now+plan.caseLeadMs+Math.max(...casePlan.timeline.map(x=>x.at_ms))+plan.requestTimeoutMs<=start+plan.cleanupStartsByMs;}
export function checkAuthorization(auth,planBytes,mappingBytes,now){
 if(auth.executionAuthorized!==true)throw Error('HOSTED_NOT_AUTHORIZED');
 if(auth.owner!=='Jérôme'||auth.planSha256!==sha(planBytes))throw Error('PLAN_NOT_APPROVED');
 if(!auth.mappingReviewed||auth.mappingSha256!==sha(mappingBytes))throw Error('MAPPING_NOT_APPROVED');
 if(!auth.newMappingProvided&&!auth.revision2PlusConfirmationAccepted)throw Error('MAPPING_REVISION_UNRESOLVED');
 if(!auth.recoveryLocalSecretFile0600Accepted||!auth.operatorIsTester)throw Error('TESTER_RECOVERY_NOT_APPROVED');
 if(!['full','reduced'].includes(auth.profile))throw Error('PROFILE_NOT_APPROVED');
 const start=Date.parse(auth.approvedStart),end=Date.parse(auth.approvedEnd),plan=JSON.parse(planBytes);
 if(start!==Date.parse(plan.scheduledStart))throw Error('SCHEDULE_NOT_APPROVED');
 if(!Number.isFinite(start)||!Number.isFinite(end)||end-start!==900000||now<start||now>=end)throw Error('OUTSIDE_APPROVED_WINDOW');
 if(auth.serviceDeploymentVersion!==7||auth.serviceSourceSha256!=='fe62affe88b93f2d7bf57264c964d8a6be94e7856164f68a94456243cb72e985'||auth.serviceRecheckedOn!=='2026-11-12')throw Error('SERVICE_RECHECK_REQUIRED');
 if(auth.profile==='full'&&now-start>15000)throw Error('FULL_RUN_START_TOO_LATE');
 if(auth.runnerAttribution!=='vector-author')throw Error('RUNNER_ATTRIBUTION_NOT_APPROVED');
 return {start,end};
}
