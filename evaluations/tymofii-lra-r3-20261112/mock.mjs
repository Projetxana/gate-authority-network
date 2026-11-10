import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
export function fixture({latencyMs=5,failKind=null,cleanupUncertain=false,unjustifiedAllow=false}={}){
 let time=Date.parse('2026-11-12T19:00:00Z'),handler;
 const clock={now:()=>time,until:async target=>{time=Math.max(time,target);},advance:ms=>time+=ms};
 class Clock extends Date{constructor(...a){super(...(a.length?a:[time]));}static now(){return time;}}
 const state={issuer:null,edges:new Map(),calls:0,verifyReads:0};
 const projectId='00000000-0000-4000-8000-000000000001';
 const ctx=vm.createContext({Date:Clock,Request,Response,URL,TextEncoder,TextDecoder,atob,AbortSignal,performance,crypto:webcrypto,console:{error(){}},fetch:()=>{throw Error('REAL_NETWORK_FORBIDDEN');},Deno:{env:{get:n=>n==='SUPABASE_URL'?'https://fixture.invalid':'synthetic-unused'},serve:h=>handler=h}});
 const code=fs.readFileSync(new URL('./evidence/deployed-v7.ts',import.meta.url),'utf8');vm.runInContext(code,ctx);
 ctx.mockAuth=async()=>({projectId,apiKeyId:'test-key',plan:'free'});
 ctx.mockEnt=async()=>({current_month_usage:0,monthly_verification_limit:50000,overage_enabled:false,allow_strict:false});
 ctx.mockTrust=async()=>state.issuer?[{id:'issuer-test',status:state.issuer.status}]:[];
 ctx.mockRest=async(route,init)=>{
  if(route.startsWith('gate_authority_issuers?'))return state.issuer?.status==='active'?[state.issuer]:[];
  if(route==='rpc/gate_ingest_authority_event_v2'){
   const b=JSON.parse(init.body),existing=state.edges.get(b.p_edge_id);if(existing&&existing.sequence>=b.p_sequence)throw Error('stale_authority_event');
   const row={edge_id:b.p_edge_id,issuer:b.p_issuer_principal,subject:b.p_subject_principal,status:b.p_status,sequence:b.p_sequence,authority_issuer_id:'issuer-test',updated_at:b.p_event_timestamp,valid_until:b.p_valid_until};state.edges.set(row.edge_id,row);return [row];
  }
  if(route==='rpc/gate_authority_snapshot_v1'){state.verifyReads++;return [{snapshot_at:new Date(time).toISOString(),source:'canonical-primary',is_primary:true,authority_edges:[...state.edges.values()],issuer_trust_states:await ctx.mockTrust()}];}
  if(route==='rpc/gate_record_metered_verification')return [{allowed:true,plan:'free',current_month_usage:state.verifyReads,monthly_limit:50000}];
  throw Error('UNEXPECTED_MOCK_DB_ROUTE');
 };
 vm.runInContext('auth=mockAuth;ent=mockEnt;issuerTrustStates=mockTrust;rest=mockRest',ctx);const api=vm.runInContext('({verify,ingest})',ctx);
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
 const send=async(url,init)=>{
  state.calls++;time+=latencyMs;const route=new URL(url).pathname.split('/gate-network')[1];
  if(failKind===route)throw Error('SYNTHETIC_TIMEOUT');
  const b=init.body?JSON.parse(init.body):null;
  if(route==='/health')return json({service:'gate-network'});
  if(route==='/projects/register')return json({project:{id:projectId,plan:'free'},apiKey:'synthetic-not-real',endpoint:'https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-network',audience:'urn:gate:project:'+projectId,eventType:'urn:gate:event:authority-edge-state:v1'},201);
  if(route==='/v1/project')return json({plan:'free',activeIssuers:state.issuer?.status==='active'?1:0,usage:{included:50000},entitlements:{max_issuers:1,allow_strict:false}});
  if(route==='/v1/issuers/register'){state.issuer={id:'issuer-test',issuer:b.issuer,key_id:b.publicJwk.kid,public_jwk:b.publicJwk,principal_patterns:b.principalPatterns,status:'active'};return json({ok:true},201);}
  if(route==='/v1/issuers/revoke'){if(!cleanupUncertain)state.issuer.status='revoked';return json({ok:true});}
  if(route==='/v1/issuers')return json({issuers:[{issuer:state.issuer.issuer,key_id:state.issuer.key_id,status:state.issuer.status,effectiveStatus:state.issuer.status}]});
  if(route==='/v1/authority/events')return api.ingest(new Request(url,init));
  if(route==='/v1/authority/verify'){if(unjustifiedAllow)return json({authority:'VALID',decision:'ALLOW',selectedEdges:[],freshness:{snapshotAt:new Date(time).toISOString(),snapshotAgeMs:0,effectiveSnapshotLimitMs:5000}});return api.verify(new Request(url,init));}
  throw Error('UNPLANNED_MOCK_ROUTE');
 };
 return {clock,send,state};
}
