export function startBillingWebhook(config) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const H = {"Content-Type":"application/json"};

  function json(body,status=200){
    return new Response(JSON.stringify(body),{status,headers:H});
  }

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
    let d=null;
    try{d=t?JSON.parse(t):null}catch{d=t}
    if(!r.ok){
      throw new Error(
        "supabase_"+r.status+":"+
        String(typeof d==="string"?d:JSON.stringify(d))
      );
    }
    return d;
  }

  async function sha256(s){
    const d=await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(s)
    );
    return [...new Uint8Array(d)]
      .map(x=>x.toString(16).padStart(2,"0"))
      .join("");
  }

  async function runtimeSecret(){
    const body=config.secretRpcBody||{};
    const d=await rest(
      "rpc/"+config.secretRpc,
      {method:"POST",body:JSON.stringify(body)}
    );
    if(typeof d==="string")return d;
    if(Array.isArray(d)&&typeof d[0]==="string")return d[0];
    throw new Error("runtime_secret_missing");
  }

  function timingSafeEqual(a,b){
    if(a.length!==b.length)return false;
    let v=0;
    for(let i=0;i<a.length;i++){
      v|=a.charCodeAt(i)^b.charCodeAt(i);
    }
    return v===0;
  }

  async function verifyStripeSignature(raw,header,secret){
    const parts={};
    for(const p of String(header||"").split(",")){
      const i=p.indexOf("=");
      if(i>0){
        const k=p.slice(0,i);
        const v=p.slice(i+1);
        (parts[k]||(parts[k]=[])).push(v);
      }
    }

    const ts=Number(parts.t&&parts.t[0]);
    const sigs=parts.v1||[];

    if(!Number.isFinite(ts)||!sigs.length){
      throw new Error("invalid_stripe_signature_header");
    }

    if(Math.abs(Math.floor(Date.now()/1000)-ts)>300){
      throw new Error("stripe_signature_too_old");
    }

    const key=await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      {name:"HMAC",hash:"SHA-256"},
      false,
      ["sign"]
    );

    const mac=await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(String(ts)+"."+raw)
    );

    const hex=[...new Uint8Array(mac)]
      .map(x=>x.toString(16).padStart(2,"0"))
      .join("");

    if(!sigs.some(s=>timingSafeEqual(s,hex))){
      throw new Error("invalid_stripe_signature");
    }
  }

  function stripeId(v){
    if(typeof v==="string")return v;
    if(v&&typeof v.id==="string")return v.id;
    return null;
  }

  function subscriptionFromInvoice(o){
    return stripeId(o&&o.subscription)
      || stripeId(
        o&&o.parent
        &&o.parent.subscription_details
        &&o.parent.subscription_details.subscription
      )
      || null;
  }

  function createdAt(event){
    const n=Number(event&&event.created);
    if(!Number.isSafeInteger(n)||n<0){
      throw new Error("invalid_stripe_event_created");
    }
    return n;
  }

  function planFromPrice(priceId){
    return config.pricePlans[priceId]||null;
  }

  function checkoutPlan(o){
    return config.paymentLinkPlans[stripeId(o&&o.payment_link)]||null;
  }

  function subscriptionPrice(o){
    return stripeId(
      o&&o.items
      &&o.items.data
      &&o.items.data[0]
      &&o.items.data[0].price
    );
  }

  function grants(status){
    return status==="active"||status==="trialing";
  }

  function rank(type,status,plan){
    if(type==="customer.subscription.deleted")return 9;

    if(
      type==="invoice.payment_failed"
      ||type==="checkout.session.async_payment_failed"
    )return 8;

    if(
      type==="customer.subscription.created"
      ||type==="customer.subscription.updated"
    ){
      if(!grants(status))return 8;
      return plan==="pro"?6:5;
    }

    if(
      type==="checkout.session.completed"
      ||type==="checkout.session.async_payment_succeeded"
    ){
      return plan==="pro"?4:3;
    }

    return 1;
  }

  async function billingRowBySub(subId){
    if(!subId)return null;

    const rows=await rest(
      config.subscriptionTable+
      "?stripe_subscription_id=eq."+
      encodeURIComponent(subId)+
      "&select=*"
    );

    return Array.isArray(rows)?rows[0]||null:null;
  }

  async function projectRecord(id){
    if(!id||!/^[0-9a-fA-F-]{36}$/.test(id))return null;

    const rows=await rest(
      config.projectTable+
      "?id=eq."+
      encodeURIComponent(id)+
      "&select=*"
    );

    return Array.isArray(rows)?rows[0]||null:null;
  }

  function projectAllowed(project){
    if(!project)return false;

    if(config.requireNonInternal){
      return project.status==="active"
        &&project.is_internal!==true;
    }

    return true;
  }

  async function recordOnly(
    event,
    payloadHash,
    subId,
    projectId,
    reason
  ){
    await rest(
      config.eventTable+"?on_conflict=stripe_event_id",
      {
        method:"POST",
        headers:{
          prefer:"resolution=ignore-duplicates,return=minimal"
        },
        body:JSON.stringify({
          stripe_event_id:event.id,
          event_type:event.type,
          livemode:config.livemode,
          project_id:projectId||null,
          payload_hash:payloadHash,
          stripe_created_at:
            Number.isSafeInteger(Number(event.created))
              ?Number(event.created)
              :null,
          stripe_subscription_id:subId||null,
          state_applied:false,
          ordering_reason:reason
        })
      }
    );
  }

  async function transition(
    event,
    payloadHash,
    args
  ){
    return await rest(
      "rpc/"+config.transitionRpc,
      {
        method:"POST",
        body:JSON.stringify({
          p_stripe_event_id:event.id,
          p_event_type:event.type,
          p_payload_hash:payloadHash,
          p_stripe_created_at:createdAt(event),
          p_stripe_subscription_id:args.subId,
          p_safety_rank:
            Number.isInteger(args.safetyRank)
              ?args.safetyRank
              :rank(
                event.type,
                args.status,
                args.plan
              ),
          p_project_id:args.projectId||null,
          p_subscription_write_mode:
            args.writeMode||"none",
          p_stripe_customer_id:
            args.customerId||null,
          p_stripe_price_id:
            args.priceId||null,
          p_subscription_plan:
            args.plan||null,
          p_subscription_status:
            args.status||null,
          p_current_period_end:
            args.periodEnd||null,
          p_cancel_at_period_end:
            typeof args.cancelAtPeriodEnd==="boolean"
              ?args.cancelAtPeriodEnd
              :null,
          p_effective_project_plan:
            args.effectivePlan||null
        })
      }
    );
  }

  async function processEvent(event,payloadHash){
    const type=event.type;
    const o=event.data&&event.data.object;

    if(!o){
      await recordOnly(
        event,
        payloadHash,
        null,
        null,
        "missing_event_object"
      );
      return null;
    }

    if(
      type==="checkout.session.completed"
      ||type==="checkout.session.async_payment_succeeded"
    ){
      if(o.mode!=="subscription"){
        throw new Error("checkout_not_subscription");
      }

      const plan=checkoutPlan(o);

      if(
        o.metadata
        &&o.metadata.gate_plan
        &&o.metadata.gate_plan!==plan
      ){
        throw new Error("checkout_plan_conflict");
      }

      const subId=stripeId(o.subscription);
      const customerId=stripeId(o.customer);
      const projectId=o.client_reference_id;
      const existing=await billingRowBySub(subId);

      if(
        existing
        &&projectId
        &&existing.project_id!==projectId
      ){
        await recordOnly(
          event,
          payloadHash,
          subId,
          existing.project_id,
          "checkout_project_binding_conflict"
        );
        return null;
      }

      const project=await projectRecord(projectId);

      if(
        !["pro","scale"].includes(plan)
        ||!subId
        ||!customerId
        ||!projectAllowed(project)
      ){
        throw new Error("invalid_checkout_reference");
      }

      const active=
        o.payment_status==="paid"
        ||o.payment_status==="no_payment_required"
        ||type==="checkout.session.async_payment_succeeded";

      return await transition(
        event,
        payloadHash,
        {
          subId,
          projectId,
          customerId,
          priceId:
            Object.keys(config.pricePlans)
              .find(k=>config.pricePlans[k]===plan)||null,
          plan,
          status:active?"active":"pending",
          writeMode:"upsert",
          effectivePlan:active?plan:null
        }
      );
    }

    if(type==="checkout.session.async_payment_failed"){
      const subId=stripeId(o.subscription);
      const row=await billingRowBySub(subId);

      if(!subId||!row){
        await recordOnly(
          event,
          payloadHash,
          subId,
          row&&row.project_id,
          "payment_failure_without_bound_subscription"
        );
        return null;
      }

      return await transition(
        event,
        payloadHash,
        {
          subId,
          projectId:row.project_id,
          status:"payment_failed",
          writeMode:"update",
          effectivePlan:"free"
        }
      );
    }

    if(type==="invoice.paid"){
      const subId=subscriptionFromInvoice(o);
      const row=await billingRowBySub(subId);

      await recordOnly(
        event,
        payloadHash,
        subId,
        row&&row.project_id,
        "observed_non_authoritative_invoice_paid"
      );

      return null;
    }

    if(type==="invoice.payment_failed"){
      const subId=subscriptionFromInvoice(o);
      const row=await billingRowBySub(subId);

      if(!subId||!row){
        await recordOnly(
          event,
          payloadHash,
          subId,
          row&&row.project_id,
          "invoice_failure_without_bound_subscription"
        );
        return null;
      }

      return await transition(
        event,
        payloadHash,
        {
          subId,
          projectId:row.project_id,
          status:"past_due",
          writeMode:"update",
          effectivePlan:"free"
        }
      );
    }

    if(
      type==="customer.subscription.created"
      ||type==="customer.subscription.updated"
      ||type==="customer.subscription.deleted"
    ){
      const subId=stripeId(o.id);
      const existing=await billingRowBySub(subId);

      const metadataProjectId=
        o.metadata&&o.metadata.gate_project_id;

      if(
        existing
        &&metadataProjectId
        &&existing.project_id!==metadataProjectId
      ){
        await recordOnly(
          event,
          payloadHash,
          subId,
          existing.project_id,
          "subscription_project_binding_conflict"
        );
        return null;
      }

      const projectId=
        (existing&&existing.project_id)
        ||metadataProjectId
        ||null;

      const project=await projectRecord(projectId);

      const priceId=subscriptionPrice(o);
      const mappedPlan=planFromPrice(priceId);

      const existingPlan=
        existing
        &&["pro","scale"].includes(existing.plan)
          ?existing.plan
          :null;

      const customerId=stripeId(o.customer);

      const status=
        type==="customer.subscription.deleted"
          ?"canceled"
          :String(o.status||"unknown");

      if(
        !subId
        ||!projectAllowed(project)
      ){
        await recordOnly(
          event,
          payloadHash,
          subId,
          projectId,
          "subscription_event_not_bound"
        );
        return null;
      }

      const periodEnd=
        o.current_period_end
          ?new Date(
            Number(o.current_period_end)*1000
          ).toISOString()
          :null;

      const isDeleted=
        type==="customer.subscription.deleted";

      const authoritativePlan=
        mappedPlan
        ||(isDeleted?existingPlan:null);

      if(!authoritativePlan){
        return await transition(
          event,
          payloadHash,
          {
            subId,
            projectId,
            customerId,
            priceId,
            plan:existingPlan,
            status:existingPlan?status:null,
            periodEnd,
            cancelAtPeriodEnd:
              Boolean(o.cancel_at_period_end),
            writeMode:existingPlan
              ?"update"
              :"none",
            effectivePlan:"free",
            safetyRank:isDeleted?9:8
          }
        );
      }

      const effectivePlan=
        isDeleted
          ?"free"
          :grants(status)
            ?authoritativePlan
            :"free";

      return await transition(
        event,
        payloadHash,
        {
          subId,
          projectId,
          customerId,
          priceId,
          plan:authoritativePlan,
          status,
          periodEnd,
          cancelAtPeriodEnd:
            Boolean(o.cancel_at_period_end),
          writeMode:"upsert",
          effectivePlan
        }
      );
    }

    await recordOnly(
      event,
      payloadHash,
      null,
      null,
      "event_type_not_state_transition"
    );

    return null;
  }

  Deno.serve(async req=>{
    if(config.healthGet&&req.method==="GET"){
      return json({
        ok:true,
        mode:config.mode,
        live:config.livemode,
        productionData:config.livemode
      });
    }

    if(req.method!=="POST"){
      return json(
        {ok:false,error:"method_not_allowed"},
        405
      );
    }

    try{
      const raw=await req.text();
      const secret=await runtimeSecret();

      await verifyStripeSignature(
        raw,
        req.headers.get("stripe-signature"),
        secret
      );

      const event=JSON.parse(raw);

      if(event.livemode!==config.livemode){
        return json(
          {
            ok:false,
            error:config.livemode
              ?"livemode_required"
              :"sandbox_only"
          },
          400
        );
      }

      const payloadHash=await sha256(raw);
      const result=await processEvent(
        event,
        payloadHash
      );

      return json({
        ok:true,
        transition:result||null
      });
    }catch(e){
      console.error(e);

      return json(
        {
          ok:false,
          error:e instanceof Error
            ?e.message
            :"billing_webhook_error"
        },
        400
      );
    }
  });
}
