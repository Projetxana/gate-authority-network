
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CANONICAL_URL = `${SUPABASE_URL}/functions/v1/gate-network`;
const EVENT_TYPE = "urn:gate:event:authority-edge-state:v1";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
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

function safeText(v: unknown, max = 300) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s && s.length <= max ? s : null;
}

function b64uDecode(s: string) {
  let x = s.replace(/-/g, "+").replace(/_/g, "/");
  while (x.length % 4) x += "=";
  return Uint8Array.from(atob(x), c => c.charCodeAt(0));
}

function parsePart(s: string) {
  return JSON.parse(new TextDecoder().decode(b64uDecode(s)));
}

function glob(pattern: string, value: string) {
  const re = pattern.split("*").map(x => x.replace(/[.+?^$()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp("^" + re + "$").test(value);
}

async function verifyEs256(token: string, jwk: any) {
  const p = token.split(".");
  if (p.length !== 3) throw new Error("invalid_compact_jws");
  const header = parsePart(p[0]);
  const payload = parsePart(p[1]);
  if (header.alg !== "ES256" || !header.kid) throw new Error("invalid_jws_header");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    b64uDecode(p[2]),
    new TextEncoder().encode(p[0] + "." + p[1])
  );
  if (!ok) throw new Error("invalid_signature");
  return { header, payload };
}

async function vaultStore(secret: string, name: string, description: string) {
  const d = await rest("rpc/gate_vault_store_secret", {
    method: "POST",
    body: JSON.stringify({ p_secret: secret, p_name: name, p_description: description })
  });
  return typeof d === "string" ? d : (Array.isArray(d) ? d[0] : d);
}

async function vaultRead(id: string) {
  const d = await rest("rpc/gate_vault_read_secret", {
    method: "POST",
    body: JSON.stringify({ p_secret_id: id })
  });
  const v = typeof d === "string" ? d : (Array.isArray(d) ? d[0] : d);
  if (!v) throw new Error("vault_secret_missing");
  return v;
}

async function canonical(path: string, apiKey: string, body: any, expected: number) {
  const r = await fetch(CANONICAL_URL + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + apiKey
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
  const d = await r.json().catch(() => null);
  if (r.status !== expected) {
    throw new Error("canonical_" + r.status + ":" + JSON.stringify(d));
  }
  return d;
}

async function registerSource(req: Request) {
  const a = await projectAuth(req);
  if (!a) return json({ ok: false, error: "invalid_api_key" }, 401);

  let b: any;
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const name = safeText(b?.name, 120) || "Signed authority source";
  const issuer = safeText(b?.issuer, 240);
  const jwk = b?.publicJwk;
  const patterns = Array.isArray(b?.principalPatterns)
    ? b.principalPatterns.map((x: any) => safeText(x, 160)).filter(Boolean)
    : [];

  if (!issuer || !jwk || jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y || !jwk.kid) {
    return json({ ok: false, error: "valid_es256_public_jwk_required" }, 400);
  }
  if (jwk.d !== undefined) {
    return json({ ok: false, error: "private_jwk_material_not_accepted" }, 400);
  }
  if (!patterns.length) {
    return json({ ok: false, error: "principal_patterns_required" }, 400);
  }

  try {
    await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
  } catch {
    return json({ ok: false, error: "invalid_public_jwk" }, 400);
  }

  const existing = await rest(
    "gate_signed_authority_sources?project_id=eq." + a.projectId +
    "&external_issuer=eq." + encodeURIComponent(issuer) +
    "&key_id=eq." + encodeURIComponent(jwk.kid) +
    "&status=neq.revoked&select=id"
  );
  if (Array.isArray(existing) && existing.length) {
    return json({ ok: false, error: "signed_source_already_registered" }, 409);
  }

  const sourceId = crypto.randomUUID();
  const keyRows = await rest("rpc/gate_create_api_key", {
    method: "POST",
    body: JSON.stringify({
      p_project_id: a.projectId,
      p_name: "signed-source:" + sourceId.slice(0, 8),
      p_expires_at: null
    })
  });
  const gateKey = Array.isArray(keyRows) ? keyRows[0] : null;
  if (!gateKey?.api_key_id || !gateKey?.api_key_secret) {
    throw new Error("source_api_key_create_failed");
  }

  const publicJwk = {
    kty: "EC",
    crv: "P-256",
    x: jwk.x,
    y: jwk.y,
    kid: jwk.kid,
    alg: "ES256",
    use: "sig"
  };

  let issuerReg: any;
  try {
    issuerReg = await canonical("/v1/issuers/register", gateKey.api_key_secret, {
      issuer,
      publicJwk,
      principalPatterns: patterns
    }, 201);
  } catch (e) {
    return json({
      ok: false,
      error: e instanceof Error ? e.message : "canonical_issuer_registration_failed"
    }, 409);
  }

  const gateSecretId = await vaultStore(
    gateKey.api_key_secret,
    "gate_signed_source_key_" + sourceId,
    "Dedicated canonical GATE API key for signed authority source " + sourceId
  );

  const rows = await rest("gate_signed_authority_sources", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      id: sourceId,
      project_id: a.projectId,
      name,
      external_issuer: issuer,
      key_id: jwk.kid,
      public_jwk: publicJwk,
      principal_patterns: patterns,
      gate_api_key_id: gateKey.api_key_id,
      gate_api_key_secret_id: gateSecretId,
      canonical_issuer_id: issuerReg.issuer.id
    })
  });
  const row = Array.isArray(rows) ? rows[0] : null;

  return json({
    ok: true,
    source: {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      adapter: "signed_push",
      sourceType: "signed_authority_feed",
      status: row.status,
      issuer: row.external_issuer,
      keyId: row.key_id,
      alg: "ES256",
      principalPatterns: row.principal_patterns,
      deliveryMethod: "urn:gate:delivery:signed-push:v1",
      eventType: EVENT_TYPE
    },
    privateKeyAccepted: false,
    privateKeyStoredByGate: false,
    canonicalForwardingCredentialStoredInVault: true
  }, 201);
}

