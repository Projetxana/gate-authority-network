import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { postJson, requestJson, pushSet } from '../../src/http-json.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');

async function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?reject(e):resolve(p))})})}
function startService(relative,env={}){const child=spawn(process.execPath,[path.join(root,relative)],{cwd:root,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});child.stderr.on('data',d=>process.stderr.write(`[${relative}] ${d}`));return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`${relative} did not become ready`)),7000);child.stdout.on('data',d=>{for(const line of d.toString().split(/\r?\n/)){if(!line.trim())continue;try{const msg=JSON.parse(line);if(msg.ready&&msg.url){clearTimeout(timer);resolve({child,url:msg.url,...msg});return}}catch{}}});child.on('exit',code=>{clearTimeout(timer);reject(new Error(`${relative} exited ${code}`))})})}
async function stop(s){if(!s?.child||s.child.killed)return;s.child.kill('SIGTERM');await new Promise(r=>setTimeout(r,40))}
async function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

async function buildNetwork({sourceLeaseTtlMs=300,sourcePollMs=25}={}){
  const names=['trust','control','principal','a','b'];const ports={};for(const name of names)ports[name]=await freePort();
  const u=Object.fromEntries(Object.entries(ports).map(([k,v])=>[k,`http://127.0.0.1:${v}`]));
  const eventType='https://gate.example/events/authority-edge-state';
  const members={
    [u.principal]:{principal_patterns:['user:*'],events_supported:[eventType]},
    [u.a]:{principal_patterns:['agent:*@company-a'],events_supported:[eventType]},
    [u.b]:{principal_patterns:['agent:*@company-b'],events_supported:[eventType]}
  };
  const trust=await startService('services/trust-anchor.mjs',{PORT:String(ports.trust),FEDERATION_MEMBERS_JSON:JSON.stringify(members)});
  const control=await startService('services/gate-control-plane.mjs',{PORT:String(ports.control),TRUST_ANCHOR_URL:u.trust,LEASE_TTL_MS:'1000',SOURCE_POLL_MS:String(sourcePollMs)});
  const principal=await startService('services/authority-transmitter.mjs',{PORT:String(ports.principal),AUTHORITY_DOMAIN:'principal',GATE_CONTROL_PLANE_URL:u.control,SOURCE_LEASE_TTL_MS:String(sourceLeaseTtlMs)});
  const txA=await startService('services/authority-transmitter.mjs',{PORT:String(ports.a),AUTHORITY_DOMAIN:'company-a',GATE_CONTROL_PLANE_URL:u.control,SOURCE_LEASE_TTL_MS:String(sourceLeaseTtlMs)});
  const txB=await startService('services/authority-transmitter.mjs',{PORT:String(ports.b),AUTHORITY_DOMAIN:'company-b',GATE_CONTROL_PLANE_URL:u.control,SOURCE_LEASE_TTL_MS:String(sourceLeaseTtlMs)});
  return{u,trust,control,principal,txA,txB};
}

async function seedTwoPaths(n){
  await postJson(`${n.principal.url}/demo/emit`,{edgeId:'edge-human-agent-a',status:'ACTIVE'});
  await postJson(`${n.principal.url}/demo/emit`,{edgeId:'edge-human-agent-b',status:'ACTIVE'});
  await postJson(`${n.txA.url}/demo/emit`,{edgeId:'edge-agent-a-agent-c',status:'ACTIVE'});
  await postJson(`${n.txB.url}/demo/emit`,{edgeId:'edge-agent-b-agent-c',status:'ACTIVE'});
}

async function verify(n){return postJson(`${n.control.url}/v1/authority/verify`,{principal:'user:jerome',actor:'agent:C@company-c'})}

