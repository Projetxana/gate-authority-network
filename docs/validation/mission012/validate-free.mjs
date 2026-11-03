import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {McpServer} from '@modelcontextprotocol/server';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import {GateClient} from '@gate-avn/sdk';
import {createMcpEffectGuard,createVerifiedEffectCounter} from '@gate-avn/mcp/effect-boundary';

const BASE='https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-network';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const EVENT='urn:gate:event:authority-edge-state:v1';
const report={startedAt:new Date().toISOString(),packages:{mcp:'0.1.0-dev.9',sdk:'0.1.0-dev.4'},consistency:'bounded',checks:[],cleanup:{status:'NOT_REQUIRED'}};
function check(name,details){report.checks.push({name,status:'PASS',...details});console.log('PASS',name,JSON.stringify(details));}
function safeFailure(error){return /^(HTTP|NETWORK|BAD_JSON|MCP_TIMEOUT|MCP_EXIT|CHECK_FAILED)/.test(error.message||'')?error.message:'CHECK_FAILED';}
async function api(route,method='GET',body,key){
 let response;
 try {response=await fetch(BASE+route,{method,redirect:'error',headers:{...(key?{authorization:`Bearer ${key}`} :{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});}
 catch {throw new Error(`NETWORK ${route}`);}
 let data;try{data=await response.json();}catch{throw new Error(`BAD_JSON ${route} HTTP ${response.status}`);}
 if(!response.ok||data?.ok===false)throw new Error(`HTTP ${response.status} ${route}`);
 return data;
}
const markerCount=filename=>fs.existsSync(filename)?fs.readFileSync(filename,'utf8').trim().split('\n').filter(Boolean).length:0;

async function server(){
 // Fresh test credential crosses a private inherited pipe, never argv, env or disk.
 const config=JSON.parse(fs.readFileSync(3,'utf8'));
 let requests=0;
 const fixture=http.createServer((req,res)=>{
  requests++;
  if(req.url.startsWith('/disconnect'))return req.socket.destroy();
  if(req.url.startsWith('/timeout'))return;
  if(req.url.startsWith('/malformed')){res.writeHead(200);res.end('not-json');return;}
  res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"fixture_unavailable"}');
 });
 await new Promise((resolve,reject)=>{fixture.once('error',reject);fixture.listen(0,'127.0.0.1',resolve);});
 const counter=createVerifiedEffectCounter();
 const gate=new GateClient({endpoint:BASE,apiKey:config.key,source:'mcp',clientVersion:'0.1.0-dev.9',timeoutMs:5000,fetchImpl:(url,options)=>fetch(url,{...options,redirect:'error'})});
 const guards={live:createMcpEffectGuard({gate,principal:config.principal,actor:config.actor,consistency:'bounded',counter})};
 guards.unknown=createMcpEffectGuard({gate:{verify:async()=>({authority:'UNKNOWN',decision:'DENY',reason:'local_unknown_fixture'})},principal:config.principal,actor:config.actor,consistency:'bounded'});
 for(const kind of ['http','disconnect','timeout','malformed']){
  const client=new GateClient({endpoint:`http://127.0.0.1:${fixture.address().port}/${kind}`,timeoutMs:250});
  guards[kind]=createMcpEffectGuard({gate:client,principal:config.principal,actor:config.actor,consistency:'bounded'});
 }
 const mcp=new McpServer({name:'gate-free-disposable-validation',version:'1.0.0'});
 for(const [kind,guard] of Object.entries(guards)){
  if(kind==='live'&&!config.key)continue;
  mcp.registerTool(kind==='live'?'write_marker':`probe_${kind}`,{
   description:'Disposable QA only; identities and policy are fixed by the test server.',inputSchema:z.object({}),
   annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}
  },async()=>{
   const before=markerCount(config.marker),beforeRequests=requests;
   try{
    const result=await guard.enforceToolCall({toolName:kind==='live'?'write_marker':`probe_${kind}`,resource:'local:disposable-marker'},async()=>{fs.appendFileSync(config.marker,'authorized-test-effect\n',{mode:0o600});return true;});
    return {content:[{type:'text',text:JSON.stringify({executed:true,authority:result.decision.authority,decision:result.decision.decision,effects:markerCount(config.marker),counter:counter.snapshot(),fixtureRequests:requests-beforeRequests})}]};
   }catch(error){
    const authority=error?.decision?.authority??'UNKNOWN';
    const decision=error?.decision?.decision==='DENY'?'DENY':'DENY';
    const reason=error?.code==='GATE_AUTHORITY_DENIED'?'GATE_AUTHORITY_DENIED':kind==='timeout'?'TIMEOUT':kind==='malformed'?'MALFORMED_JSON':kind==='disconnect'?'DISCONNECT':'HTTP_OR_NETWORK_ERROR';
    return {isError:true,content:[{type:'text',text:JSON.stringify({executed:false,authority,decision,reason,effects:markerCount(config.marker),delta:markerCount(config.marker)-before,counter:counter.snapshot(),fixtureRequests:requests-beforeRequests})}]};
   }
  });
 }
 process.stdin.on('end',()=>{fixture.closeAllConnections();fixture.close();});
 await serveStdio(()=>mcp);
}

async function session(config){
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!(/TOKEN|SECRET|PASSWORD|API_KEY/.test(k.toUpperCase())||/^(GATE_|NPM_|NODE_)/i.test(k))));
 const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--server'],{env,stdio:['pipe','pipe','pipe','pipe']});
 child.stdio[3].end(JSON.stringify(config));
 // stderr is deliberately never printed: it must not expose remote data.
 child.stderr.resume();let buffer='',id=0;const pending=new Map();
 child.stdout.on('data',chunk=>{buffer+=chunk;while(buffer.includes('\n')){const pos=buffer.indexOf('\n'),line=buffer.slice(0,pos);buffer=buffer.slice(pos+1);try{const message=JSON.parse(line);if(pending.has(message.id)){const task=pending.get(message.id);pending.delete(message.id);clearTimeout(task.timer);message.error?task.reject(new Error('CHECK_FAILED MCP_PROTOCOL')):task.resolve(message.result);}}catch{}}});
 child.on('exit',()=>{for(const task of pending.values()){clearTimeout(task.timer);task.reject(new Error('MCP_EXIT'));}pending.clear();});
 function request(method,params){return new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(new Error('MCP_TIMEOUT'));},20000);pending.set(n,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params})+'\n');});}
 await request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'mission012',version:'1.0.0'}});
 child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
 return {async call(name){const reply=await request('tools/call',{name,arguments:{}});const body=JSON.parse(reply.content.find(x=>x.type==='text').text);return {isError:reply.isError===true,...body};},async close(){child.stdin.end();await new Promise(resolve=>{const t=setTimeout(()=>{child.kill();resolve();},3000);child.once('exit',()=>{clearTimeout(t);resolve();});});}};
}