async function listSources(req: Request) {
  const a = await projectAuth(req);
  if (!a) return json({ ok: false, error: "invalid_api_key" }, 401);
  const rows = await rest(
    "gate_signed_authority_sources?project_id=eq." + a.projectId +
    "&select=id,name,status,external_issuer,key_id,principal_patterns,last_event_at,last_success_at,last_error_at,last_error,created_at,updated_at" +
    "&order=created_at.desc"
  );
  return json({
    ok: true,
    sources: (rows || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      issuer: r.external_issuer,
      keyId: r.key_id,
      alg: "ES256",
      principalPatterns: r.principal_patterns,
      lastEventAt: r.last_event_at,
      lastSuccessAt: r.last_success_at,
      lastErrorAt: r.last_error_at,
      lastError: r.last_error,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }))
  });
}

async function updateSource(req: Request, id: string) {
  const a = await projectAuth(req);
  if (!a) return json({ ok: false, error: "invalid_api_key" }, 401);
  let b: any;
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  if (!["active", "paused"].includes(b?.status)) {
    return json({ ok: false, error: "status_must_be_active_or_paused" }, 400);
  }

  const rows = await rest(
    "gate_signed_authority_sources?id=eq." + encodeURIComponent(id) +
    "&project_id=eq." + a.projectId + "&select=id,status"
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return json({ ok: false, error: "source_not_found" }, 404);
  if (row.status === "revoked") return json({ ok: false, error: "source_revoked" }, 409);

  const updated = await rest(
    "gate_signed_authority_sources?id=eq." + encodeURIComponent(id) +
    "&project_id=eq." + a.projectId,
    {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        status: b.status,
        updated_at: new Date().toISOString()
      })
    }
  );
  const out = Array.isArray(updated) ? updated[0] : null;
  return json({ ok: true, source: { id: out.id, status: out.status, updatedAt: out.updated_at } });
}

function projectIdFromAudience(aud: any) {
  const values = Array.isArray(aud) ? aud : [aud];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const m = value.match(/^urn:gate:project:([0-9a-f-]{36})$/i);
    if (m) return m[1];
  }
  return null;
}

