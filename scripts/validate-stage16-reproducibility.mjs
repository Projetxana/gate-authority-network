import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function fail(message) {
  console.error(`STAGE16 FAIL: ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`✓ ${message}`);
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function walk(dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];

  const out = [];

  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      out.push(...walk(rel));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }

  return out;
}

const productFunctions = [
  "gate-beta",
  "gate-billing",
  "gate-billing-webhook",
  "gate-metrics",
  "gate-network",
  "gate-sandbox",
  "gate-signed-sources",
  "gate-source-registry",
  "gate-ssf-bridge-preview",
  "gate-ssf-connectors"
];

const canonicalMigrations = [
  "20261006234540_create_gate_adoption_telemetry.sql",
  "20261006234817_harden_gate_telemetry_rls_and_indexes.sql",
  "20261007111003_create_gate_public_sandbox.sql",
  "20261007133052_harden_public_sandbox_and_split_preview_metrics.sql",
  "20261007133156_set_gate_adoption_summary_security_invoker.sql",
  "20261007151732_add_commercial_plans_live_authority_and_billing.sql",
  "20261007151754_add_atomic_live_authority_ingest.sql",
  "20261007232742_harden_live_authority_freshness_and_fixed_quotas.sql",
  "20261008000220_enable_http_for_gate_live_qa.sql",
  "20261008000457_fix_live_authority_ingest_ambiguity.sql",
  "20261008000538_remove_http_after_gate_live_qa.sql",
  "20261008000843_reenable_http_for_free_live_qa.sql",
  "20261008000929_remove_http_after_free_live_qa.sql",
  "20261008024301_gate_stripe_sandbox_qa_isolation.sql",
  "20261008025215_gate_qa_private_stripe_signing_secret_access.sql",
  "20261008031815_gate_atomic_monthly_verification_quotas.sql",
  "20261008032101_gate_quota_entitlements_private_rpc_permissions.sql",
  "20261008032437_gate_developer_qa_pg_net_http_probe.sql",
  "20261008032550_gate_qa_remove_unused_http_extension.sql",
  "20261008041011_gate_federated_tenant_trust_schema_v1.sql",
  "20261008041024_gate_federated_tenant_trust_actions_v1.sql",
  "20261009021102_gate_atomic_authority_snapshot_v1.sql",
  "20261009025228_gate_external_beta_waitlist_v1.sql",
  "20261011015104_create_gate_source_freshness_canary.sql",
  "20261011015130_split_issuer_checkpoint_and_accepted_sequence.sql",
  "20261011015641_add_signed_source_artifact_replay_log.sql",
  "20261011020706_add_source_freshness_v4_key_rotation.sql",
  "20261011021100_add_key_lifecycle_windows_v5.sql",
  "20261011021127_extend_key_lifecycle_with_revoked_v5.sql",
  "20261011115826_add_verified_effect_metering_v1.sql",
  "20261011120118_harden_verified_effect_metering_views.sql",
  "20261011124452_add_ssf_caep_hosted_preview.sql",
  "20261011174503_hosted_enterprise_ssf_connectors_stage13.sql",
  "20261011174524_hosted_ssf_worker_auth_stage13.sql",
  "20261011174727_schedule_hosted_ssf_worker_stage13.sql",
  "20261011174749_harden_hosted_ssf_connector_indexes_stage13.sql",
  "20261011214324_authority_source_registry_stage14.sql",
  "20261011224956_multi_source_signed_push_stage15.sql",
  "20261012133500_make_ssf_worker_schedule_portable.sql"
];

console.log("=== GATE Stage 16 reproducibility invariants ===");

for (const doc of [
  "docs/GATE-NETWORK-V1-BLUEPRINT.md",
  "docs/PRODUCTION-MANIFEST-V1.md",
  "docs/SOURCE-EVIDENCE-CONTRACT-V1.md"
]) {
  if (!exists(doc)) fail(`missing architecture contract: ${doc}`);
}

ok("architecture contracts present");

if (!exists("supabase/config.toml")) {
  fail("supabase/config.toml is missing");
}

ok("Supabase config present");

const functionRoot = path.join(root, "supabase/functions");

const trackedFunctions = fs.readdirSync(functionRoot, {
  withFileTypes: true
})
  .filter((x) => x.isDirectory())
  .map((x) => x.name)
  .sort();

const expectedFunctions = [...productFunctions].sort();

if (JSON.stringify(trackedFunctions) !== JSON.stringify(expectedFunctions)) {
  fail(
    `product function set changed\nexpected=${expectedFunctions.join(",")}\nactual=${trackedFunctions.join(",")}`
  );
}

for (const fn of productFunctions) {
  if (!exists(`supabase/functions/${fn}/index.ts`)) {
    fail(`missing runtime source for ${fn}`);
  }
}

ok("10 canonical product functions present");

const config = read("supabase/config.toml");

const dbSection = config.match(
  /\[db\]([\s\S]*?)(?=\n\[|$)/
);

if (
  !dbSection ||
  !/major_version\s*=\s*17/.test(dbSection[1])
) {
  fail("PostgreSQL major_version must be pinned to 17");
}

ok("PostgreSQL major version pinned to 17");

for (const fn of productFunctions) {
  const marker = `[functions.${fn}]`;
  const start = config.indexOf(marker);

  if (start === -1) {
    fail(`missing config section ${marker}`);
  }

  const next = config.indexOf("\n[functions.", start + marker.length);
  const section = config.slice(
    start,
    next === -1 ? config.length : next
  );

  if (!/verify_jwt\s*=\s*false/.test(section)) {
    fail(`${fn} must explicitly declare verify_jwt = false`);
  }
}

ok("Edge Function auth configuration explicit");

const migrationDir = path.join(root, "supabase/migrations");

const migrations = fs.readdirSync(migrationDir)
  .filter((x) => x.endsWith(".sql"))
  .sort();

for (const required of canonicalMigrations) {
  if (!migrations.includes(required)) {
    fail(`canonical migration missing: ${required}`);
  }
}

for (const migration of migrations) {
  if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(migration)) {
    fail(`invalid migration filename: ${migration}`);
  }
}

const timestamps = migrations.map((x) => x.slice(0, 14));

if (new Set(timestamps).size !== timestamps.length) {
  fail("duplicate migration timestamp detected");
}

if (migrations.length < canonicalMigrations.length) {
  fail(
    `migration history shrank: ${migrations.length} < ${canonicalMigrations.length}`
  );
}

ok(
  `${migrations.length} migrations preserve canonical Stage 16 history`
);

const runtimeFiles = walk("supabase/functions")
  .filter((x) => /\.(ts|js|mjs)$/.test(x));

for (const file of runtimeFiles) {
  const source = read(file);

  if (source.includes("ufqtoyakmrddqytrkcje")) {
    fail(`production project ref hard-coded in runtime: ${file}`);
  }

  if (/https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1/i.test(source)) {
    fail(`Supabase Functions URL hard-coded in runtime: ${file}`);
  }
}

ok("runtime functions contain no project-specific Supabase URL");

if (!exists("scripts/configure-supabase-runtime.mjs")) {
  fail("runtime configuration helper missing");
}

ok("portable runtime configuration helper present");

const portableSsfMigration = read(
  "supabase/migrations/20261012133500_make_ssf_worker_schedule_portable.sql"
);

if (
  !portableSsfMigration.includes(
    "/* gate-portable-ssf-worker-v1 */"
  )
) {
  fail("portable SSF worker schedule marker missing");
}

ok("portable SSF worker schedule tagged");

const secretPatterns = [
  ["Stripe live key", /sk_live_[A-Za-z0-9]{8,}/],
  ["Stripe test key", /sk_test_[A-Za-z0-9]{8,}/],
  ["Stripe webhook secret", /whsec_[A-Za-z0-9]{8,}/],
  ["GATE API secret", /gate_sk_[A-Za-z0-9_-]{12,}/],
  ["private key PEM", /BEGIN (?:EC |RSA )?PRIVATE KEY/],
  ["private JWK material", /"d"\s*:\s*"[^"]{20,}"/]
];

const secretScanFiles = [
  ...walk("supabase"),
  ...walk("scripts")
].filter((file) =>
  /\.(ts|js|mjs|sql|toml|json)$/.test(file) &&
  file !== "scripts/validate-stage16-reproducibility.mjs"
);

for (const file of secretScanFiles) {
  const source = read(file);

  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(source)) {
      fail(`${label} candidate found in ${file}`);
    }
  }
}

ok("no obvious committed runtime secrets detected");

const manifest = read("docs/PRODUCTION-MANIFEST-V1.md");
const evidence = read("docs/SOURCE-EVIDENCE-CONTRACT-V1.md");

for (const phrase of [
  "Production / Product Truth",
  "Public Preview / Onboarding",
  "Internal QA / Canary",
  "Network v1 Boundary"
]) {
  if (!manifest.includes(phrase)) {
    fail(`production manifest missing section: ${phrase}`);
  }
}

for (const phrase of [
  "checkpoint-bounded",
  "poll-observed",
  "event-observed",
  "Fail-Closed Rule",
  "Alternate-Path Preservation"
]) {
  if (!evidence.includes(phrase)) {
    fail(`source evidence contract missing: ${phrase}`);
  }
}

ok("Network v1 architecture contracts contain required semantics");

console.log();
console.log("STAGE16 REPRODUCIBILITY INVARIANTS: PASS");
