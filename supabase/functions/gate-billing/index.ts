
const SUPABASE_URL=Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PRO="https://buy.stripe.com/eVqbJ2cnv2CWfcr2aKeIw01";
const SCALE="https://buy.stripe.com/bJe14ocnv5P8aWb5mWeIw02";
const PORTAL="https://billing.stripe.com/p/login/7sY4gAbjrb9s2pF3eOeIw00";
const H={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, content-type",
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
  "Content-Type":"application/json"
};
function json(b,s=200){return new Response(JSON.stringify(b),{status:s,headers:H})}
async function rest(path,init={}){
  const r=await fetch(SUPABASE_URL+"/rest/v1/"+path,{
    ...init,
    headers:{apikey:SERVICE_ROLE_KEY,authorization:"Bearer "+SERVICE_ROLE_KEY,"content-type":"application/json",...(init.headers||{})}
  });
  const t=await r.text();let d=null;try{d=t?JSON.parse(t):null}catch{d=t}
  if(!r.ok)throw new Error("supabase_"+r.status);
  return d;
}
function bearer(req){const m=(req.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i);return m?m[1]:null}
async function auth(req){
  const s=bearer(req);if(!s)return null;
  const rows=await rest("rpc/gate_authenticate_api_key_v2",{method:"POST",body:JSON.stringify({p_secret:s})});
  const r=Array.isArray(rows)?rows[0]:null;
  return r&&r.project_id?{projectId:r.project_id,plan:r.plan}:null;
}
async function status(projectId){
  const rows=await rest("gate_billing_subscriptions?project_id=eq."+projectId+"&select=plan,status,current_period_end,cancel_at_period_end,stripe_customer_id,created_at,updated_at&order=created_at.desc&limit=1");
  return Array.isArray(rows)?rows[0]||null:null;
}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
  try{
    const a=await auth(req);if(!a)return json({ok:false,error:"invalid_api_key"},401);
    const path=new URL(req.url).pathname;

    if(req.method==="GET"&&path.endsWith("/status")){
      return json({ok:true,projectId:a.projectId,projectPlan:a.plan,subscription:await status(a.projectId),portalUrl:PORTAL});
    }

    if(req.method==="GET"&&path.endsWith("/portal")){
      return json({ok:true,url:PORTAL});
    }

    if(req.method==="POST"&&path.endsWith("/checkout")){
      const existing=await status(a.projectId);
      if(existing&&["active","trialing","past_due"].includes(existing.status)){
        return json({ok:false,error:"paid_subscription_already_exists",currentPlan:existing.plan,portalUrl:PORTAL},409);
      }
      let body={};try{body=await req.json()}catch{}
      const plan=String(body&&body.plan||"").toLowerCase();
      const base=plan==="pro"?PRO:plan==="scale"?SCALE:null;
      if(!base)return json({ok:false,error:"plan_must_be_pro_or_scale"},400);
      const url=base+"?client_reference_id="+encodeURIComponent(a.projectId);
      return json({ok:true,plan,url,projectId:a.projectId});
    }

    return json({ok:false,error:"not_found"},404);
  }catch(e){
    console.error(e);
    return json({ok:false,error:"internal_error"},500);
  }
});
