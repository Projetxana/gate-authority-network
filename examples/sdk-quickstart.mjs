import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { GateClient } from '../packages/sdk/dist/index.js';
import { postJson } from '../src/http-json.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const eventType='https://gate.example/events/authority-edge-state';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?reject(e):resolve(p))})})}
function startService(relative,env={}){const child=spawn(process.execPath,[path.join(root,relative)],{cwd:root,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});child.stderr.on('data',d=>process.stderr.write(`[${relative}] ${d}`));return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`${relative} did not become ready`)),7000);child.stdout.on('data',d=>{for(const line of d.toString().split(/\r?\n/)){if(!line.trim())continue;try{const msg=JSON.parse(line);if(msg.ready&&msg.url){clearTimeout(timer);resolve({child,url:msg.url,...msg});return}}catch{}}});child.on('exit',code=>{clearTimeout(timer);reject(new Error(`${relative} exited ${code}`))})})}
async function stop(s){if(!s?.child||s.child.killed)return;s.child.kill('SIGTERM');await sleep(30)}
async function waitRevision(edgeUrl,min){const end=Date.now()+3000;while(Date.now()<end){const r=await fetch(`${edgeUrl}/v1/replica/status`);const s=await r.json();if(s.revision>=min&&s.fresh)return s;await sleep(20)}throw new Error(`edge did not reach revision ${min}`)}

const ports={};for(const k of ['trust','control','principal','a','b','edge'])ports[k]=await freePort();
const u=Object.fromEntries(Object.entries(ports).map(([k,v])=>[k,`http://127.0.0.1:${v}`]));
const members={
  [u.principal]:{principal_patterns:['user:*'],events_supported:[eventType]},
  [u.a]:{principal_patterns:['agent:*@company-a'],events_supported:[eventType]},
  [u.b]:{principal_patterns:['agent:*@company-b'],events_supported:[eventType]}
};
let trust,control,principal,txA,txB,edge;
try {
  trust=await startService('services/trust-anchor.mjs',{PORT:String(ports.trust),FEDERATION_MEMBERS_JSON:JSON.stringify(members)});
  control=await startService('services/gate-control-plane.mjs',{PORT:String(ports.control),TRUST_ANCHOR_URL:u.trust,LEASE_TTL_MS:'3000'});
  principal=await startService('services/authority-transmitter.mjs',{PORT:String(ports.principal),AUTHORITY_DOMAIN:'principal',GATE_CONTROL_PLANE_URL:u.control});
  txA=await startService('services/authority-transmitter.mjs',{PORT:String(ports.a),AUTHORITY_DOMAIN:'company-a',GATE_CONTROL_PLANE_URL:u.control});
  txB=await startService('services/authority-transmitter.mjs',{PORT:String(ports.b),AUTHORITY_DOMAIN:'company-b',GATE_CONTROL_PLANE_URL:u.control});
  edge=await startService('services/gate-edge.mjs',{PORT:String(ports.edge),CONTROL_PLANE_URL:u.control,GATE_REGION:'dev-preview',REPLICA_POLL_MS:'25',DEFAULT_MAX_STALENESS_MS:'500'});

  await postJson(`${principal.url}/demo/emit`,{edgeId:'edge-human-agent-a',status:'ACTIVE'});
  await postJson(`${principal.url}/demo/emit`,{edgeId:'edge-human-agent-b',status:'ACTIVE'});
  await postJson(`${txA.url}/demo/emit`,{edgeId:'edge-agent-a-agent-c',status:'ACTIVE'});
  await postJson(`${txB.url}/demo/emit`,{edgeId:'edge-agent-b-agent-c',status:'ACTIVE'});
  await waitRevision(edge.url,4);

  const gate=new GateClient({endpoint:edge.url,timeoutMs:1500});
  const req={
    principal:'user:jerome',
    actor:'agent:C@company-c',
    action:{protocol:'mcp',name:'delete_customer_data',resource:'customer:3456'},
    consistency:'bounded',
    maxStalenessMs:500
  };

  console.log('\n=== GATE DEVELOPER PREVIEW ===');
  console.log('SDK call: gate.verify({ principal, actor, action })');
  console.log('\n1) Two live authority paths');
  console.log(JSON.stringify(await gate.verify(req),null,2));

  await postJson(`${principal.url}/demo/emit`,{edgeId:'edge-human-agent-a',status:'REVOKED'});
  await waitRevision(edge.url,5);
  console.log('\n2) Path A revoked; alternate path B remains');
  console.log(JSON.stringify(await gate.verify(req),null,2));

  await postJson(`${principal.url}/demo/emit`,{edgeId:'edge-human-agent-b',status:'REVOKED'});
  await waitRevision(edge.url,6);
  console.log('\n3) Last root path revoked; same SDK call now denies');
  console.log(JSON.stringify(await gate.verify(req),null,2));

  console.log('\nImportant: GATE verified live authority. Business-policy authorization remains the job of AuthZEN/Cedar/OPA/Permit/Cerbos/etc.');
} finally {
  await stop(edge); await stop(txB); await stop(txA); await stop(principal); await stop(control); await stop(trust);
}
