import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const core = readFileSync(
  "supabase/functions/_shared/billing-webhook-core.ts",
  "utf8"
);

const migration = readFileSync(
  "supabase/migrations/20261013174500_harden_stripe_subscription_project_binding.sql",
  "utf8"
);

test("Stripe webhook preserves an existing subscription-to-project binding", () => {
  assert.match(
    core,
    /checkout_project_binding_conflict/
  );

  assert.match(
    core,
    /subscription_project_binding_conflict/
  );

  assert.match(
    core,
    /const projectId=\s*\(existing&&existing\.project_id\)\s*\|\|metadataProjectId\s*\|\|null;/s
  );
});

test("database blocks subscription and watermark project relinking in prod and QA", () => {
  assert.match(
    migration,
    /before update of project_id\s+on public\.gate_billing_subscriptions/i
  );

  assert.match(
    migration,
    /before update of project_id\s+on public\.gate_qa_billing_subscriptions/i
  );

  assert.match(
    migration,
    /before update of project_id\s+on public\.gate_billing_event_watermarks/i
  );

  assert.match(
    migration,
    /before update of project_id\s+on public\.gate_qa_billing_event_watermarks/i
  );

  assert.match(
    migration,
    /billing_subscription_project_relink_forbidden/
  );
});
