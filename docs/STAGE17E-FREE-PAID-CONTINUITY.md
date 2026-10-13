# Stage 17E — Free to paid continuity and billing ordering hardening

Status: validated on 2026-10-13

## Objective

Stage 17E validates that a real GATE Network project can move between Free and
paid entitlements without changing the developer integration.

The continuity contract is:

- same project ID;
- same API key;
- same canonical network endpoint;
- same `gate.verify()` integration;
- only plan entitlements change.

This stage also hardens Stripe subscription-state processing against
out-of-order webhook delivery.

## Live developer path

A real Free GATE project was created through the public browser flow and
confirmed against the canonical live endpoint.

Observed Free entitlements:

- 50,000 verifications/month;
- 1 authority issuer;
- bounded consistency;
- strict consistency not included.

The fresh live project had no preloaded authority graph and its first real
verification failed closed with `DENY / no_authority_path`, as expected.

## Same-integration entitlement continuity

The same real project was used for a controlled reversible entitlement test.

Without changing the project ID, active API key, endpoint, or browser
integration:

1. Free entitlements were observed;
2. the project was temporarily changed to Pro under an explicitly approved
   administrative QA procedure;
3. the same browser session refreshed the plan and observed Pro entitlements;
4. the project was restored to Free.

Observed Pro entitlements:

- 1,000,000 verifications/month;
- 10 authority issuers;
- strict consistency available.

No production Stripe subscription or live payment was created for this
continuity proof.

This proves credential and integration continuity across plan changes. It does
not claim that a production payment was completed during validation.

## Stripe sandbox ordering defect found

Stage 17E validation exposed a real webhook ordering defect in the earlier
billing implementation.

A sandbox subscription had been canceled in Stripe, but GATE QA later showed it
as active/Pro because older successful events were delivered after the
cancellation event.

The previous handler processed event arrival order rather than authoritative
Stripe event creation order.

## Hardening

Stage 17E adds atomic subscription-state transitions with per-subscription
watermarks.

State-transition evidence includes:

- Stripe event creation timestamp;
- Stripe subscription ID;
- safety rank for same-timestamp fail-closed ordering;
- applied/not-applied state;
- ordering reason.

Transitions are serialized per Stripe subscription in PostgreSQL.

A stale event cannot override a newer authoritative subscription state.

`invoice.paid` is observational only and cannot grant or restore paid
entitlements.

Unknown paid-price mappings fail closed rather than falling back to an old paid
plan.

## Real signed Stripe sandbox replay

The hardened QA webhook was validated using original Stripe sandbox events
manually resent by Stripe with valid webhook signatures.

### Cancellation

Replayed:

`customer.subscription.deleted`

Observed result:

- project -> Free;
- subscription -> canceled;
- state transition applied;
- deletion became the authoritative watermark.

### Older checkout delivered after cancellation

Replayed:

`checkout.session.completed`

Observed result:

- HTTP 200;
- project remained Free;
- subscription remained canceled;
- `state_applied=false`;
- `ordering_reason=stale_or_equal_order`.

### Older invoice paid delivered after cancellation

Replayed:

`invoice.paid`

Observed result:

- HTTP 200;
- project remained Free;
- subscription remained canceled;
- `state_applied=false`;
- `ordering_reason=observed_non_authoritative_invoice_paid`.

This reproduces the dangerous historical delivery order and demonstrates that
the hardened handler does not reactivate a canceled project.

## Production deployment

After CI validation, the hardened production billing webhook was deployed from
the reviewed Stage 17E Git commit.

Post-deployment checks confirmed:

- deployed wrapper matched the reviewed Git source;
- deployed shared billing core matched the reviewed Git source;
- the function was active;
- the real Stage 17E project remained Free/active;
- no production subscription was created by deployment;
- no production billing watermark was created by deployment.

No real payment was performed as part of Stage 17E validation.

## Evidence boundary

Stage 17E proves:

- real public Free onboarding;
- live authenticated project verification;
- Free-to-paid entitlement continuity without changing integration identifiers;
- fail-closed Stripe processing under out-of-order delivery;
- production deployment from reviewed CI-passing code.

Stage 17E does not prove:

- enterprise production SLA;
- production regional replicas;
- independent third-party issuer propagation SLA;
- production payment completion during validation;
- independent developer adoption at scale.

Those remain adoption and production-maturity work beyond this stage.