async function ingestEvent(req: Request) {
  let token = "";
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (ct.startsWith("application/secevent+jwt") || ct.startsWith("application/jwt")) {
    token = (await req.text()).trim();
  } else {
    let b: any;
    try { b = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
    token = String(b?.set || b?.token || "").trim();
  }
  if (!token) return json({ ok: false, error: "signed_event_required" }, 400);

  let header: any, payload: any;
  try {
    const p = token.split(".");
    if (p.length !== 3) throw new Error();
    header = parsePart(p[0]);
    payload = parsePart(p[1]);
  } catch {
    return json({ ok: false, error: "invalid_compact_jws" }, 400);
  }

  const issuer = safeText(payload?.iss, 240);
  const kid = safeText(header?.kid, 160);
  const projectId = projectIdFromAudience(payload?.aud);
  if (!issuer || !kid || !projectId) {
    return json({ ok: false, error: "signed_source_issuer_kid_and_project_audience_required" }, 400);
  }

  const rows = await rest(
    "gate_signed_authority_sources?project_id=eq." + encodeURIComponent(projectId) +
    "&external_issuer=eq." + encodeURIComponent(issuer) +
    "&key_id=eq." + encodeURIComponent(kid) +
    "&status=eq.active&select=*"
  );
  const source = Array.isArray(rows) ? rows[0] : null;
  if (!source) return json({ ok: false, error: "active_signed_source_not_found" }, 404);

  let verified: any;
  try {
    verified = await verifyEs256(token, source.public_jwk);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "signature_verification_failed" }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const iat = Number(verified.payload?.iat);
  const jti = safeText(verified.payload?.jti, 200);
  const ev = verified.payload?.events?.[EVENT_TYPE];

  if (!Number.isFinite(iat) || Math.abs(now - iat) > 600) {
    return json({ ok: false, error: "event_iat_outside_10m_window" }, 400);
  }
  if (!jti) return json({ ok: false, error: "event_jti_required" }, 400);
  if (!ev) return json({ ok: false, error: "unsupported_event_type" }, 400);

  const edgeId = safeText(ev.edge_id, 200);
  const issuerPrincipal = safeText(ev.issuer_principal, 240);
  const subjectPrincipal = safeText(ev.subject_principal, 240);
  const status = String(ev.status || "").toUpperCase();
  const sequence = Number(ev.sequence);

  if (!edgeId || !issuerPrincipal || !subjectPrincipal) {
    return json({ ok: false, error: "edge_fields_required" }, 400);
  }
  if (!["ACTIVE", "REVOKED", "UNKNOWN"].includes(status)) {
    return json({ ok: false, error: "invalid_authority_status" }, 400);
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    return json({ ok: false, error: "invalid_event_sequence" }, 400);
  }
  if (!(source.principal_patterns || []).some((p: string) => glob(p, issuerPrincipal))) {
    return json({ ok: false, error: "source_not_authorized_for_principal" }, 403);
  }

  const prior = await rest(
    "gate_signed_authority_source_events?source_id=eq." + source.id +
    "&jti=eq." + encodeURIComponent(jti) + "&select=id"
  );
  if (Array.isArray(prior) && prior.length) {
    return json({ ok: false, error: "signed_event_replay" }, 409);
  }

  try {
    const gateKey = await vaultRead(source.gate_api_key_secret_id);
    const accepted = await canonical("/v1/authority/events", gateKey, { set: token }, 202);

    const ts = new Date().toISOString();
    await rest("gate_signed_authority_source_events", {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        source_id: source.id,
        project_id: source.project_id,
        jti,
        edge_id: edgeId,
        status,
        sequence,
        signing_alg: "ES256",
        signing_kid: kid,
        processed_at: ts
      })
    });

    await rest("gate_signed_authority_sources?id=eq." + source.id, {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        last_event_at: ts,
        last_success_at: ts,
        last_error_at: null,
        last_error: null,
        updated_at: ts
      })
    });

    return json({
      ok: true,
      accepted: true,
      sourceId: source.id,
      canonical: accepted.event,
      privateKeyStoredByGate: false
    }, 202);
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await rest("gate_signed_authority_sources?id=eq." + source.id, {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        last_error_at: new Date().toISOString(),
        last_error: message,
        updated_at: new Date().toISOString()
      })
    });
    return json({ ok: false, error: message }, 409);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: H });

  try {
    const path = new URL(req.url).pathname;

    if (req.method === "GET" && path.endsWith("/health")) {
      return json({
        ok: true,
        service: "gate-signed-sources",
        stage: 15,
        adapter: "signed_push",
        sourceType: "signed_authority_feed",
        algorithm: "ES256",
        eventType: EVENT_TYPE,
        privateKeys: "external-only"
      });
    }

    if (req.method === "POST" && path.endsWith("/v1/sources")) return await registerSource(req);
    if (req.method === "GET" && path.endsWith("/v1/sources")) return await listSources(req);

    const m = path.match(/\/v1\/sources\/([0-9a-f-]{36})$/i);
    if (req.method === "PATCH" && m) return await updateSource(req, m[1]);

    if (req.method === "POST" && path.endsWith("/v1/events")) return await ingestEvent(req);

    return json({ ok: false, error: "not_found" }, 404);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: e instanceof Error ? e.message : "internal_error" }, 500);
  }
});
