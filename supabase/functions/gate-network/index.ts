
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PUBLIC_BASE = "https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-network";
const EVENT_TYPE = "urn:gate:event:authority-edge-state:v1";
const DAILY_REGISTRATION_LIMIT = 500;
const DAILY_REGISTRATION_LIMIT_PER_IP = 3;
const ACTIVE_LEASE_MAX_MS = 15 * 60 * 1000;
const GATE_PRIMARY_REGION="ca-central-1";
const GATE_REPLICA_REGIONS=[];
const GATE_REGION_TOPOLOGY="single-primary";
const H = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, content-type, x-gate-source, x-gate-client-version",
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
  "Content-Type":"application/json"
};

function json(body,status=200){ return new Response(JSON.stringify(body),{status,headers:H}); }
async function rest(path,init={}){
  const r=await fetch(SUPABASE_URL+"/rest/v1/"+path,{
    ...init,
    headers:{
      apikey:SERVICE_ROLE_KEY,
      authorization:"Bearer "+SERVICE_ROLE_KEY,
      "content-type":"application/json",
      ...(init.headers||{})
    }
  });
  const t=await r.text();
  let d=null; try{d=t?JSON.parse(t):null}catch{d=t}
  if(!r.ok) throw new Error("supabase_"+r.status+":"+String(typeof d==="string"?d:JSON.stringify(d)));
  return d;
}
function safeText(v,max=240){
  if(typeof v!=="string") return null;
  const s=v.trim();
  return s&&s.length<=max?s:null;
}
function bearer(req){
  const m=(req.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i);
  return m?m[1]:null;
}
async function auth(req){
  const s=bearer(req); if(!s)return null;
  const rows=await rest("rpc/gate_authenticate_api_key_v2",{method:"POST",body:JSON.stringify({p_secret:s})});
  const r=Array.isArray(rows)?rows[0]:null;
  return r&&r.project_id?{projectId:r.project_id,apiKeyId:r.api_key_id,plan:r.plan}:null;
}
async function ent(projectId){
  const rows=await rest("rpc/gate_project_entitlements",{method:"POST",body:JSON.stringify({p_project_id:projectId})});
  return Array.isArray(rows)?rows[0]:null;
}
function b64u(s){
  s=s.replace(/-/g,"+").replace(/_/g,"/");
  while(s.length%4)s+="=";
  return Uint8Array.from(atob(s),c=>c.charCodeAt(0));
}
function part(s){ return JSON.parse(new TextDecoder().decode(b64u(s))); }
async function verifyJwt(token,jwk){
  const a=token.split(".");
  if(a.length!==3)throw new Error("invalid_compact_jws");
  const h=a[0],p=a[1],sig=a[2],header=part(h),payload=part(p);
  if(header.alg!=="ES256"||!header.kid)throw new Error("invalid_jws_header");
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
  const ok=await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},key,b64u(sig),new TextEncoder().encode(h+"."+p));
  if(!ok)throw new Error("invalid_signature");
  return {header,payload};
}
function glob(pattern,value){
  const re=pattern.split("*").map(x=>x.replace(/[.+?^$()|[\]\\]/g,"\\$&")).join(".*");
  return new RegExp("^"+re+"$").test(value);
}
async function sha256(s){
  const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function clientIp(req){
  return req.headers.get("cf-connecting-ip")
    || (req.headers.get("x-forwarded-for")||"").split(",")[0].trim()
    || req.headers.get("x-real-ip")
    || null;
}
async function dailyIpHash(day,ip){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(SERVICE_ROLE_KEY),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(day+"|"+ip));
  return [...new Uint8Array(sig)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function verifyGraph(principal,actor,edges,maxStalenessMs,issuerStates){
  const now=Date.now();
  const out=new Map();
  for(const e of edges){const a=out.get(e.issuer)||[];a.push(e);out.set(e.issuer,a)}
  const q=[{n:principal,nodes:[principal],es:[],seen:new Set([principal])}],paths=[];
  while(q.length){
    const c=q.shift(); if(c.es.length>=12)continue;
    for(const e of out.get(c.n)||[]){
      if(c.seen.has(e.subject))continue;
      const nodes=[...c.nodes,e.subject],es=[...c.es,e];
      if(e.subject===actor)paths.push({nodes,es});
      else{const seen=new Set(c.seen);seen.add(e.subject);q.push({n:e.subject,nodes,es,seen})}
    }
  }
  if(!paths.length)return{authority:"INVALID",decision:"DENY",reason:"no_authority_path",principal,actor,evaluatedPathCount:0,paths:[]};
  const evaluated=paths.map(({nodes,es})=>{
    const checks=es.map(e=>{
      let effectiveStatus=e.status;
      let freshnessReason=null;
      let issuerTrustReason=null;
      let ageMs=null;
      let leaseRemainingMs=null;
      const trust=issuerStates.get(String(e.authority_issuer_id||""));
      const issuerTrustStatus=trust?.status||"missing";
      if(issuerTrustStatus!=="active"){
        effectiveStatus=issuerTrustStatus==="revoked"?"REVOKED":"UNKNOWN";
        issuerTrustReason=trust?.trust_reason||(
          issuerTrustStatus==="revoked"?"authority_issuer_revoked":"authority_issuer_untrusted");
      }
      else if(e.status==="ACTIVE"){
        const updated=Date.parse(e.updated_at);
        const valid=Date.parse(e.valid_until);
        ageMs=Number.isFinite(updated)?Math.max(0,now-updated):null;
        leaseRemainingMs=Number.isFinite(valid)?valid-now:null;
        if(!Number.isFinite(valid)||valid<=now){effectiveStatus="UNKNOWN";freshnessReason="authority_lease_expired"}

      }
      return{edgeId:e.edge_id,issuer:e.issuer,subject:e.subject,authorityStatus:e.status,effectiveStatus,sequence:e.sequence,authorityIssuerId:e.authority_issuer_id,issuerTrustStatus,issuerTrustReason,ageMs,leaseRemainingMs,freshnessReason};
    });
    const status=checks.some(x=>x.effectiveStatus==="UNKNOWN")?"UNKNOWN":checks.some(x=>x.effectiveStatus==="REVOKED")?"INVALID":"VALID";
    const unknownCheck=checks.find(x=>x.effectiveStatus==="UNKNOWN");
    const reason=status==="UNKNOWN"?(unknownCheck?.issuerTrustReason||unknownCheck?.freshnessReason||"authority_status_unknown")
      :status==="INVALID"?(checks.find(x=>x.effectiveStatus==="REVOKED"&&x.issuerTrustReason)?.issuerTrustReason||"upstream_authority_revoked"):null;
    return{status,reason,nodePath:nodes,edgeIds:es.map(e=>e.edge_id),checks};
  });
  const valid=evaluated.find(p=>p.status==="VALID");
  if(valid){
    const activeChecks=valid.checks.filter(x=>x.effectiveStatus==="ACTIVE");
    const maxAgeMs=activeChecks.reduce((m,x)=>x.ageMs==null?m:Math.max(m,x.ageMs),0);
    const leaseRemainingMs=activeChecks.reduce((m,x)=>x.leaseRemainingMs==null?m:Math.min(m,x.leaseRemainingMs),Number.POSITIVE_INFINITY);
    return{authority:"VALID",decision:"ALLOW",principal,actor,selectedPath:valid.nodePath,selectedEdges:valid.edgeIds,validPathCount:evaluated.filter(p=>p.status==="VALID").length,evaluatedPathCount:evaluated.length,paths:evaluated,freshness:{ageMs:maxAgeMs,leaseRemainingMs:Number.isFinite(leaseRemainingMs)?Math.max(0,leaseRemainingMs):null,maxStalenessMs:Number.isFinite(maxStalenessMs)?maxStalenessMs:null,fresh:true}};
  }
  if(evaluated.some(p=>p.status==="UNKNOWN"))return{authority:"UNKNOWN",decision:"DENY",reason:evaluated.find(p=>p.status==="UNKNOWN")?.reason||"no_active_path_and_authority_state_unknown",principal,actor,evaluatedPathCount:evaluated.length,paths:evaluated,freshness:{fresh:false,maxStalenessMs:Number.isFinite(maxStalenessMs)?maxStalenessMs:null}};
  const reasons=evaluated.map(p=>p.reason);
  const finalReason=reasons.length&&reasons.every(r=>r===reasons[0])&&
    ["authority_issuer_revoked","federated_source_revoked","federated_export_revoked",
     "federated_source_disabled"].includes(reasons[0])
    ?reasons[0]:"all_authority_paths_revoked_or_invalid";
  return{authority:"INVALID",decision:"DENY",reason:finalReason,principal,actor,evaluatedPathCount:evaluated.length,paths:evaluated,freshness:{fresh:true,maxStalenessMs:Number.isFinite(maxStalenessMs)?maxStalenessMs:null}};
}
async function registerProject(req){
  const day=new Date().toISOString().slice(0,10);
  const all=await rest("gate_live_registrations?day=eq."+day+"&select=id");
  if(Array.isArray(all)&&all.length>=DAILY_REGISTRATION_LIMIT)return json({ok:false,error:"daily_registration_limit_reached"},429);
  const ip=clientIp(req);
  const ipHash=ip?await dailyIpHash(day,ip):null;
  if(ipHash){
    const rows=await rest("gate_live_registrations?day=eq."+day+"&ip_hash=eq."+ipHash+"&select=id");
    if(Array.isArray(rows)&&rows.length>=DAILY_REGISTRATION_LIMIT_PER_IP)return json({ok:false,error:"daily_registration_limit_per_client_reached"},429);
  }
  let b={}; try{b=await req.json()}catch{}
  const name=safeText(b&&b.name,80)||"My GATE project";
  const slug="live-"+crypto.randomUUID().replaceAll("-","").slice(0,16);
  const ps=await rest("gate_projects",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify({slug,display_name:name,plan:"free",is_internal:false})});
  const p=Array.isArray(ps)?ps[0]:null; if(!p||!p.id)throw new Error("project_create_failed");
  const ks=await rest("rpc/gate_create_api_key",{method:"POST",body:JSON.stringify({p_project_id:p.id,p_name:"default",p_expires_at:null})});
  const k=Array.isArray(ks)?ks[0]:null; if(!k||!k.api_key_secret)throw new Error("key_create_failed");
  await rest("gate_live_registrations",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({day,ip_hash:ipHash,project_id:p.id})});
  return json({ok:true,mode:"live",project:{id:p.id,name,plan:"free"},apiKey:k.api_key_secret,endpoint:PUBLIC_BASE,audience:"urn:gate:project:"+p.id,eventType:EVENT_TYPE,authorityLease:{requiredForActive:true,maxSeconds:ACTIVE_LEASE_MAX_MS/1000},limits:{monthlyVerifications:50000,maxIssuers:1,strict:false}},201);
}
async function projectInfo(req){
  const a=await auth(req); if(!a)return json({ok:false,error:"invalid_api_key"},401);
  const e=await ent(a.projectId);
  const rows=await rest("gate_authority_issuers?project_id=eq."+a.projectId+"&status=eq.active&select=id");
  return json({ok:true,projectId:a.projectId,plan:a.plan,usage:{currentMonth:Number((e&&e.current_month_usage)||0),included:Number((e&&e.monthly_verification_limit)||0)},entitlements:e,activeIssuers:Array.isArray(rows)?rows.length:0});
}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function issuerTrustStates(projectId){
  const rows=await rest("rpc/gate_issuer_trust_states",{method:"POST",
    body:JSON.stringify({p_project_id:projectId})});
  if(!Array.isArray(rows))throw new Error("issuer_trust_states_unavailable");
  return rows;
}
async function federationExportCreate(req){
  const a=await auth(req);if(!a)return json({ok:false,error:"invalid_api_key"},401);
  let b;try{b=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const issuer=safeText(b?.issuer,240),consumerProjectId=safeText(b?.consumerProjectId,40);
  if(!issuer||!consumerProjectId||!UUID.test(consumerProjectId))
    return json({ok:false,error:"issuer_and_consumer_project_id_required"},400);
  if(consumerProjectId===a.projectId)return json({ok:false,error:"distinct_projects_required"},400);
  const rows=await rest("gate_authority_issuers?project_id=eq."+a.projectId+
    "&issuer=eq."+encodeURIComponent(issuer)+"&status=eq.active&federation_export_id=is.null&select=id,key_id");
  const source=Array.isArray(rows)?rows[0]:null;
  if(!source)return json({ok:false,error:"active_local_issuer_not_found"},404);
  try{
    const data=await rest("rpc/gate_federation_export_create",{method:"POST",body:JSON.stringify({
      p_source_project_id:a.projectId,p_audience_project_id:consumerProjectId,p_source_issuer_id:source.id
    })});
    const e=Array.isArray(data)?data[0]:null;
    if(!e?.export_id)throw new Error("empty_export_result");
    return json({ok:true,export:{id:e.export_id,status:e.export_status,issuer,
      keyId:source.key_id,sourceProjectId:a.projectId,consumerProjectId}},201);
  }catch{return json({ok:false,error:"federation_export_unavailable_or_already_exists"},409)}
}
async function federationExportList(req){
  const a=await auth(req);if(!a)return json({ok:false,error:"invalid_api_key"},401);
  const rows=await rest("gate_federation_exports?source_project_id=eq."+a.projectId+
    "&select=id,source_project_id,audience_project_id,source_issuer_id,status,created_at&order=created_at.desc");
  return json({ok:true,exports:rows});
}
async function federationExportRevoke(req){
  const a=await auth(req);if(!a)return json({ok:false,error:"invalid_api_key"},401);
  let b;try{b=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const exportId=safeText(b?.exportId,40);
  if(!exportId||!UUID.test(exportId))return json({ok:false,error:"valid_export_id_required"},400);
  try{
    const rows=await rest("rpc/gate_federation_export_revoke",{method:"POST",
      body:JSON.stringify({p_source_project_id:a.projectId,p_export_id:exportId})});
    const e=Array.isArray(rows)?rows[0]:null;
    if(!e)return json({ok:false,error:"active_export_not_found"},404);
    return json({ok:true,export:{id:e.export_id,status:e.export_status}});
  }catch{return json({ok:false,error:"active_export_not_found"},404)}
}
async function federationImport(req){
  const a=await auth(req);if(!a)return json({ok:false,error:"invalid_api_key"},401);
  let b;try{b=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const exportId=safeText(b?.exportId,40);
  if(!exportId||!UUID.test(exportId))return json({ok:false,error:"valid_export_id_required"},400);
  try{
    const data=await rest("rpc/gate_federation_import",{method:"POST",body:JSON.stringify({
      p_consumer_project_id:a.projectId,p_export_id:exportId
    })});
    const i=Array.isArray(data)?data[0]:null;
    if(!i?.imported_issuer_id)throw new Error("empty_import_result");
    return json({ok:true,imported:{id:i.imported_issuer_id,issuer:i.imported_issuer,
      keyId:i.imported_key_id,sourceProjectId:i.source_project_id,exportId}},201);
  }catch{return json({ok:false,error:"federation_import_unavailable_or_limit_reached"},409)}
}
async function federationImportList(req){
  const a=await auth(req);if(!a)return json({ok:false,error:"invalid_api_key"},401);
  const [rows,trust]=await Promise.all([
    rest("gate_authority_issuers?project_id=eq."+a.projectId+
      "&federation_export_id=not.is.null&select=id,issuer,key_id,status,federation_export_id"),
    issuerTrustStates(a.projectId)
  ]);
  const state=new Map(trust.map(s=>[String(s.id),s]));
  return json({ok:true,imports:rows.map(r=>({
    id:r.id,issuer:r.issuer,keyId:r.key_id,status:r.status,
    effectiveStatus:state.get(String(r.id))?.status||"missing",
    trustReason:state.get(String(r.id))?.trust_reason||null,exportId:r.federation_export_id
  }))});
}

async function registerIssuer(req){
  const a=await auth(req); if(!a)return json({ok:false,error:"invalid_api_key"},401);
  const e=await ent(a.projectId);
  const current=await rest("gate_authority_issuers?project_id=eq."+a.projectId+"&status=eq.active&select=id");
  if(Array.isArray(current)&&current.length>=Number((e&&e.max_issuers)||0))return json({ok:false,error:"issuer_limit_reached",plan:a.plan,limit:Number((e&&e.max_issuers)||0)},403);
  let b; try{b=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const issuer=safeText(b&&b.issuer,240),jwk=b&&b.publicJwk;
  const patterns=Array.isArray(b&&b.principalPatterns)?b.principalPatterns.map(x=>safeText(x,160)).filter(Boolean):[];
  if(!issuer||!jwk||jwk.kty!=="EC"||jwk.crv!=="P-256"||!jwk.x||!jwk.y||!jwk.kid)return json({ok:false,error:"valid_es256_public_jwk_required"},400);
  if(!patterns.length)return json({ok:false,error:"principal_patterns_required"},400);
  try{await crypto.subtle.importKey("jwk",jwk,{name:"ECDSA",namedCurve:"P-256"},false,["verify"])}catch{return json({ok:false,error:"invalid_public_jwk"},400)}
  const rows=await rest("gate_authority_issuers",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify({project_id:a.projectId,issuer,key_id:jwk.kid,alg:"ES256",public_jwk:{...jwk,alg:"ES256"},principal_patterns:patterns,status:"active"})});
  const row=Array.isArray(rows)?rows[0]:null;
  return json({ok:true,issuer:{id:row&&row.id,issuer,keyId:jwk.kid,alg:"ES256",principalPatterns:patterns},audience:"urn:gate:project:"+a.projectId,eventType:EVENT_TYPE},201);
}
async function revokeIssuerTrust(req){
  const a=await auth(req); if(!a)return json({ok:false,error:"invalid_api_key"},401);
  let b; try{b=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const issuer=safeText(b?.issuer,240),keyId=safeText(b?.keyId,160);
  if(!issuer||!keyId)return json({ok:false,error:"issuer_and_key_id_required"},400);
  // This withdraws this project's trust in an issuer, not across independent tenants.
  const rows=await rest("gate_authority_issuers?project_id=eq."+a.projectId+
    "&issuer=eq."+encodeURIComponent(issuer)+"&key_id=eq."+encodeURIComponent(keyId)+"&status=eq.active",{
    method:"PATCH",headers:{prefer:"return=representation"},
    body:JSON.stringify({status:"revoked",updated_at:new Date().toISOString()})
  });
  const row=Array.isArray(rows)?rows[0]:null;
  if(!row)return json({ok:false,error:"issuer_not_active_or_not_found"},404);
  return json({ok:true,issuer:{id:row.id,issuer:row.issuer,keyId:row.key_id,status:"revoked"}});
}
async function listIssuers(req){
  const a=await auth(req); if(!a)return json({ok:false,error:"invalid_api_key"},401);
  const [rows,trust]=await Promise.all([
    rest("gate_authority_issuers?project_id=eq."+a.projectId+
      "&select=id,issuer,key_id,alg,principal_patterns,status,created_at,federation_export_id&order=created_at.asc"),
    issuerTrustStates(a.projectId)
  ]);
  const states=new Map(trust.map(x=>[String(x.id),x]));
  return json({ok:true,issuers:rows.map(i=>({
    ...i,origin:i.federation_export_id?"federated":"local",
    effectiveStatus:states.get(String(i.id))?.status||"missing",
    trustReason:states.get(String(i.id))?.trust_reason||null
  }))});
}
async function ingest(req){
  const a=await auth(req); if(!a)return json({ok:false,error:"invalid_api_key"},401);
  let token="",ct=(req.headers.get("content-type")||"").toLowerCase();
  if(ct.startsWith("application/secevent+jwt")||ct.startsWith("application/jwt"))token=(await req.text()).trim();
  else{try{const b=await req.json();token=String((b&&b.set)||(b&&b.token)||"").trim()}catch{return json({ok:false,error:"invalid_json"},400)}}
  if(!token)return json({ok:false,error:"signed_event_required"},400);
  let uh,up; try{const p=token.split(".");uh=part(p[0]);up=part(p[1])}catch{return json({ok:false,error:"invalid_compact_jws"},400)}
  const iss=safeText(up&&up.iss,240),kid=safeText(uh&&uh.kid,160); if(!iss||!kid)return json({ok:false,error:"missing_issuer_or_kid"},400);
  const rows=await rest("gate_authority_issuers?project_id=eq."+a.projectId+"&issuer=eq."+encodeURIComponent(iss)+"&key_id=eq."+encodeURIComponent(kid)+"&status=eq.active&select=*");
  const issuer=Array.isArray(rows)?rows[0]:null;
  if(!issuer)return json({ok:false,error:"untrusted_authority_issuer"},403);
  const trusted=await issuerTrustStates(a.projectId);
  if(!trusted.some(s=>s.id===issuer.id && s.status==="active"))
    return json({ok:false,error:"untrusted_authority_issuer"},403);
  let v; try{v=await verifyJwt(token,issuer.public_jwk)}catch(e){return json({ok:false,error:e instanceof Error?e.message:"signature_verification_failed"},400)}
  const payload=v.payload,expected="urn:gate:project:"+a.projectId,aud=payload&&payload.aud,okAud=Array.isArray(aud)?aud.includes(expected):aud===expected;
  if(!okAud)return json({ok:false,error:"audience_mismatch"},400);
  const now=Math.floor(Date.now()/1000),iat=Number(payload&&payload.iat); if(!Number.isFinite(iat)||Math.abs(now-iat)>600)return json({ok:false,error:"event_iat_outside_10m_window"},400);
  const jti=safeText(payload&&payload.jti,200); if(!jti)return json({ok:false,error:"event_jti_required"},400);
  const ev=payload&&payload.events&&payload.events[EVENT_TYPE]; if(!ev)return json({ok:false,error:"unsupported_event_type"},400);
  const edgeId=safeText(ev.edge_id,200),ip=safeText(ev.issuer_principal,240),sp=safeText(ev.subject_principal,240),status=String(ev.status||"").toUpperCase(),seq=Number(ev.sequence),reason=ev.reason==null?null:safeText(String(ev.reason),240),et=ev.event_timestamp?new Date(ev.event_timestamp):new Date(),validUntil=ev.valid_until?new Date(ev.valid_until):null;
  if(!edgeId||!ip||!sp)return json({ok:false,error:"edge_fields_required"},400);
  if(!["ACTIVE","REVOKED","UNKNOWN"].includes(status))return json({ok:false,error:"invalid_authority_status"},400);
  if(!Number.isInteger(seq)||seq<1)return json({ok:false,error:"invalid_event_sequence"},400);
  if(Number.isNaN(et.getTime()))return json({ok:false,error:"invalid_event_timestamp"},400);
  if(status==="ACTIVE"){
    if(!validUntil||Number.isNaN(validUntil.getTime()))return json({ok:false,error:"active_authority_requires_valid_until"},400);
    const leaseMs=validUntil.getTime()-Date.now();
    if(leaseMs<=5000)return json({ok:false,error:"authority_lease_too_short"},400);
    if(leaseMs>ACTIVE_LEASE_MAX_MS)return json({ok:false,error:"authority_lease_too_long",maxSeconds:ACTIVE_LEASE_MAX_MS/1000},400);
  }
  if(!(issuer.principal_patterns||[]).some(p=>glob(p,ip)))return json({ok:false,error:"issuer_not_authorized_for_principal"},403);
  try{
    const out=await rest("rpc/gate_ingest_authority_event_v2",{method:"POST",body:JSON.stringify({p_project_id:a.projectId,p_authority_issuer_id:issuer.id,p_jti:jti,p_edge_id:edgeId,p_issuer_principal:ip,p_subject_principal:sp,p_status:status,p_sequence:seq,p_reason:reason,p_event_timestamp:et.toISOString(),p_valid_until:status==="ACTIVE"?validUntil.toISOString():null,p_event_hash:await sha256(token)})});
    return json({ok:true,accepted:true,event:{jti,edgeId,status,sequence:seq,validUntil:status==="ACTIVE"?validUntil.toISOString():null},state:Array.isArray(out)?out[0]:out},202);
  }catch(e){
    const m=e instanceof Error?e.message:"";
    return json({ok:false,error:m.includes("replay")?"authority_event_replay":m.includes("stale_authority_event")?"stale_authority_event":"authority_event_rejected"},409);
  }
}

const MAX_CANONICAL_SNAPSHOT_AGE_MS=5000;
// This is the age of a single PRIMARY database read, not issuer freshness or replica lag.
// Neither an issuer-event delivery SLA nor cross-region replication is represented by it.
function inspectPrimarySnapshot(snapshot,maxStalenessMs,nowMs=Date.now()){
  if(!snapshot||typeof snapshot!=="object"||
     !Array.isArray(snapshot.authority_edges)||
     !Array.isArray(snapshot.issuer_trust_states))
    return{ok:false,reason:"authority_snapshot_invalid",snapshotAgeMs:null};
  const captured=Date.parse(snapshot.snapshot_at);
  if(!Number.isFinite(captured))
    return{ok:false,reason:"authority_snapshot_timestamp_invalid",snapshotAgeMs:null};
  const rawAge=nowMs-captured;
  if(rawAge < -1000)
    return{ok:false,reason:"authority_snapshot_clock_skew",snapshotAgeMs:null};
  const snapshotAgeMs=Math.max(0,rawAge);
  if(snapshot.is_primary!==true||snapshot.source!=="canonical-primary")
    return{ok:false,reason:"canonical_primary_required",snapshotAgeMs};
  const budgetMs=Math.min(MAX_CANONICAL_SNAPSHOT_AGE_MS,
    maxStalenessMs===null?MAX_CANONICAL_SNAPSHOT_AGE_MS:maxStalenessMs);
  if(snapshotAgeMs>budgetMs)
    return{ok:false,reason:"canonical_snapshot_stale",snapshotAgeMs};
  return{ok:true,reason:null,snapshotAgeMs};
}

function checkRequestedRegion(raw){
 if(raw===undefined||raw===null||raw==="primary"||raw===GATE_PRIMARY_REGION)
   return {ok:true,region:raw||"primary",served:GATE_PRIMARY_REGION};
 if(typeof raw!=="string"||raw.length>60||raw.length===0)
   return {ok:false,status:400,reason:"invalid_region"};
 return {ok:false,status:503,reason:"regional_replica_not_configured"};
}
async function regionsStatus(req){
 const a=await auth(req);if(!a)return json({ok:false,error:"invalid_api_key"},401);
 return json({ok:true,apiVersion:"v7",topology:GATE_REGION_TOPOLOGY,
   canonicalPrimaryRegion:GATE_PRIMARY_REGION,
   configuredReplicaRegions:GATE_REPLICA_REGIONS,
   replicaLagMeasured:false,
   boundedReplicatedStateAvailable:false,
   currentConsistencyScope:"canonical-primary-read-age-only",
   strictGuarantee:"primary-database-read; not synchronous external issuer confirmation",
   externalIssuerRevocationSlaEstablished:false});
}
async function verify(req){
  const a=await auth(req); if(!a)return json({ok:false,error:"invalid_api_key"},401);
  const e=await ent(a.projectId); if(!e)return json({ok:false,error:"plan_entitlements_missing"},500);
  const usage=Number(e.current_month_usage||0),limit=Number(e.monthly_verification_limit||0);
  if(!e.overage_enabled&&usage>=limit)
    return json({ok:false,error:"monthly_verification_limit_reached",plan:a.plan,usage,limit},429);
  let b;try{b=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const selectedRegion=checkRequestedRegion(b&&b.region);
  if(!selectedRegion.ok){
    if(selectedRegion.status===400)return json({ok:false,error:selectedRegion.reason},400);
    return json({authority:"UNKNOWN",decision:"DENY",reason:selectedRegion.reason,
      requestedRegion:b.region,servedRegion:null,topology:GATE_REGION_TOPOLOGY,
      replicationLagMeasured:false,consistency:b?.consistency||"bounded",
      freshness:{fresh:false,replicaLagMs:null},sandbox:false},503);
  }
  if(b?.replicaProof!==undefined||b?.replicaSnapshot!==undefined)
    return json({ok:false,error:"client_supplied_replica_snapshots_not_supported"},400);
  const principal=safeText(b&&b.principal),actor=safeText(b&&b.actor),
    consistency=b&&b.consistency!=null?String(b.consistency).toLowerCase():"bounded",
    maxStalenessMs=b&&b.maxStalenessMs!=null?Number(b.maxStalenessMs):null;
  if(!principal||!actor)return json({ok:false,error:"principal_and_actor_required"},400);
  if(!["bounded","strict"].includes(consistency))
    return json({ok:false,error:"invalid_consistency"},400);
  if(maxStalenessMs!==null&&(!Number.isFinite(maxStalenessMs)||maxStalenessMs<0||maxStalenessMs>ACTIVE_LEASE_MAX_MS))
    return json({ok:false,error:"invalid_max_staleness_ms",max:ACTIVE_LEASE_MAX_MS},400);
  if(consistency==="strict"&&!e.allow_strict)
    return json({ok:false,error:"strict_consistency_not_in_plan",plan:a.plan},403);

  const started=performance.now();
  let snapshot;
  try{
    const rows=await rest("rpc/gate_authority_snapshot_v1",{
      method:"POST",
      signal:AbortSignal.timeout(3000),
      body:JSON.stringify({p_project_id:a.projectId})
    });
    snapshot=Array.isArray(rows)?rows[0]:null;
  }catch(error){
    console.error("canonical_snapshot_read_unavailable",String(error));
    // No ALLOW, and no fabricated meter usage if the database cannot be reached.
    return json({authority:"UNKNOWN",decision:"DENY",reason:"authority_store_unavailable",
      consistency,plan:a.plan,sandbox:false,
      freshness:{source:"canonical-primary",fresh:false,snapshotAgeMs:null,
        replicaLagMs:null,externalIssuerLagMs:null,maxStalenessMs},
      evaluation:{established:false,source:"canonical-primary",fresh:false}},503);
  }

  const assessment=inspectPrimarySnapshot(snapshot,maxStalenessMs);
  let out;
  if(!assessment.ok){
    out={authority:"UNKNOWN",decision:"DENY",reason:assessment.reason,
      principal,actor,evaluatedPathCount:0,paths:[]};
  }else{
    const issuerStates=new Map(snapshot.issuer_trust_states.map(s=>[String(s.id),s]));
    out=verifyGraph(principal,actor,snapshot.authority_edges,null,issuerStates);
  }
  const legacyFreshness=out.freshness||{};
  const freshness={
    source:snapshot?.source||"unavailable",
    isPrimary:snapshot?.is_primary===true,
    snapshotAt:snapshot?.snapshot_at||null,
    snapshotAgeMs:assessment.snapshotAgeMs,
    ageMs:assessment.snapshotAgeMs,
    lastEventAgeMs:Number.isFinite(legacyFreshness.ageMs)?legacyFreshness.ageMs:null,
    leaseRemainingMs:Number.isFinite(legacyFreshness.leaseRemainingMs)?legacyFreshness.leaseRemainingMs:null,
    replicaLagMs:null,
    externalIssuerLagMs:null,
    maxStalenessMs,
    effectiveSnapshotLimitMs:Math.min(MAX_CANONICAL_SNAPSHOT_AGE_MS,
      maxStalenessMs===null?MAX_CANONICAL_SNAPSHOT_AGE_MS:maxStalenessMs),
    fresh:assessment.ok&&out.authority!=="UNKNOWN"
  };
  const latency=Math.max(0,Math.round(performance.now()-started));
  const result={...out,freshness,consistency,
    servedBy:"gate-network:canonical",sandbox:false,plan:a.plan,
    topology:GATE_REGION_TOPOLOGY,
    servedRegion:GATE_PRIMARY_REGION,
    requestedRegion:selectedRegion.region,
    configuredReplicaRegions:GATE_REPLICA_REGIONS,
    replicationLagMeasured:false,
    evaluation:{
      established:assessment.ok&&out.authority!=="UNKNOWN",
      source:"canonical-primary-atomic-snapshot",
      fresh:freshness.fresh,
      ageMs:assessment.snapshotAgeMs,
      freshnessScope:"primary_read_age_only",
      issuerDeliveryBounded:false,
      replicationLagMeasured:false
    }
  };
  const raw=(req.headers.get("x-gate-source")||"api").toLowerCase();
  const source=["sdk","mcp","api","internal","unknown"].includes(raw)?raw:"unknown";
  // Commercial quota remains atomically enforced by SQL, not client telemetry.
  const meterRows=await rest("rpc/gate_record_metered_verification",{
    method:"POST",
    body:JSON.stringify({
      p_project_id:a.projectId,
      p_api_key_id:a.apiKeyId,
      p_source:source,
      p_client_version:(req.headers.get("x-gate-client-version")||"").slice(0,80)||null,
      p_decision:result.decision,
      p_authority:result.authority,
      p_consistency:consistency,
      p_latency_ms:latency
    })
  });
  const meter=Array.isArray(meterRows)?meterRows[0]:null;
  if(!meter)throw new Error("quota_meter_missing");
  if(meter.allowed!==true)
    return json({ok:false,error:"monthly_verification_limit_reached",
      plan:meter.plan,usage:Number(meter.current_month_usage||0),
      limit:Number(meter.monthly_limit||0)},429);
  return json({...result,plan:meter.plan,quota:{
    monthlyUsed:Number(meter.current_month_usage||0),
    monthlyLimit:Number(meter.monthly_limit||0)
  }});
}

async function audit(req){
  const a=await auth(req); if(!a)return json({ok:false,error:"invalid_api_key"},401);
  const e=await ent(a.projectId); if(!e)return json({ok:false,error:"plan_entitlements_missing"},500);
  const u=new URL(req.url);
  const limit=Math.min(200,Math.max(1,Number(u.searchParams.get("limit")||50)));
  const since=new Date(Date.now()-Number(e.audit_retention_days||7)*86400000).toISOString();
  const rows=await rest("gate_verification_events?project_id=eq."+a.projectId+"&occurred_at=gte."+encodeURIComponent(since)+"&select=request_id,occurred_at,source,client_version,consistency,decision,authority,latency_ms,error_code&order=occurred_at.desc&limit="+limit);
  return json({ok:true,privacy:"No principal, actor, resource or action parameters are stored in verification telemetry.",retentionDays:Number(e.audit_retention_days||7),events:rows});
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
  try{
    const path=new URL(req.url).pathname;
    if(req.method==="GET"&&path.endsWith("/health"))return json({ok:true,service:"gate-network",mode:"live",apiVersion:"v1",plans:["free","pro","scale"],eventType:EVENT_TYPE,freshness:{activeLeaseRequired:true,maxLeaseSeconds:ACTIVE_LEASE_MAX_MS/1000},registrationLimits:{globalPerDay:DAILY_REGISTRATION_LIMIT,perClientPerDay:DAILY_REGISTRATION_LIMIT_PER_IP}});
    if(req.method==="POST"&&path.endsWith("/projects/register"))return await registerProject(req);
    if(req.method==="GET"&&path.endsWith("/v1/project"))return await projectInfo(req);
    if(req.method==="GET"&&path.endsWith("/v1/regions/status"))return await regionsStatus(req);
    if(req.method==="POST"&&path.endsWith("/v1/issuers/register"))return await registerIssuer(req);
    if(req.method==="GET"&&path.endsWith("/v1/issuers"))return await listIssuers(req);
    if(req.method==="POST"&&path.endsWith("/v1/federation/exports"))return await federationExportCreate(req);
    if(req.method==="GET"&&path.endsWith("/v1/federation/exports"))return await federationExportList(req);
    if(req.method==="POST"&&path.endsWith("/v1/federation/exports/revoke"))return await federationExportRevoke(req);
    if(req.method==="POST"&&path.endsWith("/v1/federation/imports"))return await federationImport(req);
    if(req.method==="GET"&&path.endsWith("/v1/federation/imports"))return await federationImportList(req);
    if(req.method==="POST"&&path.endsWith("/v1/issuers/revoke"))return await revokeIssuerTrust(req);
    if(req.method==="POST"&&path.endsWith("/v1/authority/events"))return await ingest(req);
    if(req.method==="POST"&&path.endsWith("/v1/authority/verify"))return await verify(req);
    if(req.method==="GET"&&path.endsWith("/v1/audit"))return await audit(req);
    return json({ok:false,error:"not_found"},404);
  }catch(e){console.error(e);return json({ok:false,error:"internal_error"},500)}
});