function signEvent(key,issuer,kid,project,principal,actor,status,sequence,edgeId){
 const now=new Date();const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const header=encode({alg:'ES256',typ:'secevent+jwt',kid});
 const payload=encode({iss:issuer,aud:`urn:gate:project:${project}`,iat:Math.floor(now.getTime()/1000),jti:crypto.randomUUID(),events:{[EVENT]:{edge_id:edgeId,issuer_principal:principal,subject_principal:actor,status,sequence,event_timestamp:now.toISOString(),...(status==='ACTIVE'?{valid_until:new Date(now.getTime()+120000).toISOString()}:{})}}});
 return `${header}.${payload}.${crypto.sign('sha256',Buffer.from(`${header}.${payload}`),{key,dsaEncoding:'ieee-p1363'}).toString('base64url')}`;
}

async function main(){
 for(const [name,version] of [['mcp','0.1.0-dev.9'],['sdk','0.1.0-dev.4']])assert.equal(JSON.parse(fs.readFileSync(path.join(HERE,'node_modules/@gate-avn',name,'package.json'))).version,version);
 const id=crypto.randomUUID();const principal=`user:mission012:${id}`,actor=`agent:mission012:${id}`;
 const marker=path.join(HERE,'disposable-effect.log');assert.equal(fs.existsSync(marker),false,'Use a fresh directory for each run');
 const local=await session({principal,actor,marker});
 try{for(const mode of ['unknown','http','disconnect','timeout','malformed']){
  const outcome=await local.call(`probe_${mode}`);assert.equal(outcome.isError,true);assert.equal(outcome.executed,false);assert.equal(outcome.decision,'DENY');assert.equal(outcome.authority,'UNKNOWN');assert.equal(outcome.effects,0);assert.equal(outcome.delta,0);if(mode!=='unknown')assert.equal(outcome.fixtureRequests,1);
  check(`local_${mode}_fail_closed`,{authority:outcome.authority,decision:outcome.decision,effects:outcome.effects,reason:outcome.reason,fixtureRequests:outcome.fixtureRequests,scope:'local fixture, not hosted GATE'});
 }}finally{await local.close();}
 if(!process.argv.includes('--create-disposable-project'))throw new Error('CHECK_FAILED explicit --create-disposable-project required');
 let key,projectId,attempted=false,live;
 const issuer=`urn:gate:mission012:${id}`,kid=`mission012-${id}`,edgeId=`edge:mission012:${id}`;
 try{
  const created=await api('/projects/register','POST',{name:`Disposable Mission012 ${id.slice(0,8)}`});
  key=created.apiKey;projectId=created.project?.id;assert.match(key??'',/^gate_sk_/);assert.ok(projectId);
  const project=await api('/v1/project','GET',undefined,key);assert.equal(project.plan,'free');assert.equal(project.activeIssuers,0);assert.equal(project.projectId,projectId);
  report.projectFingerprint=crypto.createHash('sha256').update(projectId).digest('hex').slice(0,16);
  check('new_disposable_free_project',{plan:project.plan,activeIssuers:project.activeIssuers,fingerprint:report.projectFingerprint});
  const {publicKey,privateKey}=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});
  const publicJwk={...publicKey.export({format:'jwk'}),alg:'ES256',use:'sig',kid};
  live=await session({key,principal,actor,marker});
  async function expected(label,allow,effects){
   const r=await live.call('write_marker');assert.equal(r.executed,allow);assert.equal(r.isError,!allow);assert.equal(r.decision,allow?'ALLOW':'DENY');if(allow)assert.equal(r.authority,'VALID');assert.equal(r.effects,effects);assert.equal(markerCount(marker),effects);
   check(label,{authority:r.authority,decision:r.decision,effects:r.effects,counter:{total:r.counter.total,allow:r.counter.allow,deny:r.counter.deny},scope:'real MCP tools/call and hosted Free GATE'});return r;
  }
  await expected('hosted_before_grant',false,0);
  attempted=true;report.cleanup={status:'REQUIRED',issuer,keyId:kid};
  await api('/v1/issuers/register','POST',{issuer,publicJwk,principalPatterns:[principal]},key);check('es256_public_issuer_registered',{scope:'new disposable project only'});
  await api('/v1/authority/events','POST',{set:signEvent(privateKey,issuer,kid,projectId,principal,actor,'ACTIVE',1,edgeId)},key);check('signed_active_accepted',{});
  await expected('hosted_after_signed_grant',true,1);
  await api('/v1/authority/events','POST',{set:signEvent(privateKey,issuer,kid,projectId,principal,actor,'REVOKED',2,edgeId)},key);check('signed_revocation_accepted',{});
  const final=await expected('hosted_after_signed_revocation',false,1);assert.equal(final.counter.total,3);assert.equal(final.counter.allow,1);assert.equal(final.counter.deny,2);
 }finally{
  if(live)await live.close();
  if(attempted){
   // Bounded retries only against this run's own issuer, including uncertain POST outcomes.
   let done=false;
   for(let n=0;n<3&&!done;n++)try{
    await api('/v1/issuers/revoke','POST',{issuer,keyId:kid},key);
    const after=await api('/v1/project','GET',undefined,key);assert.equal(after.activeIssuers,0);
    report.cleanup={status:'PASS',issuer,keyId:kid,activeIssuers:after.activeIssuers};check('issuer_trust_revoked_and_verified',{activeIssuers:0});done=true;
   }catch{}
   if(!done){report.cleanup.status='FAIL';throw new Error('CHECK_FAILED issuer_cleanup');}
  }
  key=undefined;
 }
 report.status='PASS';
}

if(process.argv.includes('--server')){
 server().catch(()=>process.exit(1));
}else{
 main().catch(error=>{report.status='FAIL';report.failure=safeFailure(error);console.error('FAIL',report.failure);process.exitCode=1;}).finally(()=>{
  report.finishedAt=new Date().toISOString();report.limits=['Local UNKNOWN and network faults are controlled fixtures, not hosted UNKNOWN evidence.','Controlled local issuer, not independent third-party authority.','Only one disposable local marker; no business effect.','Project records and metered usage remain; issuer trust is revoked, project deletion is not implemented.'];
  fs.writeFileSync(path.join(HERE,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log('REPORT',path.join(HERE,'report.json'));
 });
}
