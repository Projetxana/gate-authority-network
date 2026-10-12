const SUPABASE_URL=Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ORIGIN=/^https:\/\/(?:gate-beta-nu|gate-beta-jeromes-projects-11beaf09)\.vercel\.app$/;
const ACCEPTING=true;
const HEADERS={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Vary":"Origin"};
function originHeaders(req:Request):Record<string,string>{
 const origin=req.headers.get("origin")||"";
 return origin&&ORIGIN.test(origin)?{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST, GET, OPTIONS","Access-Control-Allow-Headers":"content-type"}:{};
}
function json(req:Request,body:object,status=200){
 return new Response(JSON.stringify(body),{status,headers:{...HEADERS,...originHeaders(req)}});
}
function cleanText(v:unknown,max:number):string|null{
 if(typeof v!=="string")return null;const s=v.trim();return s.length<=max?s:null;
}
function validEmail(s:string):boolean{
 return s.length>=5&&s.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}
async function ipFingerprint(req:Request):Promise<string>{
 const ip=(req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]||"unknown").trim().slice(0,100);
 const day=new Date().toISOString().slice(0,10);
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(SERVICE_ROLE_KEY!),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const digest=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode("gate-beta|"+day+"|"+ip));
 return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function rpc(name:string,input:object):Promise<any>{
 const resp=await fetch(SUPABASE_URL+"/rest/v1/rpc/"+name,{
 method:"POST",
 headers:{apikey:SERVICE_ROLE_KEY!,authorization:"Bearer "+SERVICE_ROLE_KEY!,"content-type":"application/json"},
 body:JSON.stringify(input),signal:AbortSignal.timeout(3500)
 });
 if(!resp.ok)throw new Error("beta_db_unavailable_"+resp.status);
 return await resp.json();
}
async function parseBody(req:Request):Promise<any>{
 const length=Number(req.headers.get("content-length")||0);
 if(length>5000)throw new Error("invalid_body");
 const text=await req.text();
 if(text.length>5000)throw new Error("invalid_body");
 return JSON.parse(text);
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS"){
  if(!req.headers.get("origin")||!ORIGIN.test(req.headers.get("origin")!))return json(req,{ok:false,error:"origin_not_allowed"},403);
  return new Response(null,{status:204,headers:{...HEADERS,...originHeaders(req)}});
 }
 const path=new URL(req.url).pathname;
 if(req.method==="GET"&&path.endsWith("/health"))
  return json(req,{ok:true,service:"gate-beta",acceptingApplications:ACCEPTING,invitationRequired:true});
 if(req.method!=="POST"||!(path.endsWith("/apply")||path.endsWith("/feedback")))
  return json(req,{ok:false,error:"not_found"},404);
 const origin=req.headers.get("origin");
 if(!origin||!ORIGIN.test(origin))return json(req,{ok:false,error:"origin_not_allowed"},403);
 if(!ACCEPTING&&path.endsWith("/apply"))return json(req,{ok:false,error:"beta_intake_closed"},503);
 let body:any;
 try{body=await parseBody(req)}catch{return json(req,{ok:false,error:"invalid_json_or_body_size"},400)}
 if(!body||typeof body!=="object"||Array.isArray(body))return json(req,{ok:false,error:"invalid_body"},400);
 if(body.website)return json(req,{ok:true,received:true,invitationRequired:true});
 if(body.consent!==true)return json(req,{ok:false,error:"consent_required"},400);
 const email=cleanText(body.email,254)?.toLowerCase()||"";
 if(!validEmail(email))return json(req,{ok:false,error:"valid_email_required"},400);
 const hash=await ipFingerprint(req);
 try{
  if(path.endsWith("/apply")){
   const role=cleanText(body.role,80);
   const target=cleanText(body.target,80);
   const useCase=cleanText(body.useCase,1200);
   if(!["agent_builder","security_engineer","platform_engineer","founder","other"].includes(role||""))
    return json(req,{ok:false,error:"invalid_role"},400);
   if(!["mcp","sdk","http_api","research"].includes(target||""))
    return json(req,{ok:false,error:"invalid_integration_target"},400);
   if(!useCase||useCase.length<20)return json(req,{ok:false,error:"use_case_minimum_20_characters"},400);
   const result=await rpc("gate_beta_apply",{p_email:email,p_developer_role:role,p_integration_target:target,p_use_case:useCase,p_ip_day_hash:hash});
   const value=Array.isArray(result)?result[0]:result;
   if(value?.limit_reached)return json(req,{ok:false,error:"daily_application_limit_reached"},429);
   return json(req,{ok:true,received:true,invitationRequired:true,message:"Your application was received. If selected, we will contact you by email."},202);
  }
  const experience=cleanText(body.experience,30);
  const message=cleanText(body.message,1200);
  if(!["easy","mixed","blocked"].includes(experience||"")||!message||message.length<15)
   return json(req,{ok:false,error:"valid_feedback_required"},400);
  const saved=await rpc("gate_beta_record_feedback",{p_email:email,p_experience:experience,p_message:message,p_ip_day_hash:hash});
  if(saved!==true)return json(req,{ok:false,error:"feedback_not_accepted_or_rate_limited"},429);
  return json(req,{ok:true,received:true},202);
 }catch(_){
  return json(req,{ok:false,error:"beta_service_temporarily_unavailable"},503);
 }
});