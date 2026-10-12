
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Content-Type": "application/json"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: H });
}

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: "Bearer " + SERVICE_ROLE_KEY,
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
  const t = await r.text();
  let d: any = null;
  try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  if (!r.ok) throw new Error("supabase_" + r.status + ":" + (typeof d === "string" ? d : JSON.stringify(d)));
  return d;
}

function bearer(req: Request) {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

async function projectAuth(req: Request) {
  const secret = bearer(req);
  if (!secret) return null;
  const rows = await rest("rpc/gate_authenticate_api_key_v2", {
    method: "POST",
    body: JSON.stringify({ p_secret: secret })
  });
  const r = Array.isArray(rows) ? rows[0] : null;
  return r?.project_id ? { projectId: r.project_id, apiKeyId: r.api_key_id, plan: r.plan } : null;
}

function safeId(v: string) {
  return /^[0-9a-f-]{36}$/i.test(v);
}

function freshness(row: any) {
  const contract = row.freshness_contract || "poll_interval";
  const base = {
    contract,
    ageSeconds: null as number | null,
    staleAfterSeconds: row.stale_after_seconds
  };

  if (row.status === "paused") return { ...base, state: "paused" };
  if (row.status === "revoked") return { ...base, state: "revoked" };
  if (row.status === "error") return { ...base, state: "error" };

  if (row.last_error && row.last_error_at &&
      (!row.last_success_at || new Date(row.last_error_at).getTime() >= new Date(row.last_success_at).getTime())) {
    return { ...base, state: "error" };
  }

  if (!row.last_success_at) return { ...base, state: "unknown" };

  const age = Math.max(0, Math.floor((Date.now() - new Date(row.last_success_at).getTime()) / 1000));

  if (contract === "event_driven") {
    return {
      contract,
      state: "observed",
      ageSeconds: age,
      staleAfterSeconds: null,
      boundedFreshness: false,
      note: "Event-driven source activity is observed, not a heartbeat or issuer-freshness guarantee."
    };
  }

  if (contract === "checkpoint") {
    const stale = Number(row.stale_after_seconds || 180);
    if (age <= stale) return { contract, state: "fresh", ageSeconds: age, staleAfterSeconds: stale, boundedFreshness: true };
    return { contract, state: "stale", ageSeconds: age, staleAfterSeconds: stale, boundedFreshness: true };
  }

  const poll = Number(row.poll_interval_seconds || 60);
  const stale = Number(row.stale_after_seconds || Math.max(180, poll * 3));
  if (age <= poll * 2) return { contract, state: "fresh", ageSeconds: age, staleAfterSeconds: stale, boundedFreshness: true };
  if (age <= stale) return { contract, state: "aging", ageSeconds: age, staleAfterSeconds: stale, boundedFreshness: true };
  return { contract, state: "stale", ageSeconds: age, staleAfterSeconds: stale, boundedFreshness: true };
}

async function latestSourceEvent(source: any) {
  if (source.adapter === "ssf") {
    const rows = await rest(
      "gate_ssf_connector_events?connector_id=eq." + encodeURIComponent(source.adapter_resource_id) +
      "&select=event_type,signing_alg,signing_kid,subject_present,canonical_status,canonical_sequence,received_at,processed_at" +
      "&order=processed_at.desc.nullslast,received_at.desc&limit=1"
    );
    const e = Array.isArray(rows) ? rows[0] : null;
    if (!e) return null;
    return {
      eventType: e.event_type,
      signingAlg: e.signing_alg,
      signingKid: e.signing_kid,
      subjectPresent: e.subject_present,
      canonicalStatus: e.canonical_status,
      canonicalSequence: e.canonical_sequence,
      receivedAt: e.received_at,
      processedAt: e.processed_at
    };
  }

  if (source.adapter === "signed_push") {
    const rows = await rest(
      "gate_signed_authority_source_events?source_id=eq." + encodeURIComponent(source.adapter_resource_id) +
      "&select=edge_id,status,sequence,signing_alg,signing_kid,received_at,processed_at" +
      "&order=processed_at.desc.nullslast,received_at.desc&limit=1"
    );
    const e = Array.isArray(rows) ? rows[0] : null;
    if (!e) return null;
    return {
      eventType: "urn:gate:event:authority-edge-state:v1",
      edgeId: e.edge_id,
      signingAlg: e.signing_alg,
      signingKid: e.signing_kid,
      canonicalStatus: e.status,
      canonicalSequence: e.sequence,
      receivedAt: e.received_at,
      processedAt: e.processed_at
    };
  }

  return null;
}

async function present(source: any) {
  const lastEvent = await latestSourceEvent(source);
  return {
    id: source.id,
    projectId: source.project_id,
    adapter: source.adapter,
    sourceType: source.source_type,
    name: source.name,
    status: source.status,
    externalIssuer: source.external_issuer,
    deliveryMethod: source.delivery_method,
    adapterResourceId: source.adapter_resource_id,
    pollIntervalSeconds: source.poll_interval_seconds,
    freshnessContract: source.freshness_contract,
    ingestionFreshness: freshness(source),
    lastPollAt: source.last_poll_at,
    lastSuccessAt: source.last_success_at,
    lastEventAt: source.last_event_at,
    lastErrorAt: source.last_error_at,
    lastError: source.last_error,
    provenance: source.provenance || {},
    lastVerifiedEvent: lastEvent,
    createdAt: source.created_at,
    updatedAt: source.updated_at
  };
}

async function rowsForProject(projectId: string) {
  const rows = await rest(
    "gate_authority_sources?project_id=eq." + encodeURIComponent(projectId) +
    "&select=*&order=created_at.desc"
  );
  return Array.isArray(rows) ? rows : [];
}

async function listSources(req: Request) {
  const a = await projectAuth(req);
  if (!a) return json({ ok: false, error: "invalid_api_key" }, 401);
  const rows = await rowsForProject(a.projectId);
  const sources = await Promise.all(rows.map(present));
  return json({
    ok: true,
    projectId: a.projectId,
    plan: a.plan,
    sources
  });
}

async function getSource(req: Request, id: string) {
  const a = await projectAuth(req);
  if (!a) return json({ ok: false, error: "invalid_api_key" }, 401);
  if (!safeId(id)) return json({ ok: false, error: "invalid_source_id" }, 400);
  const rows = await rest(
    "gate_authority_sources?id=eq." + encodeURIComponent(id) +
    "&project_id=eq." + encodeURIComponent(a.projectId) +
    "&select=*"
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return json({ ok: false, error: "source_not_found" }, 404);
  return json({ ok: true, source: await present(row) });
}

async function summary(req: Request) {
  const a = await projectAuth(req);
  if (!a) return json({ ok: false, error: "invalid_api_key" }, 401);
  const rows = await rowsForProject(a.projectId);
  const health: Record<string, number> = {
    fresh: 0, aging: 0, stale: 0, observed: 0, error: 0, unknown: 0, paused: 0, revoked: 0
  };
  const adapters: Record<string, number> = {};
  const issuers = new Set<string>();
  for (const row of rows) {
    const state = freshness(row).state;
    health[state] = (health[state] || 0) + 1;
    adapters[row.adapter] = (adapters[row.adapter] || 0) + 1;
    if (row.external_issuer) issuers.add(row.external_issuer);
  }
  return json({
    ok: true,
    projectId: a.projectId,
    plan: a.plan,
    density: {
      totalSources: rows.length,
      activeSources: rows.filter((r: any) => r.status === "active").length,
      distinctExternalIssuers: issuers.size,
      adapters,
      ingestionHealth: health
    }
  });
}

async function updateSource(req: Request, id: string) {
  const a = await projectAuth(req);
  if (!a) return json({ ok: false, error: "invalid_api_key" }, 401);
  if (!safeId(id)) return json({ ok: false, error: "invalid_source_id" }, 400);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  if (!body || !["active", "paused"].includes(body.status)) {
    return json({ ok: false, error: "status_must_be_active_or_paused" }, 400);
  }

  const rows = await rest(
    "gate_authority_sources?id=eq." + encodeURIComponent(id) +
    "&project_id=eq." + encodeURIComponent(a.projectId) +
    "&select=*"
  );
  const source = Array.isArray(rows) ? rows[0] : null;
  if (!source) return json({ ok: false, error: "source_not_found" }, 404);
  if (source.status === "revoked") return json({ ok: false, error: "source_revoked" }, 409);

  if (source.adapter === "ssf") {
    await rest(
      "gate_ssf_connectors?id=eq." + encodeURIComponent(source.adapter_resource_id) +
      "&project_id=eq." + encodeURIComponent(a.projectId),
      {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify({
          status: body.status,
          lease_until: null,
          updated_at: new Date().toISOString()
        })
      }
    );
  } else if (source.adapter === "signed_push") {
    await rest(
      "gate_signed_authority_sources?id=eq." + encodeURIComponent(source.adapter_resource_id) +
      "&project_id=eq." + encodeURIComponent(a.projectId),
      {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify({ status: body.status, updated_at: new Date().toISOString() })
      }
    );
  } else {
    await rest(
      "gate_authority_sources?id=eq." + encodeURIComponent(id) +
      "&project_id=eq." + encodeURIComponent(a.projectId),
      {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify({ status: body.status, updated_at: new Date().toISOString() })
      }
    );
  }

  const updated = await rest(
    "gate_authority_sources?id=eq." + encodeURIComponent(id) +
    "&project_id=eq." + encodeURIComponent(a.projectId) +
    "&select=*"
  );
  return json({ ok: true, source: await present(updated[0]) });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: H });

  try {
    const path = new URL(req.url).pathname;

    if (req.method === "GET" && path.endsWith("/health")) {
      return json({
        ok: true,
        service: "gate-source-registry",
        stage: 15,
        model: "project-scoped authority source registry",
        freshness: "poll/checkpoint sources may have bounded ingestion freshness; event-driven sources report observed activity only; canonical issuer freshness remains separate"
      });
    }

    if (req.method === "GET" && path.endsWith("/v1/sources/summary")) {
      return await summary(req);
    }

    if (req.method === "GET" && path.endsWith("/v1/sources")) {
      return await listSources(req);
    }

    const m = path.match(/\/v1\/sources\/([0-9a-f-]{36})$/i);
    if (req.method === "GET" && m) return await getSource(req, m[1]);
    if (req.method === "PATCH" && m) return await updateSource(req, m[1]);

    return json({ ok: false, error: "not_found" }, 404);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: e instanceof Error ? e.message : "internal_error" }, 500);
  }
});
