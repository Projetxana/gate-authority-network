
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const H = {"Content-Type":"application/json"};

function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:H})}
async function rest(path,init={}){
  const r=await fetch(SUPABASE_URL+"/rest/v1/"+path,{
    ...init,
    headers:{apikey:SERVICE_ROLE_KEY,authorization:"Bearer "+SERVICE_ROLE_KEY,"content-type":"application/json",...(init.headers||{})}
  });
  const t=await r.text();
  let d=null;try{d=t?JSON.parse(t):null}catch{d=t}
  if(!r.ok)throw new Error("supabase_"+r.status+":"+String(typeof d==="string"?d:JSON.stringify(d)));
  return d;
}
async function sha256(s){
  const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function runtimeSecret(name){
  const d=await rest("rpc/gate_get_runtime_secret",{method:"POST",body:JSON.stringify({p_name:name})});
  if(typeof d==="string")return d;
  if(Array.isArray(d)&&typeof d[0]==="string")return d[0];
  throw new Error("runtime_secret_missing");
}
function timingSafeEqual(a,b){
  if(a.length!==b.length)return false;
  let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);
  return v===0;
}
async function verifyStripeSignature(raw,header,secret){
  const parts={};
  for(const p of String(header||"").split(",")){
    const i=p.indexOf("=");if(i>0){const k=p.slice(0,i),v=p.slice(i+1);(parts[k]||(parts[k]=[])).push(v)}
  }
  const ts=Number(parts.t&&parts.t[0]);
  const sigs=parts.v1||[];
  if(!Number.isFinite(ts)||!sigs.length)throw new Error("invalid_stripe_signature_header");
  if(Math.abs(Math.floor(Date.now()/1000)-ts)>300)throw new Error("stripe_signature_too_old");
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const mac=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(String(ts)+"."+raw));
  const hex=[...new Uint8Array(mac)].map(x=>x.toString(16).padStart(2,"0")).join("");
  if(!sigs.some(s=>timingSafeEqual(s,hex)))throw new Error("invalid_stripe_signature");
}
function stripeId(v){
  if(typeof v==="string")return v;
  if(v&&typeof v.id==="string")return v.id;
  return null;
}
function subscriptionFromInvoice(o){
  return stripeId(o&&o.subscription)
    || stripeId(o&&o.parent&&o.parent.subscription_details&&o.parent.subscription_details.subscription)
    || null;
}
async function billingRowBySub(subId){
  if(!subId)return null;
  const rows=await rest("gate_billing_subscriptions?stripe_subscription_id=eq."+encodeURIComponent(subId)+"&select=*");
  return Array.isArray(rows)?rows[0]:null;
}
async function projectRecord(id){
  if(!id||!/^[0-9a-fA-F-]{36}$/.test(id))return null;
  const rows=await rest("gate_projects?id=eq."+encodeURIComponent(id)+"&select=id,plan,is_internal");
  return Array.isArray(rows)?rows[0]||null:null;
}
async function projectExists(id){ return !!(await projectRecord(id)); }
async function upsertSubscription(data){
  const rows=await rest("gate_billing_subscriptions?on_conflict=stripe_subscription_id",{
    method:"POST",
    headers:{prefer:"resolution=merge-duplicates,return=representation"},
    body:JSON.stringify(data)
  });
  return Array.isArray(rows)?rows[0]:null;
}
async function setPlan(projectId,plan){
  await rest("gate_projects?id=eq."+encodeURIComponent(projectId),{
    method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({plan})
  });
}
function planFromPrice(priceId){
  if(priceId==="price_1UNwTsLKim7l5tM1zITFWf3z")return"pro";
  if(priceId==="price_1UNwTuLKim7l5tM1NUX1zHYL")return"scale";
  return null;
}
async function processEvent(event){
  const type=event.type,o=event.data&&event.data.object;
  if(!o)return null;

  if(type==="checkout.session.completed"||type==="checkout.session.async_payment_succeeded"){
    const projectId=o.client_reference_id;
    const paymentLinkPlans={"plink_1UNwjWLKim7l5tM17o8ru0Z8":"pro","plink_1UNwjjLKim7l5tM1yHsvaEWr":"scale"};
    if(o.mode!=="subscription")throw new Error("checkout_not_subscription");
    const plan=paymentLinkPlans[stripeId(o.payment_link)]||null;
    if(o.metadata&&o.metadata.gate_plan&&o.metadata.gate_plan!==plan)throw new Error("checkout_plan_conflict");
    const subId=stripeId(o.subscription);
    const customerId=stripeId(o.customer);
    const project=await projectRecord(projectId);
    if(!["pro","scale"].includes(plan)||!subId||!customerId||!project||project.is_internal)throw new Error("invalid_checkout_reference");
    const active=o.payment_status==="paid"||o.payment_status==="no_payment_required"||type==="checkout.session.async_payment_succeeded";
    await upsertSubscription({
      project_id:projectId,stripe_customer_id:customerId,stripe_subscription_id:subId,
      stripe_price_id:plan==="pro"?"price_1UNwTsLKim7l5tM1zITFWf3z":"price_1UNwTuLKim7l5tM1NUX1zHYL",plan,status:active?"active":"pending"
    });
    if(active)await setPlan(projectId,plan);
    return projectId;
  }

  if(type==="checkout.session.async_payment_failed"){
    const subId=stripeId(o.subscription),row=await billingRowBySub(subId);
    if(row)await rest("gate_billing_subscriptions?id=eq."+row.id,{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({status:"payment_failed"})});
    return row&&row.project_id;
  }

  if(type==="invoice.paid"){
    const subId=subscriptionFromInvoice(o),row=await billingRowBySub(subId);
    if(row&&["active","trialing"].includes(row.status)&&planFromPrice(row.stripe_price_id)===row.plan){await setPlan(row.project_id,row.plan)}
    return row&&row.project_id;
  }

  if(type==="invoice.payment_failed"){
    const subId=subscriptionFromInvoice(o),row=await billingRowBySub(subId);
    if(row&&!["canceled","unpaid","incomplete_expired"].includes(row.status)){await rest("gate_billing_subscriptions?id=eq."+row.id,{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({status:"past_due"})});await setPlan(row.project_id,"free")}
    return row&&row.project_id;
  }

  if(type==="customer.subscription.created"){
    const subId=o.id;
    const customerId=stripeId(o.customer);
    const priceId=stripeId(o.items&&o.items.data&&o.items.data[0]&&o.items.data[0].price);
    const projectId=o.metadata&&o.metadata.gate_project_id;
    const project=await projectRecord(projectId);
    if(!project)return null;

    let plan=planFromPrice(priceId);
    const qaAllowed=project.is_internal===true && o.metadata&&o.metadata.gate_qa==="true";
    if(!plan && qaAllowed && ["pro","scale"].includes(o.metadata&&o.metadata.gate_plan)){
      plan=o.metadata.gate_plan;
    }
    if(!plan)return null;

    const status=String(o.status||"unknown");
    const end=o.current_period_end?new Date(Number(o.current_period_end)*1000).toISOString():null;
    await upsertSubscription({
      project_id:projectId,
      stripe_customer_id:customerId,
      stripe_subscription_id:subId,
      stripe_price_id:priceId,
      plan,
      status,
      current_period_end:end,
      cancel_at_period_end:Boolean(o.cancel_at_period_end)
    });
    if(["active","trialing"].includes(status))await setPlan(projectId,plan);
    return projectId;
  }

  if(type==="customer.subscription.updated"||type==="customer.subscription.deleted"){
    const subId=o.id,row=await billingRowBySub(subId);
    if(!row)return null;
    const priceId=stripeId(o.items&&o.items.data&&o.items.data[0]&&o.items.data[0].price);
    const plan=planFromPrice(priceId);
    const status=type==="customer.subscription.deleted"?"canceled":String(o.status||"unknown");
    const end=o.current_period_end?new Date(Number(o.current_period_end)*1000).toISOString():null;
    await rest("gate_billing_subscriptions?id=eq."+row.id,{
      method:"PATCH",headers:{prefer:"return=minimal"},
      body:JSON.stringify({status,plan:plan||row.plan,stripe_price_id:priceId||row.stripe_price_id,current_period_end:end,cancel_at_period_end:Boolean(o.cancel_at_period_end)})
    });
    if(type==="customer.subscription.deleted"||["canceled","unpaid","incomplete_expired","past_due"].includes(status)||!plan)await setPlan(row.project_id,"free");
    else if(["active","trialing"].includes(status))await setPlan(row.project_id,plan);
    return row.project_id;
  }

  return null;
}

Deno.serve(async req=>{
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  try{
    const raw=await req.text();
    const secret=await runtimeSecret("stripe_webhook_secret");
    await verifyStripeSignature(raw,req.headers.get("stripe-signature"),secret);
    const event=JSON.parse(raw);
    if(event.livemode!==true)return json({ok:false,error:"livemode_required"},400);

    const seen=await rest("gate_billing_events?stripe_event_id=eq."+encodeURIComponent(event.id)+"&select=stripe_event_id");
    if(Array.isArray(seen)&&seen.length)return json({ok:true,duplicate:true});

    const projectId=await processEvent(event);
    await rest("gate_billing_events",{
      method:"POST",headers:{prefer:"return=minimal"},
      body:JSON.stringify({stripe_event_id:event.id,event_type:event.type,livemode:true,project_id:projectId,payload_hash:await sha256(raw)})
    });
    return json({ok:true});
  }catch(e){
    console.error(e);
    return json({ok:false,error:e instanceof Error?e.message:"billing_webhook_error"},400);
  }
});
