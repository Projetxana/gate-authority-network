import {startBillingWebhook} from "../_shared/billing-webhook-core.ts";

startBillingWebhook({
  mode:"stripe_sandbox",
  livemode:false,
  healthGet:true,
  requireNonInternal:false,
  secretRpc:"gate_qa_runtime_signing_secret",
  secretRpcBody:{},
  eventTable:"gate_qa_billing_events",
  subscriptionTable:"gate_qa_billing_subscriptions",
  projectTable:"gate_qa_billing_projects",
  transitionRpc:"gate_qa_apply_billing_transition",
  pricePlans:{
    "price_1UO75PLvWbQzorn8qKwthnGc":"pro"
  },
  paymentLinkPlans:{
    "plink_1UO7H2LvWbQzorn87u1PiStV":"pro"
  }
});