test('issuer-plane revoke withheld from GATE is detected by issuer-derived checkpoint freshness',async()=>{
  const n=await buildNetwork();
  try{
    await seedTwoPaths(n);
    const w1=await verify(n);
    assert.equal(w1.decision,'ALLOW');
    assert.equal(w1.validPathCount,2);
    assert.equal(w1.freshnessLane,'issuer-derived');
    assert.ok(w1.sourceFreshness.every(x=>x.freshness==='FRESH'));

    const before=await requestJson(`${n.control.url}/v1/authority/state`);
    const signed=await postJson(`${n.principal.url}/demo/sign-only`,{edgeId:'edge-human-agent-a',status:'REVOKED',reason:'withheld_from_gate'});

    // W2: issuer state advanced, but the revocation event itself is deliberately withheld.
    // The local graph must remain byte-for-byte equivalent in authority status.
    const afterSignOnly=await requestJson(`${n.control.url}/v1/authority/state`);
    assert.deepEqual(afterSignOnly.edges,before.edges);

    const w2=await verify(n);
    assert.equal(w2.decision,'DENY');
    assert.equal(w2.authority,'UNKNOWN');
    assert.equal(w2.freshnessLane,'issuer-derived');
    assert.ok(w2.sourceFreshness.some(x=>x.source===n.principal.url&&x.freshness==='STALE'&&x.lastSeq>x.acceptedSeq));
    assert.ok(w2.paths.every(p=>p.status==='UNKNOWN'));

    // Deliver the previously withheld event. GATE can now distinguish the two worlds.
    await pushSet(`${n.control.url}/Events`,signed.set);
    const reconciled=await verify(n);
    assert.equal(reconciled.decision,'ALLOW');
    assert.equal(reconciled.validPathCount,1);
    assert.deepEqual(reconciled.selectedPath,['user:jerome','agent:B@company-b','agent:C@company-c']);
  }finally{
    await stop(n.txB);await stop(n.txA);await stop(n.principal);await stop(n.control);await stop(n.trust);
  }
});

test('hard not_after expires authority even while issuer source is fresh',async()=>{
  const n=await buildNetwork({sourceLeaseTtlMs:1000});
  try{
    await seedTwoPaths(n);
    await postJson(`${n.principal.url}/demo/emit`,{edgeId:'edge-human-agent-a',status:'REVOKED',reason:'remove_path_a'});
    await postJson(`${n.txB.url}/demo/emit`,{edgeId:'edge-agent-b-agent-c',status:'ACTIVE',validForMs:80});
    const beforeExpiry=await verify(n);
    assert.equal(beforeExpiry.decision,'ALLOW');
    assert.equal(beforeExpiry.validPathCount,1);
    await sleep(110);
    const afterExpiry=await verify(n);
    assert.equal(afterExpiry.decision,'DENY');
    assert.equal(afterExpiry.authority,'INVALID');
    assert.ok(afterExpiry.paths.some(p=>p.reason==='delegation_hard_expired'));
  }finally{
    await stop(n.txB);await stop(n.txA);await stop(n.principal);await stop(n.control);await stop(n.trust);
  }
});

test('strict verification fails closed when issuer checkpoint cannot be refreshed',async()=>{
  const n=await buildNetwork({sourceLeaseTtlMs:150});
  try{
    await seedTwoPaths(n);
    const healthy=await verify(n);assert.equal(healthy.decision,'ALLOW');
    await stop(n.principal);
    await sleep(30);
    const disconnected=await verify(n);
    assert.equal(disconnected.decision,'DENY');
    assert.equal(disconnected.authority,'UNKNOWN');
    assert.ok(disconnected.sourceFreshness.some(x=>x.source===n.principal.url&&x.freshness==='UNKNOWN'));
  }finally{
    await stop(n.txB);await stop(n.txA);await stop(n.principal);await stop(n.control);await stop(n.trust);
  }
});

test('bounded edge carries issuer-source freshness separately from replica freshness',async()=>{
  const n=await buildNetwork({sourceLeaseTtlMs:500,sourcePollMs:20});
  let edge;
  try{
    await seedTwoPaths(n);
    edge=await startService('services/gate-edge.mjs',{CONTROL_PLANE_URL:n.control.url,GATE_REGION:'test-edge',REPLICA_POLL_MS:'20',DEFAULT_MAX_STALENESS_MS:'200'});
    await sleep(80);
    const initial=await postJson(`${edge.url}/v1/authority/verify`,{principal:'user:jerome',actor:'agent:C@company-c',consistency:'bounded',maxStalenessMs:200});
    assert.equal(initial.decision,'ALLOW');
    assert.equal(initial.replicaFreshness.scope,'gate-replica');
    assert.equal(initial.replicaFreshness.fresh,true);
    assert.ok(initial.sourceFreshness.every(x=>x.freshness==='FRESH'));

    await postJson(`${n.principal.url}/demo/sign-only`,{edgeId:'edge-human-agent-a',status:'REVOKED',reason:'withheld_from_gate'});
    await sleep(100);

    const stale=await postJson(`${edge.url}/v1/authority/verify`,{principal:'user:jerome',actor:'agent:C@company-c',consistency:'bounded',maxStalenessMs:200});
    assert.equal(stale.replicaFreshness.fresh,true);
    assert.equal(stale.decision,'DENY');
    assert.equal(stale.authority,'UNKNOWN');
    assert.ok(stale.sourceFreshness.some(x=>x.source===n.principal.url&&x.freshness==='STALE'));
  }finally{
    await stop(edge);await stop(n.txB);await stop(n.txA);await stop(n.principal);await stop(n.control);await stop(n.trust);
  }
});
