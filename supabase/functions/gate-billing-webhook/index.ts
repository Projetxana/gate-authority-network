import {startBillingWebhook} from "../_shared/billing-webhook-core.ts";

startBillingWebhook({
  mode:"production",
  livemode:true,
  healthGet:false,
  requireNonInternal:true,
  secretRpc:"gate_get_runtime_secret",
  secretRpcBody:{p_name:"stripe_webhook_secret"},
  eventTable:"gate_billing_events",
  subscriptionTable:"gate_billing_subscriptions",
  projectTable:"gate_projects",
  transitionRpc:"gate_apply_billing_transition",
  pricePlans:{
    "price_1UNwTsLKim7l5tM1zITFWf3z":"pro",
    "price_1UNwTuLKim7l5tM1NUX1zHYL":"scale"
  },
  paymentLinkPlans:{
    "plink_1UNwjWLKim7l5tM17o8ru0Z8":"pro",
    "plink_1UNwjjLKim7l5tM1yHsvaEWr":"scale"
  }
});
